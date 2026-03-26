import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgoraDatabase, runMigrations } from '@agora-ts/db';
import { FilesystemProjectKnowledgeAdapter } from './adapters/filesystem-project-knowledge-adapter.js';
import { FilesystemProjectBrainQueryAdapter } from './adapters/filesystem-project-brain-query-adapter.js';
import { FilesystemTaskBrainWorkspaceAdapter } from './adapters/filesystem-task-brain-workspace-adapter.js';
import { ProjectBootstrapService } from './project-bootstrap-service.js';
import { ProjectBrainAutomationService } from './project-brain-automation-service.js';
import { ProjectBrainService } from './project-brain-service.js';
import { ProjectService } from './project-service.js';
import { TaskBrainBindingService } from './task-brain-binding-service.js';
import { TaskService } from './task-service.js';

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
    const projectService = new ProjectService(db, {
      knowledgePort: new FilesystemProjectKnowledgeAdapter({ brainPackRoot: brainPackDir }),
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
      }),
    });
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-HARNESS-BOOTSTRAP',
      projectService,
      taskBrainBindingService: new TaskBrainBindingService(db, {
        idGenerator: () => 'brain-binding-harness-bootstrap',
      }),
      taskBrainWorkspacePort: new FilesystemTaskBrainWorkspaceAdapter({
        brainPackRoot: brainPackDir,
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
    expect(task.control).toEqual(expect.objectContaining({
      nomos_authoring: {
        kind: 'project_nomos',
        project_id: 'proj-bootstrap',
        auto_refine_on_done: true,
      },
    }));
    expect(task.description).toContain('Global project state root');
    expect(task.description).toContain('/tmp/bootstrap-project');
    expect(task.description).toContain('/Users/example/.agora/projects/proj-bootstrap/docs/reference/project-nomos-authoring-spec.md');
    expect(task.description).toContain('/Users/example/.agora/projects/proj-bootstrap/nomos/project-nomos');
    expect(task.description).toContain('/Users/example/.agora/projects/proj-bootstrap/prompts/bootstrap/interview.md');
    expect(task.description).toContain('Bootstrap mode: `existing_repo`');
    expect(task.description).toContain('agora nomos refine-project --project-id proj-bootstrap');
    expect(readFileSync(join(brainPackDir, 'projects', 'proj-bootstrap', 'knowledge', 'facts', 'bootstrap-current-surface.md'), 'utf8')).toContain(
      'Bootstrap Current Surface',
    );
    expect(readFileSync(join(brainPackDir, 'projects', 'proj-bootstrap', 'knowledge', 'decisions', 'bootstrap-known-constraints.md'), 'utf8')).toContain(
      'Bootstrap Known Constraints',
    );
    expect(readFileSync(join(brainPackDir, 'projects', 'proj-bootstrap', 'knowledge', 'open-questions', 'bootstrap-open-questions.md'), 'utf8')).toContain(
      'Bootstrap Open Questions',
    );
    expect(existsSync(join(brainPackDir, 'projects', 'proj-bootstrap', 'tasks', 'OC-HARNESS-BOOTSTRAP', '00-bootstrap.md'))).toBe(true);
  });
});
