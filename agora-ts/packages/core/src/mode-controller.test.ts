import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgoraDatabase, runMigrations, TaskRepository, SubtaskRepository, FlowLogRepository, ProgressLogRepository, CraftsmanExecutionRepository } from '@agora-ts/db';
import { CraftsmanDispatcher } from './craftsman-dispatcher.js';
import { ModeController } from './mode-controller.js';
import { ProgressService } from './progress-service.js';

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
    const progressLogs = new ProgressLogRepository(db);
    const modes = new ModeController({
      subtaskRepository: subtasks,
      progressService: new ProgressService({
        flowLogRepository: flowLogs,
        progressLogRepository: progressLogs,
      }),
    });

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

  it('auto-dispatches craftsmen execute subtasks when a dispatcher is configured', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const tasks = new TaskRepository(db);
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);
    const flowLogs = new FlowLogRepository(db);
    const progressLogs = new ProgressLogRepository(db);
    const dispatcher = new CraftsmanDispatcher({
      executionRepository: executions,
      subtaskRepository: subtasks,
      adapters: {
        codex: {
          name: 'codex',
          dispatchTask: () => ({
            status: 'running',
            session_id: 'mode-codex-1',
            started_at: '2026-03-08T12:10:00.000Z',
          }),
        },
      },
    });
    const modes = new ModeController({
      subtaskRepository: subtasks,
      progressService: new ProgressService({
        flowLogRepository: flowLogs,
        progressLogRepository: progressLogs,
      }),
      dispatcher,
    });

    tasks.insertTask({
      id: 'OC-951',
      title: 'mode control dispatch',
      description: '',
      type: 'coding',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: { stages: [] },
    });

    modes.enterExecuteMode('OC-951', 'develop', [
      {
        id: 'sub-codex',
        title: 'API',
        assignee: 'sonnet',
        craftsman: {
          adapter: 'codex',
          mode: 'one_shot',
          workdir: '/tmp/mode-codex',
          prompt: 'Implement the API',
        },
      },
    ]);

    expect(executions.listBySubtask('OC-951', 'sub-codex')).toEqual([
      expect.objectContaining({
        adapter: 'codex',
        status: 'running',
      }),
    ]);
    expect(subtasks.listByTask('OC-951')).toEqual([
      expect.objectContaining({
        id: 'sub-codex',
        dispatch_status: 'running',
        craftsman_session: 'mode-codex-1',
      }),
    ]);
  });
});
