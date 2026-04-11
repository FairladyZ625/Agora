import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FlowLogRepository, ProgressLogRepository, TaskRepository, createAgoraDatabase, runMigrations } from '@agora-ts/db';
import { ProgressService } from './progress-service.js';

const tempPaths: string[] = [];

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-progress-service-'));
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

describe('progress service', () => {
  it('records flow/progress/system events and merges activity stream', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const tasks = new TaskRepository(db);
    const progress = new ProgressService({
      flowLogRepository: new FlowLogRepository(db),
      progressLogRepository: new ProgressLogRepository(db),
    });

    tasks.insertTask({
      id: 'OC-900',
      title: 'progress service',
      description: '',
      type: 'coding',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: { stages: [] },
    });

    progress.recordStateChange('OC-900', 'draft', 'created');
    progress.recordStageAdvance('OC-900', 'discuss', 'develop', 'opus');
    progress.recordGateResult('OC-900', 'develop', 'all_subtasks_done', true, 'system');
    progress.recordArchonDecision('OC-900', 'review', 'approved', 'archon', 'ship it');
    progress.recordAgentReport('OC-900', 'develop', 'sonnet', 'working', 'sub-1', ['patch.diff']);
    progress.recordTodosSnapshot('OC-900', 'develop', 'sonnet', '- finish tests');
    progress.recordSubtaskEvent('OC-900', 'develop', 'sub-1', 'done', 'system', { output: 'merged' });

    const stream = progress.getActivityStream('OC-900');

    expect(stream).toHaveLength(7);
    expect(stream.map((item) => item.layer)).toEqual(
      expect.arrayContaining(['flow', 'progress']),
    );
    expect(stream.map((item) => item.event ?? item.kind)).toEqual(
      expect.arrayContaining(['state_change', 'stage_advance', 'gate_passed', 'archon_approved', 'subtask_done', 'progress', 'todos']),
    );
  });
});
