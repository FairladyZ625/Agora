import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgoraDatabase, runMigrations } from '@agora-ts/db';
import { OpenClawCitizenProjectionAdapter } from './adapters/openclaw-citizen-projection-adapter.js';
import { FilesystemProjectBrainQueryAdapter } from './adapters/filesystem-project-brain-query-adapter.js';
import { CitizenService } from './citizen-service.js';
import { ProjectBrainService } from './project-brain-service.js';
import { ProjectService } from './project-service.js';
import { FilesystemProjectKnowledgeAdapter } from './adapters/filesystem-project-knowledge-adapter.js';
import { RolePackService } from './role-pack-service.js';

const tempPaths: string[] = [];

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-project-brain-service-'));
  tempPaths.push(dir);
  return join(dir, 'tasks.db');
}

function makeBrainPackDir() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-project-brain-pack-'));
  tempPaths.push(dir);
  return dir;
}

afterEach(() => {
  while (tempPaths.length > 0) {
    const dir = tempPaths.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('project brain service', () => {
  it('lists, queries, and appends project brain docs including citizen scaffold previews', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackRoot = makeBrainPackDir();
    const projectService = new ProjectService(db, {
      knowledgePort: new FilesystemProjectKnowledgeAdapter({ brainPackRoot }),
    });
    projectService.createProject({
      id: 'proj-brain',
      name: 'Brain Project',
    });
    projectService.upsertKnowledgeEntry({
      project_id: 'proj-brain',
      kind: 'decision',
      slug: 'runtime-boundary',
      title: 'Runtime Boundary',
      summary: 'Keep runtime-specific logic out of core.',
      body: 'Core keeps orchestration semantics. Runtime adapters stay outside core.',
      source_task_ids: ['OC-100'],
    });
    const rolePackService = new RolePackService({ db });
    rolePackService.saveRoleDefinition({
      id: 'architect',
      name: 'Architect',
      member_kind: 'citizen',
      summary: 'Design systems.',
      prompt_asset: 'roles/architect.md',
      source: 'test',
      citizen_scaffold: {
        soul: 'Think in systems.',
        boundaries: ['Stay core-first.'],
        heartbeat: ['Restate objective.'],
        recap_expectations: ['Summarize next step.'],
      },
    });
    const citizenService = new CitizenService(db, {
      projectService,
      rolePackService,
      projectionPorts: [new OpenClawCitizenProjectionAdapter()],
    });
    citizenService.createCitizen({
      citizen_id: 'citizen-alpha',
      project_id: 'proj-brain',
      role_id: 'architect',
      display_name: 'Alpha Architect',
      runtime_projection: {
        adapter: 'openclaw',
        auto_provision: false,
      },
    });
    const service = new ProjectBrainService({
      projectService,
      citizenService,
      projectBrainQueryPort: new FilesystemProjectBrainQueryAdapter({ brainPackRoot }),
    });

    expect(service.listDocuments('proj-brain')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'index', slug: 'index' }),
        expect.objectContaining({ kind: 'timeline', slug: 'timeline' }),
        expect.objectContaining({ kind: 'decision', slug: 'runtime-boundary' }),
        expect.objectContaining({ kind: 'citizen_scaffold', slug: 'citizen-alpha' }),
      ]),
    );
    expect(service.queryDocuments('proj-brain', 'systems')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'citizen_scaffold', slug: 'citizen-alpha' }),
      ]),
    );

    const appended = service.appendDocument({
      project_id: 'proj-brain',
      kind: 'reference',
      slug: 'obsidian-notes',
      title: 'Obsidian Notes',
      body: 'Append this note into the project brain.',
      heading: 'Notes',
    });

    expect(appended.kind).toBe('reference');
    expect(appended.content).toContain('Append this note into the project brain.');
  });
});
