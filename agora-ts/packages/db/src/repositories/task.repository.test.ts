import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAgoraDatabase, runMigrations } from '../database.js';
import { TaskRepository } from './task.repository.js';

const tempPaths: string[] = [];

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-task-repository-'));
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

describe('task repository', () => {
  it('throws a descriptive error when the inserted task cannot be reloaded', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const repository = new TaskRepository(db);
    const getTask = vi.spyOn(repository, 'getTask');

    getTask.mockReturnValueOnce(null);

    expect(() => repository.insertTask({
      id: 'OC-GUARD-1',
      title: 'task reload guard',
      description: '',
      type: 'document',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: { stages: [] },
    })).toThrow(/failed to retrieve task OC-GUARD-1 after insert/i);
  });

  it('throws a descriptive error when the updated task cannot be reloaded', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const repository = new TaskRepository(db);
    repository.insertTask({
      id: 'OC-GUARD-2',
      title: 'task update guard',
      description: '',
      type: 'document',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: { stages: [] },
    });
    const getTask = vi.spyOn(repository, 'getTask');

    getTask.mockReturnValueOnce(null);

    expect(() => repository.updateTask('OC-GUARD-2', 1, {
      state: 'active',
    })).toThrow(/failed to retrieve task OC-GUARD-2 after update/i);
  });
});
