import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAgoraDatabase, runMigrations } from '../database.js';
import { TaskRepository } from './task.repository.js';
import { TaskBrainBindingRepository } from './task-brain-binding.repository.js';

const tempPaths: string[] = [];

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-task-brain-binding-'));
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

describe('task brain binding repository', () => {
  it('throws a descriptive error when the inserted binding cannot be reloaded', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const tasks = new TaskRepository(db);
    tasks.insertTask({
      id: 'OC-1',
      title: 'brain binding guard',
      description: '',
      type: 'document',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: { stages: [] },
    });
    const repository = new TaskBrainBindingRepository(db);
    const getById = vi.spyOn(repository, 'getById');

    getById.mockReturnValueOnce(null);

    expect(() => repository.insert({
      id: 'binding-1',
      task_id: 'OC-1',
      brain_pack_ref: 'brain-pack',
      brain_task_id: 'TASK-1',
      workspace_path: '/tmp/workspace',
    })).toThrow(/failed to retrieve task brain binding binding-1 after insert/i);
  });
});
