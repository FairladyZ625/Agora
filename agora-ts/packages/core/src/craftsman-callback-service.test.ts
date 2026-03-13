import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createAgoraDatabase,
  runMigrations,
  CraftsmanExecutionRepository,
  FlowLogRepository,
  NotificationOutboxRepository,
  ProgressLogRepository,
  SubtaskRepository,
  TaskConversationRepository,
  TaskContextBindingRepository,
  TaskRepository,
} from '@agora-ts/db';
import { CraftsmanCallbackService } from './craftsman-callback-service.js';

const tempPaths: string[] = [];

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-craftsman-callback-'));
  tempPaths.push(dir);
  return join(dir, 'tasks.db');
}

afterEach(() => {
  while (tempPaths.length > 0) {
    const dir = tempPaths.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('craftsman callback service', () => {
  it('closes a successful execution and marks the subtask done', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const tasks = new TaskRepository(db);
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);
    const flowLogs = new FlowLogRepository(db);
    const progressLogs = new ProgressLogRepository(db);
    const callback = new CraftsmanCallbackService(db);

    tasks.insertTask({
      id: 'OC-970',
      title: 'callback success',
      description: '',
      type: 'coding',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: { stages: [{ id: 'develop' }] },
    });
    subtasks.insertSubtask({
      id: 'sub-codex',
      task_id: 'OC-970',
      stage_id: 'develop',
      title: 'run codex',
      assignee: 'sonnet',
      craftsman_type: 'codex',
      dispatch_status: 'running',
      craftsman_session: 'codex-session-1',
    });
    executions.insertExecution({
      execution_id: 'exec-970',
      task_id: 'OC-970',
      subtask_id: 'sub-codex',
      adapter: 'codex',
      mode: 'task',
      session_id: 'codex-session-1',
      status: 'running',
      workdir: '/tmp/codex',
      callback_payload: null,
      error: null,
      started_at: '2026-03-08T13:00:00.000Z',
    });

    const result = callback.handleCallback({
      execution_id: 'exec-970',
      status: 'succeeded',
      session_id: 'codex-session-1',
      payload: {
        output: {
          summary: 'implemented the endpoint',
          artifacts: ['src/api.ts'],
          structured: {
            files: ['src/api.ts'],
          },
        },
      },
      error: null,
      finished_at: '2026-03-08T13:03:00.000Z',
    });

    expect(result.execution).toMatchObject({
      execution_id: 'exec-970',
      status: 'succeeded',
      callback_payload: {
        output: {
          summary: 'implemented the endpoint',
          artifacts: ['src/api.ts'],
          structured: {
            files: ['src/api.ts'],
          },
        },
      },
    });
    expect(result.subtask).toMatchObject({
      id: 'sub-codex',
      status: 'done',
      dispatch_status: 'succeeded',
      output: 'implemented the endpoint',
      done_at: '2026-03-08T13:03:00.000Z',
    });
    expect(flowLogs.listByTask('OC-970')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'subtask_done',
          stage_id: 'develop',
        }),
      ]),
    );
    expect(progressLogs.listByTask('OC-970')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          subtask_id: 'sub-codex',
          actor: 'codex',
          content: 'implemented the endpoint',
        }),
      ]),
    );
  });

  it('records failed callbacks and marks the subtask failed', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const tasks = new TaskRepository(db);
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);
    const flowLogs = new FlowLogRepository(db);
    const callback = new CraftsmanCallbackService(db);

    tasks.insertTask({
      id: 'OC-971',
      title: 'callback failure',
      description: '',
      type: 'coding',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: { stages: [{ id: 'develop' }] },
    });
    subtasks.insertSubtask({
      id: 'sub-codex',
      task_id: 'OC-971',
      stage_id: 'develop',
      title: 'run codex',
      assignee: 'sonnet',
      craftsman_type: 'codex',
      dispatch_status: 'running',
    });
    executions.insertExecution({
      execution_id: 'exec-971',
      task_id: 'OC-971',
      subtask_id: 'sub-codex',
      adapter: 'codex',
      mode: 'task',
      session_id: 'codex-session-2',
      status: 'running',
      callback_payload: null,
      error: null,
      started_at: '2026-03-08T13:05:00.000Z',
    });

    const result = callback.handleCallback({
      execution_id: 'exec-971',
      status: 'failed',
      session_id: 'codex-session-2',
      payload: {
        output: {
          summary: null,
          stderr: 'test failures',
          artifacts: [],
          structured: null,
        },
      },
      error: 'test failures',
      finished_at: '2026-03-08T13:06:00.000Z',
    });

    expect(result.execution).toMatchObject({
      status: 'failed',
      error: 'test failures',
    });
    expect(result.subtask).toMatchObject({
      status: 'failed',
      dispatch_status: 'failed',
      output: 'test failures',
      done_at: null,
    });
    expect(flowLogs.listByTask('OC-971')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'subtask_failed',
          stage_id: 'develop',
        }),
      ]),
    );
  });

  it('treats duplicate callbacks as idempotent and does not duplicate logs', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const tasks = new TaskRepository(db);
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);
    const flowLogs = new FlowLogRepository(db);
    const progressLogs = new ProgressLogRepository(db);
    const callback = new CraftsmanCallbackService(db);

    tasks.insertTask({
      id: 'OC-972',
      title: 'callback duplicate',
      description: '',
      type: 'coding',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: { stages: [{ id: 'develop' }] },
    });
    subtasks.insertSubtask({
      id: 'sub-codex',
      task_id: 'OC-972',
      stage_id: 'develop',
      title: 'run codex',
      assignee: 'sonnet',
      craftsman_type: 'codex',
      dispatch_status: 'running',
    });
    executions.insertExecution({
      execution_id: 'exec-972',
      task_id: 'OC-972',
      subtask_id: 'sub-codex',
      adapter: 'codex',
      mode: 'task',
      session_id: 'codex-session-3',
      status: 'running',
      callback_payload: null,
      error: null,
      started_at: '2026-03-08T13:10:00.000Z',
    });

    callback.handleCallback({
      execution_id: 'exec-972',
      status: 'succeeded',
      session_id: 'codex-session-3',
      payload: {
        output: {
          summary: 'done once',
          artifacts: [],
        },
      },
      error: null,
      finished_at: '2026-03-08T13:12:00.000Z',
    });

    const firstFlowCount = flowLogs.listByTask('OC-972').length;
    const firstProgressCount = progressLogs.listByTask('OC-972').length;

    const result = callback.handleCallback({
      execution_id: 'exec-972',
      status: 'succeeded',
      session_id: 'codex-session-3',
      payload: {
        output: {
          summary: 'done once',
          artifacts: [],
        },
      },
      error: null,
      finished_at: '2026-03-08T13:12:00.000Z',
    });

    expect(result.execution.status).toBe('succeeded');
    expect(flowLogs.listByTask('OC-972')).toHaveLength(firstFlowCount);
    expect(progressLogs.listByTask('OC-972')).toHaveLength(firstProgressCount);
  });

  it('defers callback settlement while the task is paused', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const tasks = new TaskRepository(db);
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);
    const flowLogs = new FlowLogRepository(db);
    const progressLogs = new ProgressLogRepository(db);
    const callback = new CraftsmanCallbackService(db);

    tasks.insertTask({
      id: 'OC-973',
      title: 'callback paused',
      description: '',
      type: 'coding',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: { stages: [{ id: 'develop' }] },
    });
    tasks.updateTask('OC-973', 1, { state: 'created' });
    tasks.updateTask('OC-973', 2, { state: 'active', current_stage: 'develop' });
    tasks.updateTask('OC-973', 3, { state: 'paused', error_detail: 'hold' });
    subtasks.insertSubtask({
      id: 'sub-codex',
      task_id: 'OC-973',
      stage_id: 'develop',
      title: 'run codex later',
      assignee: 'sonnet',
      status: 'in_progress',
      craftsman_type: 'codex',
      dispatch_status: 'running',
      craftsman_session: 'codex-session-4',
    });
    executions.insertExecution({
      execution_id: 'exec-973',
      task_id: 'OC-973',
      subtask_id: 'sub-codex',
      adapter: 'codex',
      mode: 'task',
      session_id: 'codex-session-4',
      status: 'running',
      callback_payload: null,
      error: null,
      started_at: '2026-03-08T13:15:00.000Z',
    });

    const result = callback.handleCallback({
      execution_id: 'exec-973',
      status: 'succeeded',
      session_id: 'codex-session-4',
      payload: {
        output: {
          summary: 'done while paused',
          artifacts: [],
        },
      },
      error: null,
      finished_at: '2026-03-08T13:16:00.000Z',
    });

    expect(result.execution).toMatchObject({
      execution_id: 'exec-973',
      status: 'succeeded',
      callback_payload: {
        output: {
          summary: 'done while paused',
          artifacts: [],
        },
      },
    });
    expect(result.subtask).toMatchObject({
      id: 'sub-codex',
      status: 'in_progress',
      dispatch_status: 'running',
    });
    expect(flowLogs.listByTask('OC-973')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'craftsman_callback_deferred',
          stage_id: 'develop',
        }),
      ]),
    );
    expect(progressLogs.listByTask('OC-973')).toEqual([]);
  });

  it('enqueues a notification when an active binding exists', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const tasks = new TaskRepository(db);
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);
    const bindings = new TaskContextBindingRepository(db);
    const outbox = new NotificationOutboxRepository(db);
    const conversations = new TaskConversationRepository(db);
    const callback = new CraftsmanCallbackService(db);

    tasks.insertTask({
      id: 'OC-974',
      title: 'callback with binding',
      description: '',
      type: 'coding',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: { stages: [{ id: 'develop' }] },
    });
    bindings.insert({
      id: 'bind-974',
      task_id: 'OC-974',
      im_provider: 'discord',
      thread_ref: 'thread-974',
      status: 'active',
    });
    subtasks.insertSubtask({
      id: 'sub-codex',
      task_id: 'OC-974',
      stage_id: 'develop',
      title: 'run codex',
      assignee: 'sonnet',
      craftsman_type: 'codex',
      dispatch_status: 'running',
      craftsman_session: 'codex-session-5',
    });
    executions.insertExecution({
      execution_id: 'exec-974',
      task_id: 'OC-974',
      subtask_id: 'sub-codex',
      adapter: 'codex',
      mode: 'task',
      session_id: 'codex-session-5',
      status: 'running',
      workdir: '/tmp/codex',
      callback_payload: null,
      error: null,
      started_at: '2026-03-08T14:00:00.000Z',
    });

    callback.handleCallback({
      execution_id: 'exec-974',
      status: 'succeeded',
      session_id: 'codex-session-5',
      payload: {
        output: {
          summary: 'done with binding',
          artifacts: [],
        },
      },
      error: null,
      finished_at: '2026-03-08T14:01:00.000Z',
    });

    const notifications = outbox.listByTask('OC-974');
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      task_id: 'OC-974',
      event_type: 'craftsman_completed',
      target_binding_id: 'bind-974',
      status: 'pending',
      payload: expect.objectContaining({
        execution_id: 'exec-974',
        subtask_id: 'sub-codex',
        adapter: 'codex',
        status: 'succeeded',
      }),
    });
    expect(conversations.listByTask('OC-974')).toEqual([
      expect.objectContaining({
        task_id: 'OC-974',
        binding_id: 'bind-974',
        provider: 'discord',
        direction: 'system',
        author_kind: 'craftsman',
        author_ref: 'codex',
        body: 'done with binding',
        metadata: expect.objectContaining({
          event_type: 'craftsman_completed',
          execution_id: 'exec-974',
          subtask_id: 'sub-codex',
        }),
      }),
    ]);
  });

  it('records input-required callbacks without settling the subtask', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const tasks = new TaskRepository(db);
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);
    const bindings = new TaskContextBindingRepository(db);
    const outbox = new NotificationOutboxRepository(db);
    const conversations = new TaskConversationRepository(db);
    const callback = new CraftsmanCallbackService(db);

    tasks.insertTask({
      id: 'OC-975',
      title: 'callback needs input',
      description: '',
      type: 'coding',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: { stages: [{ id: 'develop' }] },
    });
    bindings.insert({
      id: 'bind-975',
      task_id: 'OC-975',
      im_provider: 'discord',
      thread_ref: 'thread-975',
      status: 'active',
    });
    subtasks.insertSubtask({
      id: 'sub-codex',
      task_id: 'OC-975',
      stage_id: 'develop',
      title: 'run codex',
      assignee: 'sonnet',
      craftsman_type: 'codex',
      dispatch_status: 'running',
      craftsman_session: 'codex-session-need-input',
    });
    executions.insertExecution({
      execution_id: 'exec-975',
      task_id: 'OC-975',
      subtask_id: 'sub-codex',
      adapter: 'codex',
      mode: 'task',
      session_id: 'codex-session-need-input',
      status: 'running',
      callback_payload: null,
      error: null,
      started_at: '2026-03-13T12:00:00.000Z',
    });

    const result = callback.handleCallback({
      execution_id: 'exec-975',
      status: 'needs_input',
      session_id: 'codex-session-need-input',
      payload: {
        output: {
          summary: 'Need your decision before patching.',
          artifacts: [],
        },
        input_request: {
          transport: 'choice',
          hint: 'Choose whether to continue with the patch.',
          choice_options: [
            { id: 'continue', label: 'Continue', keys: ['Down'], submit: true },
            { id: 'abort', label: 'Abort', keys: ['Escape'], submit: false },
          ],
        },
      },
      error: null,
      finished_at: null,
    });

    expect(result.execution).toMatchObject({
      execution_id: 'exec-975',
      status: 'needs_input',
      finished_at: null,
      callback_payload: {
        input_request: {
          transport: 'choice',
        },
      },
    });
    expect(result.subtask).toMatchObject({
      id: 'sub-codex',
      status: 'in_progress',
      dispatch_status: 'needs_input',
      done_at: null,
    });
    expect(outbox.listByTask('OC-975')).toEqual([
      expect.objectContaining({
        event_type: 'craftsman_needs_input',
        payload: expect.objectContaining({
          status: 'needs_input',
        }),
      }),
    ]);
    expect(conversations.listByTask('OC-975')).toEqual([
      expect.objectContaining({
        body: 'Need your decision before patching.',
        metadata: expect.objectContaining({
          event_type: 'craftsman_needs_input',
          status: 'needs_input',
        }),
      }),
    ]);
  });
});
