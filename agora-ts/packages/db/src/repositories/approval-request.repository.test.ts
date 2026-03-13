import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAgoraDatabase, runMigrations } from '../database.js';
import { TaskRepository } from './task.repository.js';
import { ApprovalRequestRepository } from './approval-request.repository.js';

const tempPaths: string[] = [];

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-approval-request-'));
  tempPaths.push(dir);
  return join(dir, 'tasks.db');
}

afterEach(() => {
  vi.restoreAllMocks();
  while (tempPaths.length > 0) {
    const dir = tempPaths.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('approval request repository', () => {
  it('throws a descriptive error when the inserted request cannot be reloaded', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const tasks = new TaskRepository(db);
    tasks.insertTask({
      id: 'OC-1',
      title: 'approval guard',
      description: '',
      type: 'document',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: { stages: [] },
    });
    const repository = new ApprovalRequestRepository(db);
    const getById = vi.spyOn(repository, 'getById');

    getById.mockReturnValueOnce(null);

    expect(() => repository.insert({
      id: 'approval-1',
      task_id: 'OC-1',
      stage_id: 'review',
      gate_type: 'archon_review',
      requested_by: 'archon',
    })).toThrow(/failed to retrieve approval request approval-1 after insert/i);
  });
});
