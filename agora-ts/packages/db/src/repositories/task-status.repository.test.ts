import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgoraDatabase, runMigrations } from '../database.js';
import { FlowLogRepository } from './flow-log.repository.js';
import { ProgressLogRepository } from './progress-log.repository.js';
import { SubtaskRepository } from './subtask.repository.js';
import { TaskRepository } from './task.repository.js';

const tempPaths: string[] = [];

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-status-db-'));
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

describe('task status repositories', () => {
  it('persist and reload flow logs, progress logs, and subtasks', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);

    const tasks = new TaskRepository(db);
    const flowLogs = new FlowLogRepository(db);
    const progressLogs = new ProgressLogRepository(db);
    const subtasks = new SubtaskRepository(db);

    tasks.insertTask({
      id: 'OC-003',
      title: '迁移状态接口',
      description: '',
      type: 'coding',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: { stages: [{ id: 'discuss' }] },
    });

    flowLogs.insertFlowLog({
      task_id: 'OC-003',
      event: 'state_changed',
      kind: 'flow',
      stage_id: 'discuss',
      from_state: 'created',
      to_state: 'active',
      detail: { reason: 'bootstrap' },
      actor: 'system',
    });
    progressLogs.insertProgressLog({
      task_id: 'OC-003',
      kind: 'progress',
      stage_id: 'discuss',
      subtask_id: null,
      content: '进入讨论阶段',
      artifacts: { source: 'task-service' },
      actor: 'system',
    });
    subtasks.insertSubtask({
      id: 'draft-plan',
      task_id: 'OC-003',
      stage_id: 'discuss',
      title: '整理计划',
      assignee: 'architect',
      status: 'not_started',
    });

    expect(flowLogs.listByTask('OC-003')).toMatchObject([
      {
        task_id: 'OC-003',
        stage_id: 'discuss',
        detail: '{"reason":"bootstrap"}',
      },
    ]);
    expect(progressLogs.listByTask('OC-003')).toMatchObject([
      {
        task_id: 'OC-003',
        content: '进入讨论阶段',
        artifacts: '{"source":"task-service"}',
      },
    ]);
    expect(subtasks.listByTask('OC-003')).toMatchObject([
      {
        id: 'draft-plan',
        assignee: 'architect',
        status: 'not_started',
      },
    ]);
  });
});
