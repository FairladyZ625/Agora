import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgoraDatabase, runMigrations } from '@agora-ts/db';
import { ProjectService } from './project-service.js';

const tempPaths: string[] = [];

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-project-service-'));
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

describe('project service', () => {
  it('creates, lists, and resolves projects', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = new ProjectService(db);

    const created = service.createProject({
      id: 'proj-alpha',
      name: 'Project Alpha',
      summary: 'thin slice',
      owner: 'archon',
      metadata: { scope: 'task-writeback' },
    });

    expect(created).toMatchObject({
      id: 'proj-alpha',
      name: 'Project Alpha',
      status: 'active',
      owner: 'archon',
      metadata: { scope: 'task-writeback' },
    });
    expect(service.requireProject('proj-alpha').name).toBe('Project Alpha');
    expect(service.listProjects()).toEqual([
      expect.objectContaining({
        id: 'proj-alpha',
      }),
    ]);
  });

  it('throws when requiring a missing project', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = new ProjectService(db);

    expect(() => service.requireProject('proj-missing')).toThrow('Project not found: proj-missing');
  });
});
