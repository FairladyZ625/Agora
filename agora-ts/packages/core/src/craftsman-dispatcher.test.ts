import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createAgoraDatabase,
  runMigrations,
  CraftsmanExecutionRepository,
  SubtaskRepository,
  TaskRepository,
} from '@agora-ts/db';
import { CraftsmanDispatcher } from './craftsman-dispatcher.js';

const tempPaths: string[] = [];

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-craftsman-dispatcher-'));
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

describe('craftsman dispatcher', () => {
  it('creates execution records and updates subtask dispatch state on success', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const tasks = new TaskRepository(db);
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);
    const dispatcher = new CraftsmanDispatcher(db, {
      adapters: {
        codex: {
          name: 'codex',
          dispatchTask: () => ({
            status: 'running',
            session_id: 'codex-session-1',
            started_at: '2026-03-08T12:00:00.000Z',
          }),
        },
      },
    });

    tasks.insertTask({
      id: 'OC-960',
      title: 'dispatch skeleton',
      description: '',
      type: 'coding',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: { stages: [{ id: 'develop' }] },
    });
    subtasks.insertSubtask({
      id: 'sub-codex',
      task_id: 'OC-960',
      stage_id: 'develop',
      title: 'run codex',
      assignee: 'sonnet',
      craftsman_type: 'codex',
    });

    const result = dispatcher.dispatchSubtask({
      task_id: 'OC-960',
      stage_id: 'develop',
      subtask_id: 'sub-codex',
      adapter: 'codex',
      mode: 'one_shot',
      workdir: '/tmp/codex',
      prompt: 'Implement the feature',
    });

    expect(result.execution).toMatchObject({
      task_id: 'OC-960',
      subtask_id: 'sub-codex',
      adapter: 'codex',
      status: 'running',
      session_id: 'codex-session-1',
    });
    expect(executions.getExecution(result.execution.execution_id)).toMatchObject({
      status: 'running',
      session_id: 'codex-session-1',
      started_at: '2026-03-08T12:00:00.000Z',
    });
    expect(subtasks.listByTask('OC-960')).toEqual([
      expect.objectContaining({
        id: 'sub-codex',
        craftsman_type: 'codex',
        craftsman_session: 'codex-session-1',
        craftsman_workdir: '/tmp/codex',
        craftsman_prompt: 'Implement the feature',
        dispatch_status: 'running',
      }),
    ]);
  });

  it('persists failed dispatch attempts when adapter raises', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const tasks = new TaskRepository(db);
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);
    const dispatcher = new CraftsmanDispatcher(db, {
      adapters: {
        codex: {
          name: 'codex',
          dispatchTask: () => {
            throw new Error('cli unavailable');
          },
        },
      },
    });

    tasks.insertTask({
      id: 'OC-961',
      title: 'dispatch failure',
      description: '',
      type: 'coding',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: { stages: [{ id: 'develop' }] },
    });
    subtasks.insertSubtask({
      id: 'sub-codex',
      task_id: 'OC-961',
      stage_id: 'develop',
      title: 'run codex',
      assignee: 'sonnet',
      craftsman_type: 'codex',
    });

    expect(() => dispatcher.dispatchSubtask({
      task_id: 'OC-961',
      stage_id: 'develop',
      subtask_id: 'sub-codex',
      adapter: 'codex',
      mode: 'one_shot',
      workdir: '/tmp/codex',
      prompt: 'Implement the feature',
    })).toThrow('cli unavailable');

    const [failedExecution] = executions.listBySubtask('OC-961', 'sub-codex');
    expect(failedExecution).toMatchObject({
      status: 'failed',
      error: 'cli unavailable',
    });
    expect(subtasks.listByTask('OC-961')).toEqual([
      expect.objectContaining({
        id: 'sub-codex',
        dispatch_status: 'failed',
      }),
    ]);
  });

  it('persists adapter payload metadata for execution observability', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const tasks = new TaskRepository(db);
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);
    const dispatcher = new CraftsmanDispatcher(db, {
      adapters: {
        codex: {
          name: 'codex',
          dispatchTask: () => ({
            status: 'running',
            session_id: 'tmux:agora-craftsmen:codex',
            started_at: '2026-03-08T13:00:00.000Z',
            payload: {
              runtime_mode: 'tmux',
              transport: 'tmux-pane',
              pane: '%0',
            },
          }),
        },
      },
    });

    tasks.insertTask({
      id: 'OC-962',
      title: 'dispatch observability',
      description: '',
      type: 'coding',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: { stages: [{ id: 'develop' }] },
    });
    subtasks.insertSubtask({
      id: 'sub-codex',
      task_id: 'OC-962',
      stage_id: 'develop',
      title: 'run codex',
      assignee: 'sonnet',
      craftsman_type: 'codex',
    });

    const result = dispatcher.dispatchSubtask({
      task_id: 'OC-962',
      stage_id: 'develop',
      subtask_id: 'sub-codex',
      adapter: 'codex',
      mode: 'one_shot',
      workdir: '/tmp/codex',
      prompt: 'Implement the feature',
    });

    expect(result.execution).toMatchObject({
      callback_payload: {
        runtime_mode: 'tmux',
        transport: 'tmux-pane',
        pane: '%0',
      },
      started_at: '2026-03-08T13:00:00.000Z',
    });
    expect(executions.getExecution(result.execution.execution_id)?.callback_payload).toEqual({
      runtime_mode: 'tmux',
      transport: 'tmux-pane',
      pane: '%0',
    });
  });

  it('rejects dispatch when active execution concurrency limit is reached', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const tasks = new TaskRepository(db);
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);
    const dispatcher = new CraftsmanDispatcher(db, {
      maxConcurrentRunning: 1,
      adapters: {
        codex: {
          name: 'codex',
          dispatchTask: () => ({
            status: 'running',
            session_id: 'codex-session-overflow',
            started_at: '2026-03-09T16:00:00.000Z',
          }),
        },
      },
    });

    tasks.insertTask({
      id: 'OC-963',
      title: 'dispatch concurrency',
      description: '',
      type: 'coding',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: { stages: [{ id: 'develop' }] },
    });
    subtasks.insertSubtask({
      id: 'sub-codex-1',
      task_id: 'OC-963',
      stage_id: 'develop',
      title: 'run codex 1',
      assignee: 'sonnet',
      craftsman_type: 'codex',
    });
    subtasks.insertSubtask({
      id: 'sub-codex-2',
      task_id: 'OC-963',
      stage_id: 'develop',
      title: 'run codex 2',
      assignee: 'sonnet',
      craftsman_type: 'codex',
    });

    dispatcher.dispatchSubtask({
      task_id: 'OC-963',
      stage_id: 'develop',
      subtask_id: 'sub-codex-1',
      adapter: 'codex',
      mode: 'one_shot',
      workdir: '/tmp/codex-1',
      prompt: 'Implement feature 1',
    });

    expect(() => dispatcher.dispatchSubtask({
      task_id: 'OC-963',
      stage_id: 'develop',
      subtask_id: 'sub-codex-2',
      adapter: 'codex',
      mode: 'one_shot',
      workdir: '/tmp/codex-2',
      prompt: 'Implement feature 2',
    })).toThrow('craftsman concurrency limit exceeded: max 1 active executions');

    expect(executions.countActiveExecutions()).toBe(1);
    expect(subtasks.listByTask('OC-963')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'sub-codex-1', dispatch_status: 'running' }),
        expect.objectContaining({ id: 'sub-codex-2', dispatch_status: null }),
      ]),
    );
  });

  it('rewrites repo workdirs through the configured workdir isolator', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const tasks = new TaskRepository(db);
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);
    const dispatcher = new CraftsmanDispatcher(db, {
      executionIdGenerator: () => 'exec-isolated-1',
      workdirIsolator: {
        isolate: () => '/tmp/isolated/codex/OC-964/sub-codex-exec-isolated-1',
      },
      adapters: {
        codex: {
          name: 'codex',
          dispatchTask: (request) => ({
            status: 'running',
            session_id: `cwd:${request.workdir}`,
            started_at: '2026-03-09T17:00:00.000Z',
          }),
        },
      },
    });

    tasks.insertTask({
      id: 'OC-964',
      title: 'dispatch isolated workdir',
      description: '',
      type: 'coding',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: { stages: [{ id: 'develop' }] },
    });
    subtasks.insertSubtask({
      id: 'sub-codex',
      task_id: 'OC-964',
      stage_id: 'develop',
      title: 'run codex in isolated cwd',
      assignee: 'sonnet',
      craftsman_type: 'codex',
    });

    const result = dispatcher.dispatchSubtask({
      task_id: 'OC-964',
      stage_id: 'develop',
      subtask_id: 'sub-codex',
      adapter: 'codex',
      mode: 'one_shot',
      workdir: '/repo/root',
      prompt: 'Implement feature',
    });

    expect(result.execution).toMatchObject({
      workdir: '/tmp/isolated/codex/OC-964/sub-codex-exec-isolated-1',
      session_id: 'cwd:/tmp/isolated/codex/OC-964/sub-codex-exec-isolated-1',
    });
    expect(executions.getExecution('exec-isolated-1')).toMatchObject({
      workdir: '/tmp/isolated/codex/OC-964/sub-codex-exec-isolated-1',
    });
    expect(subtasks.listByTask('OC-964')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'sub-codex',
          craftsman_workdir: '/tmp/isolated/codex/OC-964/sub-codex-exec-isolated-1',
        }),
      ]),
    );
  });
});
