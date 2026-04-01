import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgoraDatabase, runMigrations } from '@agora-ts/db';
import { createProjectServiceFromDb, createTaskBrainBindingServiceFromDb, createTaskServiceFromDb } from '@agora-ts/testing';
import { FilesystemProjectKnowledgeAdapter } from './adapters/filesystem-project-knowledge-adapter.js';
import { FilesystemProjectBrainQueryAdapter } from './adapters/filesystem-project-brain-query-adapter.js';
import { FilesystemTaskBrainWorkspaceAdapter } from './adapters/filesystem-task-brain-workspace-adapter.js';
import { ProjectBootstrapService } from './project-bootstrap-service.js';
import { ProjectBrainAutomationService } from './project-brain-automation-service.js';
import { ProjectBrainService } from './project-brain-service.js';

const tempPaths: string[] = [];
const templatesDir = resolve(process.cwd(), 'templates');

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-project-bootstrap-'));
  tempPaths.push(dir);
  return join(dir, 'tasks.db');
}

function makeBrainPackDir() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-project-bootstrap-brain-'));
  tempPaths.push(dir);
  return dir;
}

function makeProjectStateDir() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-project-bootstrap-state-'));
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

describe('project bootstrap service', () => {
  it('creates a harness bootstrap task and seeds bootstrap scaffolds', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackDir = makeBrainPackDir();
    const projectStateDir = makeProjectStateDir();
    const projectService = createProjectServiceFromDb(db, {
      knowledgePort: new FilesystemProjectKnowledgeAdapter({
        brainPackRoot: brainPackDir,
        projectStateRootResolver: (projectId) => join(projectStateDir, projectId),
      }),
    });
    projectService.createProject({
      id: 'proj-bootstrap',
      name: 'Bootstrap Project',
      owner: 'archon',
    });
    const projectBrainService = new ProjectBrainService({
      projectService,
      projectBrainQueryPort: new FilesystemProjectBrainQueryAdapter({
        brainPackRoot: brainPackDir,
        projectStateRootResolver: (projectId) => join(projectStateDir, projectId),
      }),
    });
    const taskService = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-HARNESS-BOOTSTRAP',
      projectService,
      taskBrainBindingService: createTaskBrainBindingServiceFromDb(db, {
        idGenerator: () => 'brain-binding-harness-bootstrap',
      }),
      taskBrainWorkspacePort: new FilesystemTaskBrainWorkspaceAdapter({
        brainPackRoot: brainPackDir,
        projectStateRootResolver: (projectId) => join(projectStateDir, projectId),
      }),
      projectBrainAutomationService: new ProjectBrainAutomationService({
        projectBrainService,
      }),
    });
    const service = new ProjectBootstrapService({
      projectService,
      taskService,
    });

    const task = service.createHarnessBootstrapTask({
      project_id: 'proj-bootstrap',
      project_name: 'Bootstrap Project',
      creator: 'archon',
      repo_path: '/tmp/bootstrap-project',
      project_state_root: '/Users/example/.agora/projects/proj-bootstrap',
      nomos_id: 'agora/default',
      project_nomos_spec_path: '/Users/example/.agora/projects/proj-bootstrap/docs/reference/project-nomos-authoring-spec.md',
      project_nomos_draft_root: '/Users/example/.agora/projects/proj-bootstrap/nomos/project-nomos',
      bootstrap_prompt_path: '/Users/example/.agora/projects/proj-bootstrap/prompts/bootstrap/interview.md',
      bootstrap_mode: 'existing_repo',
    });

    expect(task.id).toBe('OC-HARNESS-BOOTSTRAP');
    expect(task.project_id).toBe('proj-bootstrap');
    expect(task.title).toBe('Create Project Nomos: Bootstrap Project');
    expect(task.description).toContain('Global project state root');
    expect(task.description).toContain('/tmp/bootstrap-project');
    expect(task.description).toContain('/Users/example/.agora/projects/proj-bootstrap/docs/reference/project-nomos-authoring-spec.md');
    expect(task.description).toContain('/Users/example/.agora/projects/proj-bootstrap/nomos/project-nomos');
    expect(task.description).toContain('/Users/example/.agora/projects/proj-bootstrap/prompts/bootstrap/interview.md');
    expect(task.description).toContain('Bootstrap mode: `existing_repo`');
    expect(task.description).toContain('agora nomos refine-project --project-id proj-bootstrap');
    expect(readFileSync(join(projectStateDir, 'proj-bootstrap', 'knowledge', 'facts', 'bootstrap-current-surface.md'), 'utf8')).toContain(
      'Bootstrap Current Surface',
    );
    expect(readFileSync(join(projectStateDir, 'proj-bootstrap', 'knowledge', 'decisions', 'bootstrap-known-constraints.md'), 'utf8')).toContain(
      'Bootstrap Known Constraints',
    );
    expect(readFileSync(join(projectStateDir, 'proj-bootstrap', 'knowledge', 'open-questions', 'bootstrap-open-questions.md'), 'utf8')).toContain(
      'Bootstrap Open Questions',
    );
    expect(projectService.getKnowledgeEntry('proj-bootstrap', 'fact', 'bootstrap-current-surface')?.source_task_ids).toEqual(['OC-HARNESS-BOOTSTRAP']);
    expect(projectService.getKnowledgeEntry('proj-bootstrap', 'decision', 'bootstrap-known-constraints')?.source_task_ids).toEqual(['OC-HARNESS-BOOTSTRAP']);
    expect(projectService.getKnowledgeEntry('proj-bootstrap', 'open_question', 'bootstrap-open-questions')?.source_task_ids).toEqual(['OC-HARNESS-BOOTSTRAP']);
    expect(existsSync(join(projectStateDir, 'proj-bootstrap', 'tasks', 'OC-HARNESS-BOOTSTRAP', '00-bootstrap.md'))).toBe(true);
    expect(existsSync(join(brainPackDir, 'project-index', 'proj-bootstrap', 'index.md'))).toBe(false);
  });
});
