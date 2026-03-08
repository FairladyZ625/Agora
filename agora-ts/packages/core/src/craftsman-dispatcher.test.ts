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
      mode: 'task',
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
      mode: 'task',
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
});
