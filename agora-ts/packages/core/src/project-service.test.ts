import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgoraDatabase, runMigrations } from '@agora-ts/db';
import { FilesystemProjectKnowledgeAdapter } from './adapters/filesystem-project-knowledge-adapter.js';
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
    const brainPackDir = mkdtempSync(join(tmpdir(), 'agora-ts-project-knowledge-'));
    tempPaths.push(brainPackDir);
    const service = new ProjectService(db, {
      knowledgePort: new FilesystemProjectKnowledgeAdapter({
        brainPackRoot: brainPackDir,
      }),
    });

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
    expect(existsSync(join(brainPackDir, 'projects', 'proj-alpha', 'index.md'))).toBe(true);
    expect(readFileSync(join(brainPackDir, 'projects', 'proj-alpha', 'index.md'), 'utf8')).toContain('# Project Alpha');
  });

  it('throws when requiring a missing project', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = new ProjectService(db);

    expect(() => service.requireProject('proj-missing')).toThrow('Project not found: proj-missing');
  });

  it('writes, lists, reads, and searches project knowledge docs', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackDir = mkdtempSync(join(tmpdir(), 'agora-ts-project-knowledge-'));
    tempPaths.push(brainPackDir);
    const service = new ProjectService(db, {
      knowledgePort: new FilesystemProjectKnowledgeAdapter({
        brainPackRoot: brainPackDir,
      }),
    });

    service.createProject({
      id: 'proj-knowledge',
      name: 'Project Knowledge',
      owner: 'archon',
    });
    const doc = service.upsertKnowledgeEntry({
      project_id: 'proj-knowledge',
      kind: 'decision',
      slug: 'runtime-boundary',
      title: 'Runtime Boundary',
      summary: 'Keep runtime-specific logic out of core.',
      body: 'Core keeps orchestration semantics. Runtime adapters stay outside core.',
      source_task_ids: ['OC-100'],
    });

    expect(doc.path).toContain('knowledge/decisions/runtime-boundary.md');
    expect(service.listKnowledgeEntries('proj-knowledge', 'decision')).toEqual([
      expect.objectContaining({
        slug: 'runtime-boundary',
        title: 'Runtime Boundary',
      }),
    ]);
    expect(service.getKnowledgeEntry('proj-knowledge', 'decision', 'runtime-boundary')?.content).toContain(
      'Runtime adapters stay outside core.',
    );
    expect(service.searchProjectKnowledge('proj-knowledge', 'orchestration semantics')).toEqual([
      expect.objectContaining({
        kind: 'decision',
        slug: 'runtime-boundary',
      }),
    ]);
    expect(readFileSync(join(brainPackDir, 'projects', 'proj-knowledge', 'index.md'), 'utf8')).toContain(
      '[[knowledge/decisions/runtime-boundary.md]]',
    );
  });
});
