import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAgoraDatabase, runMigrations } from '@agora-ts/db';
import { createCitizenServiceFromDb, createProjectServiceFromDb, createRolePackServiceFromDb } from '@agora-ts/testing';
import { OpenClawCitizenProjectionAdapter } from './adapters/openclaw-citizen-projection-adapter.js';
import { FilesystemProjectBrainQueryAdapter } from './adapters/filesystem-project-brain-query-adapter.js';
import { FilesystemProjectKnowledgeAdapter } from './adapters/filesystem-project-knowledge-adapter.js';
import { ProjectBrainAutomationPolicy } from './project-brain-automation-policy.js';
import { ProjectBrainAutomationService } from './project-brain-automation-service.js';
import { ProjectBrainService } from './project-brain-service.js';

const tempPaths: string[] = [];

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-project-brain-automation-'));
  tempPaths.push(dir);
  return join(dir, 'tasks.db');
}

function makeBrainPackDir() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-project-brain-automation-pack-'));
  tempPaths.push(dir);
  return dir;
}

function makeProjectStateDir() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-project-brain-automation-state-'));
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

describe('project brain automation service', () => {
  it('builds a curated bootstrap context and supports explicit knowledge promotion', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackRoot = makeBrainPackDir();
    const projectStateDir = makeProjectStateDir();
    const projectService = createProjectServiceFromDb(db, {
      knowledgePort: new FilesystemProjectKnowledgeAdapter({
        brainPackRoot,
        projectStateRootResolver: (projectId) => join(projectStateDir, projectId),
      }),
    });
    projectService.createProject({
      id: 'proj-automation',
      name: 'Automation Project',
      summary: 'Brain automation baseline',
    });
    projectService.recordTaskBinding({
      project_id: 'proj-automation',
      task_id: 'OC-100',
      title: 'Initial task',
      state: 'active',
      workspace_path: join(projectStateDir, 'proj-automation', 'tasks', 'OC-100'),
      bound_at: '2026-03-16T08:00:00.000Z',
    });
    projectService.recordTaskRecap({
      project_id: 'proj-automation',
      task_id: 'OC-100',
      title: 'Initial task',
      state: 'done',
      current_stage: 'ship',
      controller_ref: 'opus',
      workspace_path: join(projectStateDir, 'proj-automation', 'tasks', 'OC-100'),
      completed_by: 'archon',
      completed_at: '2026-03-16T09:00:00.000Z',
      summary_lines: ['Task recap line'],
    });
    projectService.upsertKnowledgeEntry({
      project_id: 'proj-automation',
      kind: 'fact',
      slug: 'core-first',
      title: 'Core First',
      summary: 'Keep orchestration inside core.',
      body: 'Core keeps orchestration semantics and adapters stay outside it.',
      source_task_ids: ['OC-100'],
    });
    const rolePackService = createRolePackServiceFromDb(db);
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
        boundaries: ['Keep adapters outside core.'],
        heartbeat: ['Restate the objective.'],
        recap_expectations: ['Capture next steps.'],
      },
      metadata: {},
    });
    const citizenService = createCitizenServiceFromDb(db, {
      projectService,
      rolePackService,
      projectionPorts: [new OpenClawCitizenProjectionAdapter()],
    });
    citizenService.createCitizen({
      citizen_id: 'citizen-alpha',
      project_id: 'proj-automation',
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
    const projectBrainService = new ProjectBrainService({
      projectService: projectService as unknown as NonNullable<ConstructorParameters<typeof ProjectBrainService>[0]['projectService']>,
      citizenService: citizenService as unknown as NonNullable<ConstructorParameters<typeof ProjectBrainService>[0]['citizenService']>,
      projectBrainQueryPort: new FilesystemProjectBrainQueryAdapter({
        brainPackRoot,
        projectStateRootResolver: (projectId) => join(projectStateDir, projectId),
      }),
    });
    const service = new ProjectBrainAutomationService({
      projectBrainService,
      policy: new ProjectBrainAutomationPolicy(),
    });

    const context = service.buildBootstrapContext({
      project_id: 'proj-automation',
      audience: 'controller',
    });

    expect(context.source_documents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'index', slug: 'index' }),
        expect.objectContaining({ kind: 'timeline', slug: 'timeline' }),
        expect.objectContaining({ kind: 'fact', slug: 'core-first' }),
        expect.objectContaining({ kind: 'citizen_scaffold', slug: 'citizen-alpha' }),
      ]),
    );
    expect(context.markdown).toContain('doc_type: project_brain_bootstrap_context');
    expect(context.markdown).toContain('Automation Project');
    expect(context.markdown).toContain('citizen-alpha');
    expect(context.markdown).toContain('Core First');
    expect(context.reference_bundle?.project_map.index_reference_key).toBe('index:index');

    const promoted = service.promoteKnowledge({
      project_id: 'proj-automation',
      kind: 'decision',
      slug: 'obsidian-adapter',
      title: 'Obsidian Adapter',
      summary: 'Keep Obsidian optional.',
      body: 'Obsidian stays an optional adapter. Markdown is the durable contract.',
      source_task_ids: ['OC-100'],
    });

    expect(promoted.kind).toBe('decision');
    expect(promoted.slug).toBe('obsidian-adapter');
    expect(promoted.content).toContain('Obsidian stays an optional adapter.');
  });

  it('passes task-aware bootstrap inputs into the policy when task context is provided', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackRoot = makeBrainPackDir();
    const projectStateDir = makeProjectStateDir();
    const projectService = createProjectServiceFromDb(db, {
      knowledgePort: new FilesystemProjectKnowledgeAdapter({
        brainPackRoot,
        projectStateRootResolver: (projectId) => join(projectStateDir, projectId),
      }),
    });
    projectService.createProject({
      id: 'proj-automation',
      name: 'Automation Project',
      summary: 'Brain automation baseline',
    });
    projectService.upsertKnowledgeEntry({
      project_id: 'proj-automation',
      kind: 'decision',
      slug: 'runtime-boundary',
      title: 'Runtime Boundary',
      summary: 'Keep runtime-specific logic out of core.',
      body: 'Core keeps orchestration semantics and adapters stay outside it.',
      source_task_ids: ['OC-100'],
    });
    const projectBrainService = new ProjectBrainService({
      projectService: projectService as unknown as NonNullable<ConstructorParameters<typeof ProjectBrainService>[0]['projectService']>,
      projectBrainQueryPort: new FilesystemProjectBrainQueryAdapter({
        brainPackRoot,
        projectStateRootResolver: (projectId) => join(projectStateDir, projectId),
      }),
    });
    const policy = {
      selectBootstrapDocuments: vi.fn((documents: unknown[]) => documents),
    };
    const service = new ProjectBrainAutomationService({
      projectBrainService,
      policy: policy as never,
    });

    service.buildBootstrapContext({
      project_id: 'proj-automation',
      task_id: 'OC-100',
      task_title: 'Implement hybrid retrieval',
      task_description: 'Need vector recall and lexical rerank.',
      allowed_citizen_ids: ['citizen-alpha'],
      audience: 'controller',
    });

    expect(policy.selectBootstrapDocuments).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        task_id: 'OC-100',
        task_title: 'Implement hybrid retrieval',
        task_description: 'Need vector recall and lexical rerank.',
        allowed_citizen_ids: ['citizen-alpha'],
        audience: 'controller',
      }),
    );
  });

  it('uses hybrid retrieval candidates for task-aware bootstrap and falls back to lexical docs', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackRoot = makeBrainPackDir();
    const projectStateDir = makeProjectStateDir();
    const projectService = createProjectServiceFromDb(db, {
      knowledgePort: new FilesystemProjectKnowledgeAdapter({
        brainPackRoot,
        projectStateRootResolver: (projectId) => join(projectStateDir, projectId),
      }),
    });
    projectService.createProject({
      id: 'proj-automation',
      name: 'Automation Project',
      summary: 'Brain automation baseline',
    });
    projectService.recordTaskBinding({
      project_id: 'proj-automation',
      task_id: 'OC-100',
      title: 'Hybrid retrieval task',
      state: 'active',
      workspace_path: join(projectStateDir, 'proj-automation', 'tasks', 'OC-100'),
      bound_at: '2026-03-16T08:00:00.000Z',
    });
    projectService.upsertKnowledgeEntry({
      project_id: 'proj-automation',
      kind: 'decision',
      slug: 'runtime-boundary',
      title: 'Runtime Boundary',
      summary: 'Keep runtime-specific logic out of core.',
      body: 'Core keeps orchestration semantics and adapters stay outside it.',
      source_task_ids: ['OC-100'],
    });
    const projectBrainService = new ProjectBrainService({
      projectService: projectService as unknown as NonNullable<ConstructorParameters<typeof ProjectBrainService>[0]['projectService']>,
      citizenService: {
        listCitizens: vi.fn().mockReturnValue([
          {
            citizen_id: 'citizen-alpha',
            project_id: 'proj-automation',
            display_name: 'Citizen Alpha',
            created_at: '2026-03-16T08:00:00.000Z',
            updated_at: '2026-03-16T08:00:00.000Z',
          },
        ]),
        requireCitizen: vi.fn().mockReturnValue({
          citizen_id: 'citizen-alpha',
          project_id: 'proj-automation',
          display_name: 'Citizen Alpha',
          created_at: '2026-03-16T08:00:00.000Z',
          updated_at: '2026-03-16T08:00:00.000Z',
        }),
        previewProjection: vi.fn().mockReturnValue({
          adapter: 'openclaw',
          files: [
            {
              path: '/brain/citizen/citizen-alpha.md',
              content: '# Citizen Alpha\n\nScaffold',
            },
          ],
        }),
      } as never,
      projectBrainQueryPort: new FilesystemProjectBrainQueryAdapter({
        brainPackRoot,
        projectStateRootResolver: (projectId) => join(projectStateDir, projectId),
      }),
    });
    const retrievalService = {
      retrieve: vi.fn().mockResolvedValue([
        {
          scope: 'project_brain',
          provider: 'project_brain',
          reference_key: 'decision:runtime-boundary',
          project_id: 'proj-automation',
          title: 'Runtime Boundary',
          path: '/brain/decision/runtime-boundary.md',
          preview: 'Keep runtime-specific logic out of core.',
          score: 4,
          metadata: {
            kind: 'decision',
            slug: 'runtime-boundary',
            retrieval_mode: 'hybrid',
          },
        },
        {
          scope: 'project_brain',
          provider: 'project_brain',
          reference_key: 'citizen_scaffold:citizen-alpha',
          project_id: 'proj-automation',
          title: 'Citizen Alpha',
          path: '/brain/citizen/citizen-alpha.md',
          preview: 'Citizen Alpha scaffold',
          score: 3,
          metadata: {
            kind: 'citizen_scaffold',
            slug: 'citizen-alpha',
            retrieval_mode: 'hybrid',
          },
        },
      ]),
    };
    const service = new ProjectBrainAutomationService({
      projectBrainService,
      policy: new ProjectBrainAutomationPolicy(),
      retrievalService: retrievalService as never,
    });

    const context = await service.buildBootstrapContextAsync({
      project_id: 'proj-automation',
      task_id: 'OC-100',
      task_title: 'Implement hybrid retrieval',
      task_description: 'Need vector recall and lexical rerank.',
      allowed_citizen_ids: ['citizen-alpha'],
      audience: 'craftsman',
    });

    expect(retrievalService.retrieve).toHaveBeenCalledWith({
      scope: 'project_brain',
      mode: 'task_context',
      query: {
        text: 'Implement hybrid retrieval\n\nNeed vector recall and lexical rerank.',
      },
      limit: 6,
      context: {
        task_id: 'OC-100',
        project_id: 'proj-automation',
        audience: 'craftsman',
      },
    });
    expect(context.reference_bundle?.attention_anchors).toEqual([
      expect.objectContaining({ reference_key: 'decision:runtime-boundary' }),
      expect.objectContaining({ reference_key: 'citizen_scaffold:citizen-alpha' }),
    ]);
    expect(context.source_documents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'index', slug: 'index' }),
        expect.objectContaining({ kind: 'timeline', slug: 'timeline' }),
        expect.objectContaining({ kind: 'decision', slug: 'runtime-boundary' }),
        expect.objectContaining({ kind: 'citizen_scaffold', slug: 'citizen-alpha' }),
      ]),
    );
  });
});
