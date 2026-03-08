import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgoraDatabase, runMigrations } from '@agora-ts/db';
import { TaskRepository } from '@agora-ts/db';
import { GateType, TaskState } from './enums.js';
import { StateMachine } from './state-machine.js';

const tempPaths: string[] = [];

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-core-'));
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

function buildTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'OC-001',
    state: 'active',
    current_stage: 'discuss',
    workflow: {
      stages: [
        { id: 'discuss', gate: { type: 'archon_review' } },
        { id: 'develop', gate: { type: 'all_subtasks_done' } },
        { id: 'review', gate: { type: 'approval' } },
      ],
    },
    ...overrides,
  };
}

describe('agora-ts state machine', () => {
  it('validates canonical task transitions', () => {
    const sm = new StateMachine();

    expect(sm.validateTransition(TaskState.DRAFT, TaskState.CREATED)).toBe(true);
    expect(sm.validateTransition(TaskState.ACTIVE, TaskState.DONE)).toBe(true);
    expect(sm.validateTransition(TaskState.DONE, TaskState.ACTIVE)).toBe(false);
  });

  it('returns the next stage for linear and dag workflows', () => {
    const sm = new StateMachine();

    expect(sm.getNextStage(buildTask().workflow, 'discuss')?.id).toBe('develop');
    expect(
      sm.getNextStage(
        {
          stages: [
            { id: 'a', next: ['c'] },
            { id: 'b' },
            { id: 'c' },
          ],
        },
        'a',
      )?.id,
    ).toBe('c');
  });

  it('computes advance results for in-progress and terminal stages', () => {
    const sm = new StateMachine();

    expect(sm.advance(buildTask().workflow, 'discuss')).toMatchObject({
      currentStage: { id: 'discuss' },
      nextStage: { id: 'develop' },
      completesTask: false,
    });
    expect(sm.advance(buildTask().workflow, 'review')).toMatchObject({
      currentStage: { id: 'review' },
      nextStage: null,
      completesTask: true,
    });
  });

  it('checks archon review and all_subtasks_done gates against the sqlite state', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const tasks = new TaskRepository(db);
    const sm = new StateMachine();
    const task = buildTask();

    tasks.insertTask({
      id: 'OC-001',
      title: 'state machine test',
      description: '',
      type: 'coding',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: task.workflow,
    });

    expect(
      sm.checkGate(db, task, { id: 'discuss', gate: { type: GateType.ARCHON_REVIEW } }, 'opus'),
    ).toBe(false);

    db.prepare(
      'INSERT INTO archon_reviews (task_id, stage_id, decision, reviewer_id) VALUES (?, ?, ?, ?)',
    ).run('OC-001', 'discuss', 'approved', 'lizeyu');

    expect(
      sm.checkGate(db, task, { id: 'discuss', gate: { type: GateType.ARCHON_REVIEW } }, 'opus'),
    ).toBe(true);

    db.prepare(
      'INSERT INTO subtasks (id, task_id, stage_id, title, assignee, status) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('dev-api', 'OC-001', 'develop', 'API', 'sonnet', 'not_started');

    expect(
      sm.checkGate(db, task, { id: 'develop', gate: { type: GateType.ALL_SUBTASKS_DONE } }, 'opus'),
    ).toBe(false);

    db.prepare('UPDATE subtasks SET status = ? WHERE task_id = ? AND id = ?').run('done', 'OC-001', 'dev-api');

    expect(
      sm.checkGate(db, task, { id: 'develop', gate: { type: GateType.ALL_SUBTASKS_DONE } }, 'opus'),
    ).toBe(true);
  });

  it('checks auto_timeout gates against stage_history entered_at timestamps', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const tasks = new TaskRepository(db);
    const sm = new StateMachine();
    const task = buildTask({
      id: 'OC-002',
      workflow: {
        stages: [{ id: 'wait', gate: { type: 'auto_timeout', timeout_minutes: 30 } }],
      },
    });

    tasks.insertTask({
      id: 'OC-002',
      title: 'auto timeout',
      description: '',
      type: 'coding',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: task.workflow,
    });

    db.prepare('INSERT INTO stage_history (task_id, stage_id, entered_at) VALUES (?, ?, ?)')
      .run('OC-002', 'wait', '2026-03-08T10:00:00.000Z');

    expect(
      sm.checkGate(
        db,
        task,
        { id: 'wait', gate: { type: GateType.AUTO_TIMEOUT, timeout_minutes: 30 } },
        'system',
        '2026-03-08T10:20:00.000Z',
      ),
    ).toBe(false);

    expect(
      sm.checkGate(
        db,
        task,
        { id: 'wait', gate: { type: GateType.AUTO_TIMEOUT, timeout_minutes: 30 } },
        'system',
        '2026-03-08T10:40:00.000Z',
      ),
    ).toBe(true);
  });
});
