import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgoraDatabase, runMigrations, TaskRepository, SubtaskRepository, FlowLogRepository } from '@agora-ts/db';
import { ModeController } from './mode-controller.js';

const tempPaths: string[] = [];

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-mode-controller-'));
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

describe('mode controller', () => {
  it('records discuss mode transitions and creates execute mode subtasks', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const tasks = new TaskRepository(db);
    const subtasks = new SubtaskRepository(db);
    const flowLogs = new FlowLogRepository(db);
    const modes = new ModeController(db);

    tasks.insertTask({
      id: 'OC-950',
      title: 'mode control',
      description: '',
      type: 'coding',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: { stages: [] },
    });

    const discuss = modes.enterDiscussMode('OC-950', 'discuss', ['opus', 'sonnet']);
    const execute = modes.enterExecuteMode('OC-950', 'develop', [
      { id: 'sub-1', title: 'API', assignee: 'sonnet' },
      { id: 'sub-2', title: 'Review', assignee: 'gpt52' },
    ]);

    expect(discuss).toEqual({
      mode: 'discuss',
      participants: ['opus', 'sonnet'],
      stage_id: 'discuss',
    });
    expect(execute.mode).toBe('execute');
    expect(subtasks.listByTask('OC-950')).toHaveLength(2);
    expect(flowLogs.listByTask('OC-950').map((item) => item.event)).toEqual(
      expect.arrayContaining(['state_change', 'subtask_created']),
    );
  });
});
