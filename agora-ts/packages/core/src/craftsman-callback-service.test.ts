import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createAgoraDatabase,
  runMigrations,
  CraftsmanExecutionRepository,
  FlowLogRepository,
  ProgressLogRepository,
  SubtaskRepository,
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
        summary: 'implemented the endpoint',
        artifacts: ['src/api.ts'],
      },
      error: null,
      finished_at: '2026-03-08T13:03:00.000Z',
    });

    expect(result.execution).toMatchObject({
      execution_id: 'exec-970',
      status: 'succeeded',
      callback_payload: {
        summary: 'implemented the endpoint',
        artifacts: ['src/api.ts'],
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
      payload: { stderr: 'test failures' },
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
      payload: { summary: 'done once' },
      error: null,
      finished_at: '2026-03-08T13:12:00.000Z',
    });

    const firstFlowCount = flowLogs.listByTask('OC-972').length;
    const firstProgressCount = progressLogs.listByTask('OC-972').length;

    const result = callback.handleCallback({
      execution_id: 'exec-972',
      status: 'succeeded',
      session_id: 'codex-session-3',
      payload: { summary: 'done once' },
      error: null,
      finished_at: '2026-03-08T13:12:00.000Z',
    });

    expect(result.execution.status).toBe('succeeded');
    expect(flowLogs.listByTask('OC-972')).toHaveLength(firstFlowCount);
    expect(progressLogs.listByTask('OC-972')).toHaveLength(firstProgressCount);
  });
});
