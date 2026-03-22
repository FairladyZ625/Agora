import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgoraDatabase, runMigrations, SubtaskRepository, TaskRepository } from '@agora-ts/db';
import { CitizenService, DashboardQueryService, FilesystemProjectBrainQueryAdapter, FilesystemProjectKnowledgeAdapter, HumanAccountService, OpenClawCitizenProjectionAdapter, ProjectBrainService, ProjectService, RolePackService, StubIMProvisioningPort, TaskContextBindingService, TaskService } from '@agora-ts/core';
import { buildApp } from './app.js';

const tempPaths: string[] = [];
const templatesDir = resolve(process.cwd(), 'templates');

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-server-'));
  tempPaths.push(dir);
  return join(dir, 'tasks.db');
}

function makeEmptyTemplatesDir() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-server-empty-templates-'));
  tempPaths.push(dir);
  mkdirSync(join(dir, 'tasks'), { recursive: true });
  return dir;
}

function makeBrainPackDir() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-server-brain-pack-'));
  tempPaths.push(dir);
  mkdirSync(join(dir, 'projects'), { recursive: true });
  cpSync(resolve(process.cwd(), '../agora-ai-brain/roles'), join(dir, 'roles'), {
    recursive: true,
  });
  return dir;
}

afterEach(() => {
  delete process.env.AGORA_HOME_DIR;
  while (tempPaths.length > 0) {
    const dir = tempPaths.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('task routes', () => {
  it('creates, lists, and fetches task status from the fastify app', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-200',
    });
    const app = buildApp({ taskService });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        title: '接任务接口到 TS server',
        type: 'coding',
        creator: 'archon',
        description: 'Phase 2 route parity',
        priority: 'high',
      },
    });
    const listResponse = await app.inject({
      method: 'GET',
      url: '/api/tasks',
    });
    const statusResponse = await app.inject({
      method: 'GET',
      url: '/api/tasks/OC-200/status',
    });

    expect(createResponse.statusCode).toBe(200);
    expect(createResponse.json()).toMatchObject({
      id: 'OC-200',
      state: 'active',
      current_stage: 'discuss',
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toHaveLength(1);
    expect(statusResponse.statusCode).toBe(200);
    expect(statusResponse.json()).toMatchObject({
      task: {
        id: 'OC-200',
      },
      current_stage_roster: {
        stage_id: 'discuss',
        desired_participant_refs: expect.any(Array),
        joined_participant_refs: expect.any(Array),
      },
      task_blueprint: {
        entry_nodes: ['discuss'],
        nodes: expect.any(Array),
        edges: expect.any(Array),
      },
      flow_log: expect.any(Array),
      progress_log: expect.any(Array),
      subtasks: [],
    });
  });

  it('accepts create-task overrides through the api', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-200B',
    });
    const app = buildApp({ taskService });

    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        title: 'override create route',
        type: 'coding',
        creator: 'archon',
        description: 'custom team',
        priority: 'normal',
        team_override: {
          members: [
            { role: 'architect', agentId: 'opus', model_preference: 'strong_reasoning' },
            { role: 'developer', agentId: 'codex', model_preference: 'fast_coding' },
          ],
        },
        workflow_override: {
          type: 'custom',
          stages: [
            { id: 'kickoff', mode: 'discuss', gate: { type: 'command' } },
            { id: 'build', mode: 'execute', gate: { type: 'all_subtasks_done' } },
          ],
        },
        im_target: {
          provider: 'discord',
          conversation_ref: 'channel-abc',
          visibility: 'private',
          participant_refs: ['opus', 'codex'],
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: 'OC-200B',
      current_stage: 'kickoff',
      team: {
        members: [
          { role: 'architect', agentId: 'opus' },
          { role: 'developer', agentId: 'codex' },
        ],
      },
      workflow: {
        type: 'custom',
        stages: [
          { id: 'kickoff' },
          { id: 'build' },
        ],
      },
    });
  });

  it('rejects create-task overrides whose graph semantics are not runtime-supported', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-200C',
    });
    const app = buildApp({ taskService });

    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        title: 'invalid graph override',
        type: 'custom',
        creator: 'archon',
        description: 'graph should fail closed',
        priority: 'normal',
        team_override: {
          members: [
            { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
          ],
        },
        workflow_override: {
          type: 'custom',
          stages: [
            { id: 'draft', mode: 'discuss', gate: { type: 'command' } },
            { id: 'review', mode: 'discuss', gate: { type: 'approval', approver: 'reviewer' } },
            { id: 'ship', mode: 'execute', gate: { type: 'all_subtasks_done' } },
          ],
          graph: {
            graph_version: 1,
            entry_nodes: ['draft', 'review'],
            nodes: [
              { id: 'draft', kind: 'stage', gate: { type: 'command' } },
              { id: 'review', kind: 'stage', gate: { type: 'approval', approver: 'reviewer' } },
              { id: 'ship', kind: 'stage', gate: { type: 'all_subtasks_done' } },
            ],
            edges: [
              { id: 'draft__advance__review', from: 'draft', to: 'review', kind: 'advance' },
              { id: 'review__advance__ship', from: 'review', to: 'ship', kind: 'advance' },
              { id: 'review__reject__ship', from: 'review', to: 'ship', kind: 'reject' },
            ],
          },
        },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      message: expect.stringContaining('runtime-supported graph semantics'),
    });
  });

  it('rejects create-task overrides whose graph nodes and workflow stages are out of sync', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-200D',
    });
    const app = buildApp({ taskService });

    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        title: 'misaligned graph override',
        type: 'custom',
        creator: 'archon',
        description: 'graph and stages should align',
        priority: 'normal',
        team_override: {
          members: [
            { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
          ],
        },
        workflow_override: {
          type: 'custom',
          stages: [
            { id: 'draft', mode: 'discuss', gate: { type: 'command' } },
            { id: 'review', mode: 'discuss', gate: { type: 'approval', approver: 'reviewer' } },
          ],
          graph: {
            graph_version: 1,
            entry_nodes: ['draft'],
            nodes: [
              { id: 'draft', kind: 'stage', gate: { type: 'command' } },
              { id: 'ship', kind: 'stage', gate: { type: 'all_subtasks_done' } },
            ],
            edges: [
              { id: 'draft__advance__ship', from: 'draft', to: 'ship', kind: 'advance' },
            ],
          },
        },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      message: expect.stringMatching(/missing from graph nodes|missing from workflow stages/),
    });
  });

  it('creates and lists projects through the api', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const app = buildApp({
      db,
      projectService: new ProjectService(db),
    });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: {
        name: 'Project API',
        summary: 'server thin slice',
        owner: 'archon',
      },
    });
    const listResponse = await app.inject({
      method: 'GET',
      url: '/api/projects',
    });

    expect(createResponse.statusCode).toBe(200);
    expect(createResponse.json()).toMatchObject({
      name: 'Project API',
      status: 'active',
    });
    expect(createResponse.json().id).toMatch(/^proj-[a-z0-9-]+$/);
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toMatchObject({
      projects: [
        expect.objectContaining({
          name: 'Project API',
        }),
      ],
    });
  });

  it('creates a Nomos-aware project through the api and writes the repo shim/global state skeleton', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const agoraHomeDir = mkdtempSync(join(tmpdir(), 'agora-ts-server-home-'));
    tempPaths.push(agoraHomeDir);
    process.env.AGORA_HOME_DIR = agoraHomeDir;
    const repoParent = mkdtempSync(join(tmpdir(), 'agora-ts-server-repo-parent-'));
    tempPaths.push(repoParent);
    const repoRoot = join(repoParent, 'repo-beta');
    const projectService = new ProjectService(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-SERVER-NOMOS-BOOTSTRAP',
      projectService,
    });
    const app = buildApp({
      db,
      projectService,
      taskService,
    });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: {
        id: 'proj-nomos-api',
        name: 'Project API Nomos',
        repo_path: repoRoot,
        initialize_repo: true,
      },
    });

    expect(createResponse.statusCode).toBe(200);
    expect(createResponse.json()).toMatchObject({
      id: 'proj-nomos-api',
      name: 'Project API Nomos',
      status: 'active',
      metadata: {
        repo_path: repoRoot,
        agora: {
          nomos: {
            id: 'agora/default',
          },
        },
      },
    });
    expect(existsSync(join(repoRoot, 'AGENTS.md'))).toBe(true);
    expect(readFileSync(join(repoRoot, 'AGENTS.md'), 'utf8')).toContain('## Fill Policy');
    expect(readFileSync(join(agoraHomeDir, 'projects', 'proj-nomos-api', 'profile.toml'), 'utf8')).toContain(
      'id = "proj-nomos-api"',
    );
    expect(taskService.getTask('OC-SERVER-NOMOS-BOOTSTRAP')?.title).toBe('Bootstrap Project Harness: Project API Nomos');
    expect(taskService.getTask('OC-SERVER-NOMOS-BOOTSTRAP')?.description).toContain(
      join(agoraHomeDir, 'projects', 'proj-nomos-api', 'prompts', 'bootstrap', 'interview.md'),
    );
    expect(taskService.getTask('OC-SERVER-NOMOS-BOOTSTRAP')?.description).toContain('Bootstrap mode: `new_repo`');
  });

  it('serves explicit Nomos catalog and project install state through the api', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const agoraHomeDir = mkdtempSync(join(tmpdir(), 'agora-ts-server-nomos-home-'));
    tempPaths.push(agoraHomeDir);
    process.env.AGORA_HOME_DIR = agoraHomeDir;
    const repoParent = mkdtempSync(join(tmpdir(), 'agora-ts-server-nomos-repo-'));
    tempPaths.push(repoParent);
    const repoRoot = join(repoParent, 'repo-gamma');
    const projectService = new ProjectService(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-SERVER-NOMOS-INSTALL',
      projectService,
    });
    const app = buildApp({
      db,
      projectService,
      taskService,
    });

    projectService.createProject({
      id: 'proj-nomos-rest',
      name: 'Project REST Nomos',
      owner: 'archon',
    });

    const listResponse = await app.inject({
      method: 'GET',
      url: '/api/nomos',
    });
    const showResponse = await app.inject({
      method: 'GET',
      url: '/api/nomos/agora/default',
    });
    const installResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/proj-nomos-rest/nomos/install',
      payload: {
        repo_path: repoRoot,
        initialize_repo: true,
      },
    });
    const inspectResponse = await app.inject({
      method: 'GET',
      url: '/api/projects/proj-nomos-rest/nomos',
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toMatchObject({
      nomos: [
        expect.objectContaining({
          id: 'agora/default',
          version: '0.1.0',
        }),
      ],
    });

    expect(showResponse.statusCode).toBe(200);
    expect(showResponse.json()).toMatchObject({
      id: 'agora/default',
      pack: expect.objectContaining({
        id: 'agora/default',
        version: '0.1.0',
      }),
      lifecycle: expect.objectContaining({
        modules: expect.arrayContaining(['project-bootstrap', 'task-context-delivery']),
      }),
    });

    expect(installResponse.statusCode).toBe(200);
    expect(installResponse.json()).toMatchObject({
      project_id: 'proj-nomos-rest',
      nomos: expect.objectContaining({
        id: 'agora/default',
      }),
      bootstrap_task_id: 'OC-SERVER-NOMOS-INSTALL',
    });

    expect(inspectResponse.statusCode).toBe(200);
    expect(inspectResponse.json()).toMatchObject({
      project_id: 'proj-nomos-rest',
      nomos_id: 'agora/default',
      project_state_root: join(agoraHomeDir, 'projects', 'proj-nomos-rest'),
      repo_path: repoRoot,
      repo_shim_installed: true,
      profile_installed: true,
    });
    expect(readFileSync(join(repoRoot, 'AGENTS.md'), 'utf8')).toContain('## Bootstrap Method');
    expect(taskService.getTask('OC-SERVER-NOMOS-INSTALL')?.title).toBe('Bootstrap Project Harness: Project REST Nomos');
  });

  it('serves project-level Nomos doctor output through the api', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const app = buildApp({
      db,
      projectBrainDoctorService: {
        diagnoseProject: async (projectId: string) => ({
          project_id: projectId,
          db_path: '/tmp/agora.db',
          embedding: {
            configured: true,
            healthy: true,
            provider: 'openai-compatible',
            model: 'embedding-3',
          },
          vector_index: {
            configured: true,
            provider: 'qdrant',
            healthy: true,
            chunk_count: 16,
          },
          jobs: {
            pending: 0,
            running: 0,
            failed: 0,
            succeeded: 4,
          },
          drift: {
            detected: false,
            documents_without_jobs: 0,
          },
        }),
      } as never,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/projects/proj-nomos-rest/nomos/doctor',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      project_id: 'proj-nomos-rest',
      embedding: {
        healthy: true,
      },
      vector_index: {
        provider: 'qdrant',
        chunk_count: 16,
      },
      drift: {
        detected: false,
      },
    });
  });

  it('serves a project workbench detail bundle through the api', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackRoot = makeBrainPackDir();
    const projectService = new ProjectService(db, {
      knowledgePort: new FilesystemProjectKnowledgeAdapter({ brainPackRoot }),
    });
    projectService.createProject({
      id: 'proj-workbench',
      name: 'Project Workbench',
      summary: 'dashboard surface',
      owner: 'archon',
    });
    projectService.upsertKnowledgeEntry({
      project_id: 'proj-workbench',
      kind: 'decision',
      slug: 'runtime-boundary',
      title: 'Runtime Boundary',
      summary: 'Keep runtime adapters outside core.',
      body: 'Core keeps orchestration semantics. Runtime adapters stay outside core.',
      source_task_ids: ['OC-WB-1'],
    });
    projectService.recordTaskRecap({
      project_id: 'proj-workbench',
      task_id: 'OC-WB-1',
      title: 'Workbench recap',
      state: 'done',
      current_stage: 'ship',
      controller_ref: 'opus',
      workspace_path: join(brainPackRoot, 'projects', 'proj-workbench', 'tasks', 'OC-WB-1'),
      completed_by: 'archon',
      completed_at: '2026-03-16T12:00:00.000Z',
      summary_lines: ['Task recap line'],
    });
    mkdirSync(join(brainPackRoot, 'projects', 'proj-workbench', 'recaps'), { recursive: true });
    writeFileSync(
      join(brainPackRoot, 'projects', 'proj-workbench', 'recaps', 'OC-WB-1.md'),
      '# Workbench recap\n\nTask recap line\n',
      'utf8',
    );
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
        boundaries: ['Keep runtime adapters outside core.'],
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
      project_id: 'proj-workbench',
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
    const app = buildApp({
      db,
      projectService,
      projectBrainService,
      citizenService,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/projects/proj-workbench',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      project: {
        id: 'proj-workbench',
        name: 'Project Workbench',
      },
      index: expect.objectContaining({
        kind: 'index',
      }),
      timeline: expect.objectContaining({
        kind: 'timeline',
        slug: 'timeline',
      }),
      recaps: [
        expect.objectContaining({
          task_id: 'OC-WB-1',
          content: expect.stringContaining('Task recap line'),
        }),
      ],
      knowledge: [
        expect.objectContaining({
          kind: 'decision',
          slug: 'runtime-boundary',
        }),
      ],
      citizens: [
        expect.objectContaining({
          citizen_id: 'citizen-alpha',
        }),
      ],
    });
  });

  it('creates a task bound to a project through the api', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    new ProjectService(db).createProject({
      id: 'proj-api-task',
      name: 'Project API Task',
      owner: 'archon',
    });
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-200P',
    });
    const app = buildApp({
      taskService,
      projectService: new ProjectService(db),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        title: 'project bound task',
        type: 'coding',
        creator: 'archon',
        description: 'project-aware create route',
        priority: 'high',
        project_id: 'proj-api-task',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: 'OC-200P',
      project_id: 'proj-api-task',
      state: 'active',
    });
  });

  it('archives and deletes projects through the api with lifecycle guards', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const projectService = new ProjectService(db);
    const app = buildApp({
      db,
      projectService,
    });

    await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: {
        id: 'proj-api-lifecycle',
        name: 'Project API Lifecycle',
      },
    });

    const archiveResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/proj-api-lifecycle/archive',
    });
    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: '/api/projects/proj-api-lifecycle',
    });

    expect(archiveResponse.statusCode).toBe(200);
    expect(archiveResponse.json()).toMatchObject({
      id: 'proj-api-lifecycle',
      status: 'archived',
    });
    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteResponse.json()).toMatchObject({
      ok: true,
      project_id: 'proj-api-lifecycle',
    });
    expect(projectService.getProject('proj-api-lifecycle')).toBeNull();
  });

  it('filters task list by project through the api', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const projectService = new ProjectService(db);
    projectService.createProject({
      id: 'proj-api-a',
      name: 'Project A',
      owner: 'archon',
    });
    projectService.createProject({
      id: 'proj-api-b',
      name: 'Project B',
      owner: 'archon',
    });
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: (() => {
        let index = 0;
        return () => `OC-20${++index}`;
      })(),
    });
    taskService.createTask({
      title: 'project a task',
      type: 'coding',
      creator: 'archon',
      description: 'belongs to project a',
      priority: 'high',
      project_id: 'proj-api-a',
    });
    taskService.createTask({
      title: 'project b task',
      type: 'coding',
      creator: 'archon',
      description: 'belongs to project b',
      priority: 'high',
      project_id: 'proj-api-b',
    });
    const app = buildApp({ taskService });

    const response = await app.inject({
      method: 'GET',
      url: '/api/tasks?project_id=proj-api-a',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);
    expect(response.json()[0]).toMatchObject({
      title: 'project a task',
      project_id: 'proj-api-a',
    });
  });

  it('creates ad-hoc tasks through the api when complete overrides are provided for an unknown type', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir: makeEmptyTemplatesDir(),
      taskIdGenerator: () => 'OC-200C',
    });
    const app = buildApp({ taskService });

    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        title: 'ad-hoc override route',
        type: 'adhoc-route-task',
        creator: 'archon',
        description: 'custom workflow only',
        priority: 'normal',
        team_override: {
          members: [
            { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
            { role: 'developer', agentId: 'codex', member_kind: 'citizen', model_preference: 'fast_coding' },
          ],
        },
        workflow_override: {
          type: 'custom',
          stages: [
            { id: 'triage', mode: 'discuss', gate: { type: 'command' } },
            { id: 'ship', mode: 'execute', gate: { type: 'all_subtasks_done' } },
          ],
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: 'OC-200C',
      type: 'adhoc-route-task',
      current_stage: 'triage',
      team: {
        members: [
          { role: 'architect', agentId: 'opus' },
          { role: 'developer', agentId: 'codex' },
        ],
      },
      workflow: {
        type: 'custom',
        stages: [
          { id: 'triage' },
          { id: 'ship' },
        ],
      },
    });
  });

  it('adds the dashboard session user discord identity to private-thread participants', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const provisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'stub-thread-OC-200C',
    });
    const bindingService = new TaskContextBindingService(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-200C',
      imProvisioningPort: provisioningPort,
      taskContextBindingService: bindingService,
    });
    const humanAccountService = new HumanAccountService(db);
    humanAccountService.createUser({
      username: 'alice',
      password: 'secret-pass',
      role: 'member',
    });
    humanAccountService.bindIdentity({
      username: 'alice',
      provider: 'discord',
      externalUserId: 'discord-user-123',
    });
    const app = buildApp({
      taskService,
      humanAccountService,
      dashboardAuth: {
        enabled: true,
        method: 'session',
        allowedUsers: [],
        sessionTtlHours: 24,
      },
    });

    const login = await app.inject({
      method: 'POST',
      url: '/api/dashboard/session/login',
      payload: {
        username: 'alice',
        password: 'secret-pass',
      },
    });
    const cookie = login.headers['set-cookie'];
    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      headers: {
        cookie: Array.isArray(cookie) ? cookie[0] : String(cookie),
      },
      payload: {
        title: 'route adds human discord identity',
        type: 'coding',
        creator: 'archon',
        description: 'custom team',
        priority: 'normal',
        im_target: {
          provider: 'discord',
          visibility: 'private',
          participant_refs: ['opus'],
        },
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(response.statusCode).toBe(200);
    expect(provisioningPort.provisioned[0]?.participant_refs).toEqual(
      expect.arrayContaining(['opus', 'discord-user-123']),
    );
    expect(provisioningPort.joined).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ participant_ref: 'opus' }),
        expect.objectContaining({ participant_ref: 'discord-user-123' }),
      ]),
    );
  });

  it('adds the IM-resolved human discord identity to private-thread participants', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const provisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'stub-thread-OC-200D',
    });
    const bindingService = new TaskContextBindingService(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-200D',
      imProvisioningPort: provisioningPort,
      taskContextBindingService: bindingService,
    });
    const humanAccountService = new HumanAccountService(db);
    humanAccountService.createUser({
      username: 'alice',
      password: 'secret-pass',
      role: 'member',
    });
    humanAccountService.bindIdentity({
      username: 'alice',
      provider: 'discord',
      externalUserId: 'discord-user-123',
    });
    const app = buildApp({
      taskService,
      humanAccountService,
      dashboardAuth: {
        enabled: true,
        method: 'session',
        allowedUsers: [],
        sessionTtlHours: 24,
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      headers: {
        'x-agora-human-provider': 'discord',
        'x-agora-human-external-id': 'discord-user-123',
      },
      payload: {
        title: 'route adds im human discord identity',
        type: 'coding',
        creator: 'archon',
        description: 'custom team',
        priority: 'normal',
        im_target: {
          provider: 'discord',
          visibility: 'private',
          participant_refs: ['opus'],
        },
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(response.statusCode).toBe(200);
    expect(provisioningPort.provisioned[0]?.participant_refs).toEqual(
      expect.arrayContaining(['opus', 'discord-user-123']),
    );
    expect(provisioningPort.joined).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ participant_ref: 'opus' }),
        expect.objectContaining({ participant_ref: 'discord-user-123' }),
      ]),
    );
  });

  it('returns 403 on advance when gate is not satisfied', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-201',
    });
    taskService.createTask({
      title: '测试 gate 拒绝',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });

    const app = buildApp({ taskService });
    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-201/advance',
      payload: {
        caller_id: 'archon',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      message: "Gate check failed for stage 'discuss' (gate type: archon_review)",
    });
  });

  it('accepts next_stage_id on advance when the current stage branches', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-201B',
      archonUsers: ['archon'],
    });
    taskService.createTask({
      title: 'branching advance route',
      type: 'custom',
      creator: 'archon',
      description: '',
      priority: 'normal',
      team_override: {
        members: [
          { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
        ],
      },
      workflow_override: {
        type: 'custom',
        stages: [
          { id: 'triage', mode: 'discuss', gate: { type: 'command' } },
          { id: 'fast-path', mode: 'execute', gate: { type: 'all_subtasks_done' } },
          { id: 'deep-review', mode: 'discuss', gate: { type: 'approval', approver: 'reviewer' } },
        ],
        graph: {
          graph_version: 1,
          entry_nodes: ['triage'],
          nodes: [
            { id: 'triage', kind: 'stage', gate: { type: 'command' } },
            { id: 'fast-path', kind: 'stage', gate: { type: 'all_subtasks_done' } },
            { id: 'deep-review', kind: 'stage', gate: { type: 'approval', approver: 'reviewer' } },
          ],
          edges: [
            { id: 'triage__branch__fast-path', from: 'triage', to: 'fast-path', kind: 'branch' },
            { id: 'triage__branch__deep-review', from: 'triage', to: 'deep-review', kind: 'branch' },
          ],
        },
      },
    });

    const app = buildApp({ taskService });
    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-201B/advance',
      payload: {
        caller_id: 'archon',
        next_stage_id: 'deep-review',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: 'OC-201B',
      current_stage: 'deep-review',
    });
  });

  it('marks graph-backed tasks done when advance follows a complete edge into a terminal node', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-201C',
      archonUsers: ['archon'],
    });
    taskService.createTask({
      title: 'complete edge advance route',
      type: 'custom',
      creator: 'archon',
      description: '',
      priority: 'normal',
      team_override: {
        members: [
          { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
        ],
      },
      workflow_override: {
        type: 'custom',
        stages: [
          { id: 'deliver', mode: 'execute', gate: { type: 'command' } },
        ],
        graph: {
          graph_version: 1,
          entry_nodes: ['deliver'],
          nodes: [
            { id: 'deliver', kind: 'stage', gate: { type: 'command' } },
            { id: 'done', kind: 'terminal' },
          ],
          edges: [
            { id: 'deliver__complete__done', from: 'deliver', to: 'done', kind: 'complete' },
          ],
        },
      },
    });

    const app = buildApp({ taskService });
    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-201C/advance',
      payload: {
        caller_id: 'archon',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: 'OC-201C',
      state: 'done',
      current_stage: null,
    });
  });

  it('supports thread-scoped current approve/reject routes for IM users', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const provisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'thread-current-approve-1',
    });
    const taskContextBindingService = new TaskContextBindingService(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: (() => {
        const ids = ['OC-CURRENT-1', 'OC-CURRENT-2'];
        return () => ids.shift() ?? 'OC-CURRENT-X';
      })(),
      archonUsers: ['alice'],
      allowAgents: {
        opus: { canCall: [], canAdvance: true },
      },
      imProvisioningPort: provisioningPort,
      taskContextBindingService,
    });
    const humanAccountService = new HumanAccountService(db);
    humanAccountService.createUser({
      username: 'alice',
      password: 'secret-pass',
      role: 'admin',
    });
    humanAccountService.bindIdentity({
      username: 'alice',
      provider: 'discord',
      externalUserId: 'discord-user-123',
    });

    taskService.createTask({
      title: 'current approve route',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      im_target: { provider: 'discord', visibility: 'private' },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const app = buildApp({
      taskService,
      taskContextBindingService,
      humanAccountService,
      dashboardAuth: {
        enabled: true,
        method: 'session',
        allowedUsers: [],
        sessionTtlHours: 24,
      },
    });

    const approveCurrentSpoofed = await app.inject({
      method: 'POST',
      url: '/api/im/tasks/current/approve',
      headers: {
        authorization: 'Bearer test-token',
      },
      payload: {
        provider: 'discord',
        thread_ref: 'thread-current-approve-1',
        comment: 'spoofed',
      },
    });

    const secondProvisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'thread-current-reject-2',
    });
    const secondTaskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-CURRENT-2',
      archonUsers: ['alice'],
      allowAgents: {
        opus: { canCall: [], canAdvance: true },
      },
      imProvisioningPort: secondProvisioningPort,
      taskContextBindingService,
    });

    secondTaskService.createTask({
      title: 'current reject route',
      type: 'document',
      creator: 'archon',
      description: '',
      priority: 'normal',
      im_target: { provider: 'discord', visibility: 'private' },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    secondTaskService.archonApproveTask('OC-CURRENT-2', {
      reviewerId: 'alice',
      comment: 'outline ok',
    });
    const subtasks = new SubtaskRepository(db);
    subtasks.insertSubtask({
      id: 'write-current-2',
      task_id: 'OC-CURRENT-2',
      stage_id: 'write',
      title: 'write body',
      assignee: 'glm5',
      status: 'done',
    });
    secondTaskService.advanceTask('OC-CURRENT-2', { callerId: 'alice' });

    const rejectCurrentSpoofed = await app.inject({
      method: 'POST',
      url: '/api/im/tasks/current/reject',
      headers: {
        authorization: 'Bearer test-token',
      },
      payload: {
        provider: 'discord',
        thread_ref: 'thread-current-reject-2',
        reason: 'spoofed',
      },
    });
    const approveCurrent = await app.inject({
      method: 'POST',
      url: '/api/im/tasks/current/approve',
      headers: {
        'x-agora-human-provider': 'discord',
        'x-agora-human-external-id': 'discord-user-123',
      },
      payload: {
        provider: 'discord',
        thread_ref: 'thread-current-approve-1',
        comment: 'looks good',
      },
    });
    const rejectCurrent = await app.inject({
      method: 'POST',
      url: '/api/im/tasks/current/reject',
      headers: {
        'x-agora-human-provider': 'discord',
        'x-agora-human-external-id': 'discord-user-123',
      },
      payload: {
        provider: 'discord',
        thread_ref: 'thread-current-reject-2',
        reason: 'needs more detail',
      },
    });

    expect(approveCurrentSpoofed.statusCode).toBe(403);
    expect(approveCurrentSpoofed.json()).toEqual({ message: 'missing authenticated human actor' });
    expect(rejectCurrentSpoofed.statusCode).toBe(403);
    expect(rejectCurrentSpoofed.json()).toEqual({ message: 'missing authenticated human actor' });
    expect(approveCurrent.statusCode).toBe(200);
    expect(approveCurrent.json()).toMatchObject({
      id: 'OC-CURRENT-1',
      current_stage: 'develop',
    });
    expect(rejectCurrent.statusCode).toBe(200);
    expect(rejectCurrent.json()).toMatchObject({
      id: 'OC-CURRENT-2',
      current_stage: 'write',
    });
  });

  it('serves task action routes for archon approve, subtask done, force advance, and approve', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-202',
    });
    const subtasks = new SubtaskRepository(db);

    taskService.createTask({
      title: '补 task action routes',
      type: 'document',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });

    const app = buildApp({ taskService });

    const archonApprove = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-202/archon-approve',
      payload: {
        reviewer_id: 'lizeyu',
        comment: 'outline ok',
      },
    });

    subtasks.insertSubtask({
      id: 'write-202',
      task_id: 'OC-202',
      stage_id: 'write',
      title: '写正文',
      assignee: 'glm5',
    });

    const subtaskDone = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-202/subtask-done',
      payload: {
        subtask_id: 'write-202',
        caller_id: 'glm5',
        output: 'done',
      },
    });
    const advance = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-202/advance',
      payload: {
        caller_id: 'archon',
      },
    });
    const approve = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-202/approve',
      payload: {
        approver_id: 'gpt52',
        comment: 'looks good',
      },
    });

    expect(archonApprove.statusCode).toBe(200);
    expect(archonApprove.json()).toMatchObject({
      id: 'OC-202',
      current_stage: 'write',
    });
    expect(subtaskDone.statusCode).toBe(200);
    expect(advance.statusCode).toBe(200);
    expect(approve.statusCode).toBe(200);
    expect(approve.json()).toMatchObject({
      id: 'OC-202',
      state: 'done',
    });

    subtasks.insertSubtask({
      id: 'archive-202',
      task_id: 'OC-202',
      stage_id: 'write',
      title: '归档稿件',
      assignee: 'glm5',
    });
    subtasks.insertSubtask({
      id: 'cancel-202',
      task_id: 'OC-202',
      stage_id: 'write',
      title: '取消稿件',
      assignee: 'glm5',
    });
    const subtaskArchive = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-202/subtasks/archive-202/archive',
      payload: {
        caller_id: 'glm5',
        note: 'hold',
      },
    });
    const subtaskCancel = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-202/subtasks/cancel-202/cancel',
      payload: {
        caller_id: 'glm5',
        note: 'drop',
      },
    });
    expect(subtaskArchive.statusCode).toBe(200);
    expect(subtaskCancel.statusCode).toBe(200);
  });

  it('serves confirm and state transition routes', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-203',
    });
    const tasks = new TaskRepository(db);

    tasks.insertTask({
      id: 'OC-203',
      title: '确认与状态切换',
      description: '',
      type: 'custom',
      priority: 'normal',
      creator: 'archon',
      team: {
        members: [
          { role: 'architect', agentId: 'opus', model_preference: 'reasoning' },
          { role: 'reviewer', agentId: 'gpt52', model_preference: 'review' },
        ],
      },
      workflow: {
        type: 'vote',
        stages: [{ id: 'vote', gate: { type: 'quorum', required: 2 } }],
      },
    });
    tasks.updateTask('OC-203', 1, { state: 'created' });
    tasks.updateTask('OC-203', 2, { state: 'active', current_stage: 'vote' });
    db.prepare('INSERT INTO stage_history (task_id, stage_id) VALUES (?, ?)').run('OC-203', 'vote');

    const app = buildApp({ taskService });

    const confirmOne = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-203/confirm',
      payload: {
        voter_id: 'opus',
        vote: 'approve',
        comment: 'one',
      },
    });
    const confirmTwo = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-203/confirm',
      payload: {
        voter_id: 'gpt52',
        vote: 'approve',
        comment: 'two',
      },
    });
    const pause = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-203/pause',
      payload: {
        reason: 'hold',
      },
    });
    const resume = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-203/resume',
    });
    const cancel = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-203/cancel',
      payload: {
        reason: 'closed',
      },
    });

    expect(confirmOne.statusCode).toBe(200);
    expect(confirmOne.json().quorum).toMatchObject({ approved: 1, total: 1 });
    expect(confirmTwo.statusCode).toBe(200);
    expect(confirmTwo.json().quorum).toMatchObject({ approved: 2, total: 2 });
    expect(pause.statusCode).toBe(200);
    expect(pause.json()).toMatchObject({ state: 'paused' });
    expect(resume.statusCode).toBe(200);
    expect(resume.json()).toMatchObject({ state: 'active' });
    expect(cancel.statusCode).toBe(200);
    expect(cancel.json()).toMatchObject({ state: 'cancelled' });
  });

  it('drives IM context archive/unarchive through pause, resume, and cancel routes', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const provisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'stub-thread-OC-CTX-ROUTE',
    });
    const bindingService = new TaskContextBindingService(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-CTX-ROUTE',
      imProvisioningPort: provisioningPort,
      taskContextBindingService: bindingService,
    });
    const app = buildApp({ taskService });

    const create = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        title: 'route lifecycle',
        type: 'coding',
        creator: 'archon',
        description: '',
        priority: 'normal',
        im_target: {
          provider: 'discord',
          visibility: 'private',
          participant_refs: ['530383608410800138'],
        },
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const pause = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-CTX-ROUTE/pause',
      payload: { reason: 'hold' },
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    const resume = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-CTX-ROUTE/resume',
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    const cancel = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-CTX-ROUTE/cancel',
      payload: { reason: 'closed' },
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(create.statusCode).toBe(200);
    expect(pause.statusCode).toBe(200);
    expect(resume.statusCode).toBe(200);
    expect(cancel.statusCode).toBe(200);
    expect(provisioningPort.archived).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ mode: 'archive', thread_ref: 'stub-thread-OC-CTX-ROUTE' }),
        expect.objectContaining({ mode: 'unarchive', thread_ref: 'stub-thread-OC-CTX-ROUTE' }),
      ]),
    );
    expect(bindingService.listBindings('OC-CTX-ROUTE')[0]?.status).toBe('archived');
  });

  it('creates and lists subtasks through the task routes', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-202-SUBTASK',
    });
    const app = buildApp({ taskService });

    taskService.createTask({
      title: 'Subtask routes',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'develop',
            mode: 'execute',
            execution_kind: 'citizen_execute',
            allowed_actions: ['execute'],
            gate: { type: 'all_subtasks_done' },
          },
        ],
      },
    });

    const create = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-202-SUBTASK/subtasks',
      payload: {
        caller_id: 'opus',
        subtasks: [
          {
            id: 'build-api',
            title: 'Build API',
            assignee: 'sonnet',
            execution_target: 'manual',
          },
        ],
      },
    });
    const list = await app.inject({
      method: 'GET',
      url: '/api/tasks/OC-202-SUBTASK/subtasks',
    });

    expect(create.statusCode).toBe(200);
    expect(create.json()).toMatchObject({
      task: {
        id: 'OC-202-SUBTASK',
      },
      subtasks: [
        {
          id: 'build-api',
          stage_id: 'develop',
          assignee: 'sonnet',
        },
      ],
      dispatched_executions: [],
    });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({
      subtasks: [
        {
          id: 'build-api',
          stage_id: 'develop',
        },
      ],
    });
  });

  it('creates tasks with skill policy through the task routes', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-ROUTE-SKILL',
    });
    const app = buildApp({ taskService });

    const create = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        title: 'route skill create',
        type: 'coding',
        creator: 'archon',
        description: '',
        priority: 'normal',
        skill_policy: {
          global_refs: ['planning-with-files'],
          role_refs: {
            developer: ['refactoring-ui'],
          },
          enforcement: 'required',
        },
      },
    });

    expect(create.statusCode).toBe(200);
    expect(create.json()).toMatchObject({
      id: 'OC-ROUTE-SKILL',
      skill_policy: {
        global_refs: ['planning-with-files'],
        role_refs: {
          developer: ['refactoring-ui'],
        },
        enforcement: 'required',
      },
    });
  });

  it('approves review-pending archive jobs before sync and deletes the IM context through the route', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const provisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'stub-thread-OC-CTX-DELETE',
    });
    const bindingService = new TaskContextBindingService(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-CTX-DELETE',
      imProvisioningPort: provisioningPort,
      taskContextBindingService: bindingService,
    });
    const dashboardQueries = new DashboardQueryService(db, {
      templatesDir,
      taskContextBindingService: bindingService,
      imProvisioningPort: provisioningPort,
    });
    const app = buildApp({ taskService, dashboardQueryService: dashboardQueries });

    await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        title: 'route archive delete',
        type: 'coding',
        creator: 'archon',
        description: '',
        priority: 'normal',
        im_target: {
          provider: 'discord',
          visibility: 'private',
          participant_refs: ['530383608410800138'],
        },
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-CTX-DELETE/cancel',
      payload: { reason: 'closed' },
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    const archiveJob = await app.inject({
      method: 'GET',
      url: '/api/archive/jobs?task_id=OC-CTX-DELETE',
    });
    const jobId = archiveJob.json()[0].id;
    expect(archiveJob.json()[0]).toMatchObject({
      status: 'review_pending',
    });
    const approved = await app.inject({
      method: 'POST',
      url: `/api/archive/jobs/${jobId}/approve`,
      payload: {
        approver_id: 'lizeyu',
        comment: 'closeout reviewed',
      },
    });
    const synced = await app.inject({
      method: 'POST',
      url: `/api/archive/jobs/${jobId}/status`,
      payload: { status: 'synced', commit_hash: 'route-sync' },
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(approved.statusCode).toBe(200);
    expect(approved.json()).toMatchObject({
      id: jobId,
      status: 'pending',
      payload: expect.objectContaining({
        closeout_review: expect.objectContaining({
          state: 'approved',
          approver_id: 'lizeyu',
        }),
      }),
    });
    expect(synced.statusCode).toBe(200);
    expect(provisioningPort.archived).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ mode: 'delete', thread_ref: 'stub-thread-OC-CTX-DELETE' }),
      ]),
    );
    expect(bindingService.listBindings('OC-CTX-DELETE')[0]?.status).toBe('destroyed');
  });

  it('serves cleanup route for orphaned tasks', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-204',
    });
    const tasks = new TaskRepository(db);

    tasks.insertTask({
      id: 'OC-204',
      title: 'cleanup task',
      description: '',
      type: 'custom',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: { stages: [] },
    });
    tasks.updateTask('OC-204', 1, { state: 'orphaned' });

    const app = buildApp({ taskService });
    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks/cleanup',
      payload: { task_id: 'OC-204' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ cleaned: 1 });
    expect(taskService.getTask('OC-204')).toBeNull();
  });

  it('serves probe-stuck route for manual escalation scans', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const provisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      thread_ref: 'thread-probe-route-1',
    });
    const taskContextBindingService = new TaskContextBindingService(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-PROBE-ROUTE-1',
      imProvisioningPort: provisioningPort,
      taskContextBindingService,
    });

    taskService.createTask({
      title: 'probe route',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      im_target: { provider: 'discord', visibility: 'private' },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    provisioningPort.published.length = 0;
    db.prepare('UPDATE tasks SET updated_at = ? WHERE id = ?').run('2026-03-12T00:00:00.000Z', 'OC-PROBE-ROUTE-1');
    db.prepare('UPDATE flow_log SET created_at = ? WHERE task_id = ?').run('2026-03-12T00:00:00.000Z', 'OC-PROBE-ROUTE-1');
    db.prepare('UPDATE progress_log SET created_at = ? WHERE task_id = ?').run('2026-03-12T00:00:00.000Z', 'OC-PROBE-ROUTE-1');

    const app = buildApp({ taskService });
    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks/probe-stuck',
      payload: {
        controller_after_ms: 1000,
        roster_after_ms: 2000,
        inbox_after_ms: 3000,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      scanned_tasks: 1,
      controller_pings: 1,
      roster_pings: 0,
      inbox_items: 0,
    });
  });

  it('serves reject, archon-reject, and unblock routes', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-205',
    });
    const subtasks = new SubtaskRepository(db);
    const tasks = new TaskRepository(db);

    taskService.createTask({
      title: 'review rejection route',
      type: 'document',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    taskService.archonApproveTask('OC-205', {
      reviewerId: 'lizeyu',
      comment: 'outline ok',
    });
    subtasks.insertSubtask({
      id: 'write-205',
      task_id: 'OC-205',
      stage_id: 'write',
      title: '写正文',
      assignee: 'glm5',
    });
    taskService.completeSubtask('OC-205', {
      subtaskId: 'write-205',
      callerId: 'glm5',
      output: 'done',
    });
    taskService.advanceTask('OC-205', { callerId: 'archon' });

    tasks.insertTask({
      id: 'OC-206',
      title: 'archon reject route',
      description: '',
      type: 'custom',
      priority: 'normal',
      creator: 'archon',
      team: { members: [{ role: 'architect', agentId: 'opus', model_preference: 'reasoning' }] },
      workflow: {
        type: 'archon-review',
        stages: [
          { id: 'draft', gate: { type: 'command' } },
          { id: 'review', gate: { type: 'archon_review' }, reject_target: 'draft' },
        ],
      },
    });
    tasks.updateTask('OC-206', 1, { state: 'created' });
    tasks.updateTask('OC-206', 2, { state: 'active', current_stage: 'review' });
    db.prepare('INSERT INTO stage_history (task_id, stage_id) VALUES (?, ?)').run('OC-206', 'review');

    tasks.insertTask({
      id: 'OC-207',
      title: 'unblock route',
      description: '',
      type: 'custom',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: { stages: [] },
    });
    tasks.updateTask('OC-207', 1, { state: 'created' });
    tasks.updateTask('OC-207', 2, { state: 'active' });
    taskService.updateTaskState('OC-207', 'blocked', { reason: 'dependency' });

    const app = buildApp({ taskService });

    const reject = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-205/reject',
      payload: {
        rejector_id: 'gpt52',
        reason: 'needs more detail',
      },
    });
    const archonReject = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-206/archon-reject',
      payload: {
        reviewer_id: 'lizeyu',
        reason: 'reject this stage',
      },
    });
    const archonRejectStatus = await app.inject({
      method: 'GET',
      url: '/api/tasks/OC-206/status',
    });
    const unblock = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-207/unblock',
      payload: {
        reason: 'dependency resolved',
      },
    });

    expect(reject.statusCode).toBe(200);
    expect(reject.json()).toMatchObject({ id: 'OC-205', current_stage: 'write' });
    expect(archonReject.statusCode).toBe(200);
    expect(archonReject.json()).toMatchObject({ id: 'OC-206', current_stage: 'draft' });
    expect(archonRejectStatus.statusCode).toBe(200);
    expect(archonRejectStatus.json().flow_log.map((item: { event: string }) => item.event)).toEqual(
      expect.arrayContaining(['gate_failed', 'stage_rewound', 'archon_rejected']),
    );
    expect(unblock.statusCode).toBe(200);
    expect(unblock.json()).toMatchObject({ id: 'OC-207', state: 'active' });
  });

  it('supports unblock retry through the task route', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-208',
    });
    const subtasks = new SubtaskRepository(db);

    taskService.createTask({
      title: 'unblock retry route',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    subtasks.insertSubtask({
      id: 'retry-route',
      task_id: 'OC-208',
      stage_id: 'discuss',
      title: 'retry through route',
      assignee: 'codex',
      status: 'failed',
      output: 'timed out',
      craftsman_type: 'codex',
      craftsman_session: 'tmux:retry-route',
      dispatch_status: 'failed',
      dispatched_at: '2026-03-09T11:00:00.000Z',
      done_at: '2026-03-09T11:01:00.000Z',
    });
    taskService.updateTaskState('OC-208', 'blocked', { reason: 'timeout escalation' });

    const app = buildApp({ taskService });
    const unblock = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-208/unblock',
      payload: {
        reason: 'retry now',
        action: 'retry',
      },
    });
    const status = await app.inject({
      method: 'GET',
      url: '/api/tasks/OC-208/status',
    });

    expect(unblock.statusCode).toBe(200);
    expect(unblock.json()).toMatchObject({ id: 'OC-208', state: 'active' });
    expect(status.statusCode).toBe(200);
    expect(status.json().subtasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'retry-route',
          status: 'pending',
          output: null,
          craftsman_session: null,
          dispatch_status: null,
          dispatched_at: null,
          done_at: null,
        }),
      ]),
    );
  });

  it('supports unblock skip through the task route', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-209',
    });
    const subtasks = new SubtaskRepository(db);

    taskService.createTask({
      title: 'unblock skip route',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    subtasks.insertSubtask({
      id: 'skip-route',
      task_id: 'OC-209',
      stage_id: 'discuss',
      title: 'skip through route',
      assignee: 'codex',
      status: 'failed',
      output: 'timed out',
      craftsman_type: 'codex',
      craftsman_session: 'tmux:skip-route',
      dispatch_status: 'failed',
      dispatched_at: '2026-03-09T11:00:00.000Z',
    });
    taskService.updateTaskState('OC-209', 'blocked', { reason: 'human intervention' });

    const app = buildApp({ taskService });
    const unblock = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-209/unblock',
      payload: {
        reason: 'skip now',
        action: 'skip',
      },
    });
    const status = await app.inject({
      method: 'GET',
      url: '/api/tasks/OC-209/status',
    });

    expect(unblock.statusCode).toBe(200);
    expect(unblock.json()).toMatchObject({ id: 'OC-209', state: 'active' });
    expect(status.statusCode).toBe(200);
    expect(status.json().subtasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'skip-route',
          status: 'done',
          output: 'Skipped by archon: skip now',
          craftsman_session: null,
          dispatch_status: 'skipped',
        }),
      ]),
    );
  });

  it('supports unblock reassign through the task route', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-210',
    });
    const subtasks = new SubtaskRepository(db);

    taskService.createTask({
      title: 'unblock reassign route',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    subtasks.insertSubtask({
      id: 'reassign-route',
      task_id: 'OC-210',
      stage_id: 'discuss',
      title: 'reassign through route',
      assignee: 'codex',
      status: 'failed',
      output: 'timed out',
      craftsman_type: 'codex',
      craftsman_session: 'tmux:reassign-route',
      dispatch_status: 'failed',
      dispatched_at: '2026-03-09T11:00:00.000Z',
    });
    taskService.updateTaskState('OC-210', 'blocked', { reason: 'human intervention' });

    const app = buildApp({ taskService });
    const unblock = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-210/unblock',
      payload: {
        reason: 'reassign now',
        action: 'reassign',
        assignee: 'claude',
        craftsman_type: 'claude',
      },
    });
    const status = await app.inject({
      method: 'GET',
      url: '/api/tasks/OC-210/status',
    });

    expect(unblock.statusCode).toBe(200);
    expect(unblock.json()).toMatchObject({ id: 'OC-210', state: 'active' });
    expect(status.statusCode).toBe(200);
    expect(status.json().subtasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'reassign-route',
          status: 'pending',
          assignee: 'claude',
          craftsman_type: 'claude',
          output: null,
          craftsman_session: null,
          dispatch_status: null,
        }),
      ]),
    );
  });
});
