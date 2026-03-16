import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAgoraDatabase, runMigrations } from '../database.js';
import { ProjectRepository } from './project.repository.js';

const tempPaths: string[] = [];

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-project-repository-'));
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

describe('project repository', () => {
  it('persists projects with metadata', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const repository = new ProjectRepository(db);

    const created = repository.insertProject({
      id: 'proj-alpha',
      name: 'Alpha',
      summary: 'Thin slice',
      owner: 'archon',
      metadata: { tier: 'internal' },
    });

    expect(created).toMatchObject({
      id: 'proj-alpha',
      name: 'Alpha',
      owner: 'archon',
      metadata: { tier: 'internal' },
    });
    expect(repository.listProjects()).toHaveLength(1);
  });

  it('throws a descriptive error when the inserted project cannot be reloaded', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const repository = new ProjectRepository(db);
    const getProject = vi.spyOn(repository, 'getProject');

    getProject.mockReturnValueOnce(null);

    expect(() => repository.insertProject({
      id: 'proj-guard-1',
      name: 'guard',
    })).toThrow(/failed to retrieve project proj-guard-1 after insert/i);
  });
});
