import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgoraDatabase, runMigrations } from '@agora-ts/db';
import { OpenClawCitizenProjectionAdapter } from './adapters/openclaw-citizen-projection-adapter.js';
import { FilesystemProjectBrainQueryAdapter } from './adapters/filesystem-project-brain-query-adapter.js';
import { FilesystemProjectKnowledgeAdapter } from './adapters/filesystem-project-knowledge-adapter.js';
import { CitizenService } from './citizen-service.js';
import { ProjectBrainAutomationPolicy } from './project-brain-automation-policy.js';
import { ProjectBrainAutomationService } from './project-brain-automation-service.js';
import { ProjectBrainService } from './project-brain-service.js';
import { ProjectService } from './project-service.js';
import { RolePackService } from './role-pack-service.js';

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
    const projectService = new ProjectService(db, {
      knowledgePort: new FilesystemProjectKnowledgeAdapter({ brainPackRoot }),
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
      workspace_path: join(brainPackRoot, 'projects', 'proj-automation', 'tasks', 'OC-100'),
      bound_at: '2026-03-16T08:00:00.000Z',
    });
    projectService.recordTaskRecap({
      project_id: 'proj-automation',
      task_id: 'OC-100',
      title: 'Initial task',
      state: 'done',
      current_stage: 'ship',
      controller_ref: 'opus',
      workspace_path: join(brainPackRoot, 'projects', 'proj-automation', 'tasks', 'OC-100'),
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
        boundaries: ['Keep adapters outside core.'],
        heartbeat: ['Restate the objective.'],
        recap_expectations: ['Capture next steps.'],
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
      projectService,
      citizenService,
      projectBrainQueryPort: new FilesystemProjectBrainQueryAdapter({ brainPackRoot }),
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
});
