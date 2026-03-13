import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgoraDatabase, runMigrations } from '../database.js';
import { CraftsmanExecutionRepository } from './craftsman-execution.repository.js';
import { SubtaskRepository } from './subtask.repository.js';
import { TaskRepository } from './task.repository.js';

const tempPaths: string[] = [];

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-craftsman-execution-'));
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

describe('craftsman execution repository', () => {
  it('stores, lists, and updates execution records for a subtask', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);

    const tasks = new TaskRepository(db);
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);

    tasks.insertTask({
      id: 'OC-700',
      title: 'Implement craftsmen runtime',
      description: '',
      type: 'coding',
      priority: 'high',
      creator: 'archon',
      team: { members: [] },
      workflow: { stages: [{ id: 'develop' }] },
    });
    subtasks.insertSubtask({
      id: 'dispatch-codex',
      task_id: 'OC-700',
      stage_id: 'develop',
      title: 'Dispatch codex execution',
      assignee: 'sonnet',
      craftsman_type: 'codex',
      dispatch_status: 'queued',
    });

    const created = executions.insertExecution({
      execution_id: 'exec-700',
      task_id: 'OC-700',
      subtask_id: 'dispatch-codex',
      adapter: 'codex',
      mode: 'one_shot',
      session_id: null,
      status: 'queued',
      brief_path: '/tmp/brief.md',
      workdir: '/tmp/worktree',
      callback_payload: null,
      error: null,
      started_at: '2026-03-08T10:00:00.000Z',
      finished_at: null,
    });

    const updated = executions.updateExecution('exec-700', {
      status: 'running',
      session_id: 'session-700',
      callback_payload: { heartbeat: 'ok' },
      error: null,
      finished_at: null,
    });

    expect(created).toMatchObject({
      execution_id: 'exec-700',
      adapter: 'codex',
      mode: 'one_shot',
      status: 'queued',
      callback_payload: null,
    });
    expect(executions.getExecution('exec-700')).toMatchObject({
      execution_id: 'exec-700',
      session_id: 'session-700',
      status: 'running',
      callback_payload: { heartbeat: 'ok' },
    });
    expect(executions.listBySubtask('OC-700', 'dispatch-codex')).toHaveLength(1);
    expect(updated.status).toBe('running');
  });

  it('lists execution records for multiple tasks in one query', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);

    const tasks = new TaskRepository(db);
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);

    for (const taskId of ['OC-710', 'OC-711']) {
      tasks.insertTask({
        id: taskId,
        title: `Task ${taskId}`,
        description: '',
        type: 'coding',
        priority: 'high',
        creator: 'archon',
        team: { members: [] },
        workflow: { stages: [{ id: 'develop' }] },
      });
    }
    subtasks.insertSubtask({
      id: 'dispatch-a',
      task_id: 'OC-710',
      stage_id: 'develop',
      title: 'Dispatch A',
      assignee: 'sonnet',
    });
    subtasks.insertSubtask({
      id: 'dispatch-b',
      task_id: 'OC-711',
      stage_id: 'develop',
      title: 'Dispatch B',
      assignee: 'codex',
    });
    executions.insertExecution({
      execution_id: 'exec-710',
      task_id: 'OC-710',
      subtask_id: 'dispatch-a',
      adapter: 'codex',
      mode: 'one_shot',
    });
    executions.insertExecution({
      execution_id: 'exec-711',
      task_id: 'OC-711',
      subtask_id: 'dispatch-b',
      adapter: 'codex',
      mode: 'one_shot',
    });

    expect(executions.listByTaskIds(['OC-710', 'OC-711'])).toMatchObject([
      expect.objectContaining({
        execution_id: 'exec-710',
        task_id: 'OC-710',
      }),
      expect.objectContaining({
        execution_id: 'exec-711',
        task_id: 'OC-711',
      }),
    ]);
    expect(executions.listByTaskIds([])).toEqual([]);
  });
});
