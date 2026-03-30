import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

function makeProjectStateDir() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-project-state-'));
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
    const projectStateDir = makeProjectStateDir();
    const projectService = new ProjectService(db, {
      knowledgePort: new FilesystemProjectKnowledgeAdapter({
        brainPackRoot,
        projectStateRootResolver: (projectId) => join(projectStateDir, projectId),
      }),
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
      source_ref: null,
      default_model_preference: null,
      allowed_target_kinds: ['runtime_agent'],
      citizen_scaffold: {
        soul: 'Think in systems.',
        boundaries: ['Stay core-first.'],
        heartbeat: ['Restate objective.'],
        recap_expectations: ['Summarize next step.'],
      },
      metadata: {},
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
      persona: null,
      boundaries: [],
      skills_ref: [],
      channel_policies: {},
      brain_scaffold_mode: 'role_default',
      runtime_projection: {
        adapter: 'openclaw',
        auto_provision: false,
        metadata: {},
      },
    });
    const service = new ProjectBrainService({
      projectService,
      citizenService,
      projectBrainQueryPort: new FilesystemProjectBrainQueryAdapter({
        brainPackRoot,
        projectStateRootResolver: (projectId) => join(projectStateDir, projectId),
      }),
    });

    expect(service.listDocuments('proj-brain')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'index', slug: 'index' }),
        expect.objectContaining({ kind: 'timeline', slug: 'timeline' }),
        expect.objectContaining({ kind: 'decision', slug: 'runtime-boundary' }),
        expect.objectContaining({ kind: 'citizen_scaffold', slug: 'citizen-alpha' }),
      ]),
    );
    expect(service.getDocument('proj-brain', 'decision', 'runtime-boundary')).toMatchObject({
      kind: 'decision',
      slug: 'runtime-boundary',
    });
    expect(service.getDocument('proj-brain', 'citizen_scaffold', 'citizen-alpha')).toMatchObject({
      kind: 'citizen_scaffold',
      slug: 'citizen-alpha',
    });
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

  it('enqueues affected project brain docs after append operations', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackRoot = makeBrainPackDir();
    const projectStateDir = makeProjectStateDir();
    const projectService = new ProjectService(db, {
      knowledgePort: new FilesystemProjectKnowledgeAdapter({
        brainPackRoot,
        projectStateRootResolver: (projectId) => join(projectStateDir, projectId),
      }),
    });
    projectService.createProject({
      id: 'proj-brain',
      name: 'Brain Project',
    });
    const enqueueDocumentSync = vi.fn();
    const service = new ProjectBrainService({
      projectService,
      projectBrainQueryPort: new FilesystemProjectBrainQueryAdapter({
        brainPackRoot,
        projectStateRootResolver: (projectId) => join(projectStateDir, projectId),
      }),
      projectBrainIndexQueueService: {
        enqueueDocumentSync,
      },
    });

    service.appendDocument({
      project_id: 'proj-brain',
      kind: 'reference',
      slug: 'obsidian-notes',
      title: 'Obsidian Notes',
      body: 'Append this note into the project brain.',
      heading: 'Notes',
    });

    expect(enqueueDocumentSync).toHaveBeenCalledWith({
      project_id: 'proj-brain',
      document_kind: 'reference',
      document_slug: 'obsidian-notes',
      reason: 'brain_append',
    });
    expect(enqueueDocumentSync).toHaveBeenCalledWith({
      project_id: 'proj-brain',
      document_kind: 'index',
      document_slug: 'index',
      reason: 'brain_append',
    });
  });
});
