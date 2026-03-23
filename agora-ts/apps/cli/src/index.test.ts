import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArchiveJobRepository, createAgoraDatabase, runMigrations, SubtaskRepository, TaskRepository, type AgoraDatabase } from '@agora-ts/db';
import { CitizenService, CraftsmanDispatcher, DashboardQueryService, FilesystemProjectBrainQueryAdapter, FilesystemProjectKnowledgeAdapter, HumanAccountService, OpenClawCitizenProjectionAdapter, ProjectBrainAutomationService, ProjectBrainService, ProjectService, RolePackService, StubCraftsmanAdapter, StubIMProvisioningPort, TaskConversationService, TaskContextBindingService, TaskService, TemplateAuthoringService } from '@agora-ts/core';
import { createCliProgram, isCliEntrypoint } from './index.js';
import type { DashboardSessionClient } from './dashboard-session-client.js';

const tempPaths: string[] = [];
const templatesDir = resolve(process.cwd(), 'templates');
const rolePackDir = resolve(process.cwd(), 'role-packs', 'agora-default');

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-cli-'));
  tempPaths.push(dir);
  return join(dir, 'tasks.db');
}

function makeTempDir(prefix: string) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempPaths.push(dir);
  return dir;
}

function makeWorkflowFile(payload: Record<string, unknown>) {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-cli-workflow-'));
  tempPaths.push(dir);
  const path = join(dir, 'workflow.json');
  writeFileSync(path, JSON.stringify(payload, null, 2), 'utf8');
  return path;
}

function makeRawWorkflowFile(content: string) {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-cli-workflow-raw-'));
  tempPaths.push(dir);
  const path = join(dir, 'workflow.json');
  writeFileSync(path, content, 'utf8');
  return path;
}

beforeEach(() => {
  const agoraHomeDir = makeTempDir('agora-ts-cli-home-');
  const agentsSkillsDir = makeTempDir('agora-ts-cli-agents-skills-');
  const codexSkillsDir = makeTempDir('agora-ts-cli-codex-skills-');
  process.env.AGORA_HOME_DIR = agoraHomeDir;
  process.env.AGORA_SKILL_TARGET_DIRS = [agentsSkillsDir, codexSkillsDir].join(',');
});

afterEach(() => {
  delete process.env.AGORA_HOME_DIR;
  delete process.env.AGORA_SKILL_TARGET_DIRS;
  delete process.env.AGORA_DEV_REGRESSION_MODE;
  delete process.env.AGORA_DASHBOARD_LOGIN_USER;
  delete process.env.AGORA_DASHBOARD_LOGIN_PASSWORD;
  delete process.env.AGORA_DASHBOARD_USER;
  delete process.env.AGORA_DASHBOARD_PASSWORD;
  delete process.env.DASHBOARD_LOGIN_USER;
  delete process.env.DASHBOARD_LOGIN_PASSWORD;
  while (tempPaths.length > 0) {
    const dir = tempPaths.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

function createBuffer() {
  let value = '';
  return {
    write(chunk: string) {
      value += chunk;
    },
    get value() {
      return value;
    },
  };
}

function createDashboardSessionClientStub(): DashboardSessionClient {
  return {
    sessionFilePath: '/tmp/dashboard-session.json',
    login: async ({ username }) => ({
      ok: true,
      username,
      method: 'session',
    }),
    status: async () => ({
      authenticated: true,
      username: 'lizeyu',
      method: 'session',
    }),
    logout: async () => ({ ok: true }),
  };
}

function createTmuxRuntimeServiceStub() {
  return {
    up: () => { throw new Error('unused'); },
    status: () => { throw new Error('unused'); },
    send: () => { throw new Error('unused'); },
    sendText: () => { throw new Error('unused'); },
    sendKeys: () => { throw new Error('unused'); },
    submitChoice: () => { throw new Error('unused'); },
    start: () => { throw new Error('unused'); },
    resume: () => { throw new Error('unused'); },
    task: () => { throw new Error('unused'); },
    tail: () => { throw new Error('unused'); },
    doctor: () => { throw new Error('unused'); },
    down: () => { throw new Error('unused'); },
    recordIdentity: () => { throw new Error('unused'); },
  };
}

function createDashboardQueryServiceStub(): DashboardQueryService {
  return {
    listSkills: () => [],
    listArchiveJobs: () => [],
    getArchiveJob: () => { throw new Error('unused'); },
    approveArchiveJob: () => { throw new Error('unused'); },
    retryArchiveJob: () => { throw new Error('unused'); },
    notifyArchiveJob: () => { throw new Error('unused'); },
    updateArchiveJob: () => { throw new Error('unused'); },
    failStaleArchiveJobs: () => { throw new Error('unused'); },
    ingestArchiveJobReceipts: () => { throw new Error('unused'); },
  } as unknown as DashboardQueryService;
}

function createDashboardQueryServiceForDb(db: AgoraDatabase) {
  return new DashboardQueryService(db, { templatesDir });
}

describe('agora-ts cli', () => {
  it('renders root help without touching runtime composition', async () => {
    const stdout = createBuffer();
    const stderr = createBuffer();
    const program = createCliProgram({
      configPath: '/definitely/missing/agora.json',
      stdout,
      stderr,
    }).exitOverride();

    await expect(program.parseAsync(['--help'], { from: 'user' })).rejects.toMatchObject({
      code: 'commander.helpDisplayed',
    });

    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('Agora v2 TypeScript CLI');
    expect(stdout.value).toContain('create [options] <title>');
  });

  it('prints unified health snapshot through the cli', async () => {
    const stdout = createBuffer();
    const stderr = createBuffer();
    const program = createCliProgram({
      taskService: {
        getHealthSnapshot: () => ({
          generated_at: '2026-03-14T04:30:00.000Z',
          tasks: {
            status: 'healthy',
            total_tasks: 2,
            active_tasks: 1,
            paused_tasks: 0,
            blocked_tasks: 0,
            done_tasks: 1,
          },
          im: {
            status: 'healthy',
            active_bindings: 1,
            active_threads: 1,
            bindings_by_provider: [{ label: 'discord', count: 1 }],
          },
          runtime: {
            status: 'healthy',
            available: true,
            stale_after_ms: 1234,
            active_sessions: 1,
            idle_sessions: 0,
            closed_sessions: 0,
            agents: [],
          },
          craftsman: {
            status: 'degraded',
            active_executions: 1,
            queued_executions: 0,
            running_executions: 0,
            waiting_input_executions: 1,
            awaiting_choice_executions: 0,
            active_by_assignee: [{ label: 'opus', count: 1 }],
          },
          host: {
            status: 'healthy',
            snapshot: {
              observed_at: '2026-03-14T04:30:00.000Z',
              platform: 'darwin',
              cpu_count: 8,
              load_1m: 1,
              memory_total_bytes: 100,
              memory_used_bytes: 40,
              memory_utilization: 0.4,
              memory_pressure: 0.3,
              swap_total_bytes: 100,
              swap_used_bytes: 10,
              swap_utilization: 0.1,
            },
          },
          escalation: {
            status: 'degraded',
            policy: {
              controller_after_ms: 300000,
              roster_after_ms: 900000,
              inbox_after_ms: 1800000,
            },
            controller_pinged_tasks: 1,
            roster_pinged_tasks: 0,
            inbox_escalated_tasks: 0,
            unhealthy_runtime_agents: 0,
            runtime_unhealthy: false,
          },
        }),
      } as unknown as TaskService,
      stdout,
      stderr,
    }).exitOverride();

    await program.parseAsync(['health', 'snapshot'], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('generated_at: 2026-03-14T04:30:00.000Z');
    expect(stdout.value).toContain('tasks: total=2 active=1 blocked=0 paused=0 done=1 status=healthy');
    expect(stdout.value).toContain('runtime: available=true active=1 idle=0 closed=0 status=healthy');
    expect(stdout.value).toContain('craftsman: active=1 running=0 waiting_input=1 awaiting_choice=0 status=degraded');
    expect(stdout.value).toContain('escalation: controller=1 roster=0 inbox=0 runtime_unhealthy=false status=degraded');
  });

  it('lists locally resolved skills through the cli', async () => {
    const stdout = createBuffer();
    const stderr = createBuffer();
    const program = createCliProgram({
      dashboardQueryService: {
        ...createDashboardQueryServiceStub(),
        listSkills: () => [
          {
            skill_ref: 'planning-with-files',
            relative_path: 'planning-with-files',
            resolved_path: '/tmp/skills/planning-with-files/SKILL.md',
            source_root: '/tmp/skills',
            source_label: 'agora',
            precedence: 0,
            mtime: '2026-03-19T12:00:00.000Z',
            shadowed_paths: [],
          },
        ],
      } as unknown as DashboardQueryService,
      stdout,
      stderr,
    }).exitOverride();

    await program.parseAsync(['skills', 'list'], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('planning-with-files');
    expect(stdout.value).toContain('/tmp/skills/planning-with-files/SKILL.md');
  });

  it('renders subcommand help without touching runtime composition', async () => {
    const stdout = createBuffer();
    const stderr = createBuffer();
    const program = createCliProgram({
      configPath: '/definitely/missing/agora.json',
      stdout,
      stderr,
    }).exitOverride();

    try {
      await program.parseAsync(['subtasks', '--help'], { from: 'user' });
    } catch {
      // Commander may surface subcommand help as an exit(0) instead of helpDisplayed.
    }

    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('subtask execute-mode commands');
    expect(stdout.value).toContain('create [options] <taskId>');
  });

  it('renders redirect help for agora users --help', async () => {
    const stdout = createBuffer();
    const stderr = createBuffer();
    const program = createCliProgram({
      configPath: '/definitely/missing/agora.json',
      stdout,
      stderr,
    }).exitOverride();

    try {
      await program.parseAsync(['users', '--help'], { from: 'user' });
    } catch {
      // Commander may surface help as an exit signal.
    }

    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('Moved to: agora dashboard users');
    expect(stdout.value).toContain('agora dashboard users list');
  });

  it('creates and lists projects through the cli', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const stdout = createBuffer();
    const stderr = createBuffer();
    const brainPackRoot = makeTempDir('agora-ts-cli-project-brain-');
    const projectService = new ProjectService(db, {
      knowledgePort: new FilesystemProjectKnowledgeAdapter({ brainPackRoot }),
    });
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-PROJECT-INDEX-BOOTSTRAP',
      projectService,
    });
    const program = createCliProgram({
      projectService,
      taskService,
      stdout,
      stderr,
    }).exitOverride();

    await program.parseAsync(['projects', 'create', '--id', 'proj-alpha', '--name', 'Project Alpha', '--owner', 'archon'], { from: 'user' });
    await program.parseAsync(['projects', 'list'], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('Project 已创建: proj-alpha');
    expect(stdout.value).toContain('proj-alpha\tactive\tProject Alpha\tarchon');
    expect(readFileSync(join(brainPackRoot, 'projects', 'proj-alpha', 'index.md'), 'utf8')).toContain('# Project Alpha');
  });

  it('installs the built-in Nomos skeleton and repo shim through the cli project-create path', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const stdout = createBuffer();
    const stderr = createBuffer();
    const brainPackRoot = makeTempDir('agora-ts-cli-project-nomos-brain-');
    const repoParent = makeTempDir('agora-ts-cli-project-repo-parent-');
    const repoRoot = join(repoParent, 'repo-alpha');
    const installedTemplateRoot = join(process.env.AGORA_HOME_DIR!, 'skills', 'create-nomos', 'assets', 'pack-template');
    mkdirSync(join(installedTemplateRoot, 'docs', 'reference'), { recursive: true });
    mkdirSync(join(installedTemplateRoot, 'prompts', 'bootstrap'), { recursive: true });
    writeFileSync(join(installedTemplateRoot, 'README.md'), '# template\n', 'utf8');
    writeFileSync(join(installedTemplateRoot, 'docs', 'reference', 'methodologies.md'), 'template methods\n', 'utf8');
    writeFileSync(join(installedTemplateRoot, 'prompts', 'bootstrap', 'interview.md'), 'template interview\n', 'utf8');
    const projectService = new ProjectService(db, {
      knowledgePort: new FilesystemProjectKnowledgeAdapter({ brainPackRoot }),
    });
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-NOMOS-BOOTSTRAP',
      projectService,
    });
    const program = createCliProgram({
      projectService,
      taskService,
      stdout,
      stderr,
    }).exitOverride();

    await program.parseAsync([
      'projects',
      'create',
      '--id',
      'proj-nomos',
      '--name',
      'Project Nomos',
      '--repo-path',
      repoRoot,
      '--new-repo',
    ], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('Project 已创建: proj-nomos');
    expect(stdout.value).toContain('Nomos: agora/default@0.1.0');
    expect(stdout.value).toContain(`Repo Shim: ${join(repoRoot, 'AGENTS.md')}`);
    expect(stdout.value).toContain('Bootstrap Task: OC-NOMOS-BOOTSTRAP');
    expect(stdout.value).toContain(`Project Nomos Spec: ${join(process.env.AGORA_HOME_DIR!, 'projects', 'proj-nomos', 'docs', 'reference', 'project-nomos-authoring-spec.md')}`);
    expect(stdout.value).toContain(`Project Nomos Draft: ${join(process.env.AGORA_HOME_DIR!, 'projects', 'proj-nomos', 'nomos', 'project-nomos')}`);
    expect(readFileSync(join(repoRoot, 'AGENTS.md'), 'utf8')).toContain('## Bootstrap Method');
    expect(readFileSync(join(process.env.AGORA_HOME_DIR!, 'projects', 'proj-nomos', 'profile.toml'), 'utf8')).toContain(
      'id = "proj-nomos"',
    );
    expect(readFileSync(join(process.env.AGORA_HOME_DIR!, 'projects', 'proj-nomos', 'docs', 'reference', 'project-nomos-authoring-spec.md'), 'utf8')).toContain('Project Nomos Authoring Spec');
    expect(readFileSync(join(process.env.AGORA_HOME_DIR!, 'projects', 'proj-nomos', 'nomos', 'project-nomos', 'profile.toml'), 'utf8')).toContain('id = "project/proj-nomos"');
    expect(taskService.getTask('OC-NOMOS-BOOTSTRAP')?.title).toBe('Create Project Nomos: Project Nomos');
    expect(taskService.getTask('OC-NOMOS-BOOTSTRAP')?.description).toContain(
      join(process.env.AGORA_HOME_DIR!, 'projects', 'proj-nomos', 'prompts', 'bootstrap', 'interview.md'),
    );
    expect(taskService.getTask('OC-NOMOS-BOOTSTRAP')?.description).toContain(
      join(process.env.AGORA_HOME_DIR!, 'projects', 'proj-nomos', 'docs', 'reference', 'project-nomos-authoring-spec.md'),
    );
    expect(taskService.getTask('OC-NOMOS-BOOTSTRAP')?.description).toContain('Bootstrap mode: `new_repo`');
  });

  it('lists and shows the built-in Nomos pack through explicit cli commands', async () => {
    const stdout = createBuffer();
    const stderr = createBuffer();
    const program = createCliProgram({
      stdout,
      stderr,
    }).exitOverride();

    await program.parseAsync(['nomos', 'list'], { from: 'user' });
    await program.parseAsync(['nomos', 'show', 'agora/default'], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('agora/default\t0.1.0\tAgora Default Nomos');
    expect(stdout.value).toContain('agora/default — Agora Default Nomos');
    expect(stdout.value).toContain('lifecycle: project-bootstrap, task-context-delivery, task-closeout, project-archive, governance-doctor');
    expect(stdout.value).toContain('shim sections: general_constitution, pack_index, bootstrap_method, fill_policy');
    expect(stdout.value).toContain('seeded references: current-surface.md, methodologies.md, governance.md, lifecycle.md, bootstrap-fields.md');
    expect(stdout.value).toContain('seeded lifecycle docs: project-bootstrap.md, task-context-delivery.md, task-closeout.md, project-archive.md, governance-doctor.md');
    expect(stdout.value).toContain('seeded bootstrap prompts: interview.md, existing-project.md, new-project.md, no-repo.md');
  });

  it('installs Nomos for an existing project and exposes inspect-project output', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const stdout = createBuffer();
    const stderr = createBuffer();
    const brainPackRoot = makeTempDir('agora-ts-cli-project-nomos-install-');
    const repoParent = makeTempDir('agora-ts-cli-project-nomos-install-repo-');
    const repoRoot = join(repoParent, 'repo-beta');
    const projectService = new ProjectService(db, {
      knowledgePort: new FilesystemProjectKnowledgeAdapter({ brainPackRoot }),
    });
    projectService.createProject({
      id: 'proj-existing-nomos',
      name: 'Existing Nomos Project',
      owner: 'archon',
    });
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-NOMOS-INSTALL',
      projectService,
    });
    const program = createCliProgram({
      projectService,
      taskService,
      stdout,
      stderr,
    }).exitOverride();

    await program.parseAsync([
      'nomos',
      'install',
      '--project-id',
      'proj-existing-nomos',
      '--repo-path',
      repoRoot,
      '--initialize-repo',
    ], { from: 'user' });

    await program.parseAsync([
      'nomos',
      'inspect-project',
      'proj-existing-nomos',
    ], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('Nomos 已安装: agora/default@0.1.0');
    expect(stdout.value).toContain(`Repo Shim: ${join(repoRoot, 'AGENTS.md')}`);
    expect(stdout.value).toContain('Bootstrap Task: OC-NOMOS-INSTALL');
    expect(stdout.value).toContain('proj-existing-nomos — Existing Nomos Project');
    expect(stdout.value).toContain('nomos: agora/default');
    expect(stdout.value).toContain('activation_status: active_builtin');
    expect(stdout.value).toContain(`project_state_root: ${join(process.env.AGORA_HOME_DIR!, 'projects', 'proj-existing-nomos')}`);
    expect(stdout.value).toContain(`repo_path: ${repoRoot}`);
    expect(stdout.value).toContain('repo_shim_installed: true');
    expect(readFileSync(join(repoRoot, 'AGENTS.md'), 'utf8')).toContain('## Pack Index');
    expect(readFileSync(join(process.env.AGORA_HOME_DIR!, 'projects', 'proj-existing-nomos', 'profile.toml'), 'utf8')).toContain(
      'id = "proj-existing-nomos"',
    );
    expect(taskService.getTask('OC-NOMOS-INSTALL')?.title).toBe('Create Project Nomos: Existing Nomos Project');
  });

  it('reviews and activates a project-specific nomos draft through explicit cli commands', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const stdout = createBuffer();
    const stderr = createBuffer();
    const brainPackRoot = makeTempDir('agora-ts-cli-project-nomos-activate-');
    const repoParent = makeTempDir('agora-ts-cli-project-nomos-activate-repo-');
    const repoRoot = join(repoParent, 'repo-activate');
    const projectService = new ProjectService(db, {
      knowledgePort: new FilesystemProjectKnowledgeAdapter({ brainPackRoot }),
    });
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-NOMOS-ACTIVATE',
      projectService,
    });
    const program = createCliProgram({
      projectService,
      taskService,
      stdout,
      stderr,
    }).exitOverride();

    await program.parseAsync([
      'projects',
      'create',
      '--id',
      'proj-activate',
      '--name',
      'Activate Project',
      '--repo-path',
      repoRoot,
      '--new-repo',
    ], { from: 'user' });

    await program.parseAsync(['nomos', 'review-project', 'proj-activate'], { from: 'user' });
    await program.parseAsync(['nomos', 'activate-project', '--project-id', 'proj-activate', '--actor', 'archon'], { from: 'user' });
    await program.parseAsync(['nomos', 'inspect-project', 'proj-activate'], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('Project Nomos draft review: proj-activate');
    expect(stdout.value).toContain('can_activate: true');
    expect(stdout.value).toContain('Project Nomos 已激活: project/proj-activate');
    expect(stdout.value).toContain('nomos: project/proj-activate');
    expect(stdout.value).toContain('activation_status: active_project');
    expect(stdout.value).toContain(`active_root: ${join(process.env.AGORA_HOME_DIR!, 'projects', 'proj-activate', 'nomos', 'project-nomos')}`);
  });

  it('reruns bootstrap against the active project Nomos prompt after activation', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const stdout = createBuffer();
    const stderr = createBuffer();
    const brainPackRoot = makeTempDir('agora-ts-cli-project-nomos-rerun-');
    const repoParent = makeTempDir('agora-ts-cli-project-nomos-rerun-repo-');
    const repoRoot = join(repoParent, 'repo-rerun');
    const projectService = new ProjectService(db, {
      knowledgePort: new FilesystemProjectKnowledgeAdapter({ brainPackRoot }),
    });
    let taskCounter = 0;
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => `OC-NOMOS-RERUN-${++taskCounter}`,
      projectService,
    });
    const program = createCliProgram({
      projectService,
      taskService,
      stdout,
      stderr,
    }).exitOverride();

    await program.parseAsync([
      'projects',
      'create',
      '--id',
      'proj-rerun',
      '--name',
      'Rerun Project',
      '--repo-path',
      repoRoot,
      '--new-repo',
    ], { from: 'user' });

    await program.parseAsync(['nomos', 'activate-project', '--project-id', 'proj-rerun', '--actor', 'archon'], { from: 'user' });
    await program.parseAsync(['nomos', 'install', '--project-id', 'proj-rerun'], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(taskService.getTask('OC-NOMOS-RERUN-2')?.description).toContain(
      join(process.env.AGORA_HOME_DIR!, 'projects', 'proj-rerun', 'nomos', 'project-nomos', 'prompts', 'bootstrap', 'interview.md'),
    );
  });

  it('scaffolds a custom Nomos pack through the explicit cli surface', async () => {
    const stdout = createBuffer();
    const stderr = createBuffer();
    const outputRoot = makeTempDir('agora-ts-cli-nomos-pack-');
    const installedTemplateRoot = join(process.env.AGORA_HOME_DIR!, 'skills', 'create-nomos', 'assets', 'pack-template');
    mkdirSync(join(installedTemplateRoot, 'docs', 'reference'), { recursive: true });
    mkdirSync(join(installedTemplateRoot, 'prompts', 'bootstrap'), { recursive: true });
    writeFileSync(join(installedTemplateRoot, 'README.md'), '# template\n', 'utf8');
    writeFileSync(join(installedTemplateRoot, 'docs', 'reference', 'methodologies.md'), 'template methods\n', 'utf8');
    writeFileSync(join(installedTemplateRoot, 'prompts', 'bootstrap', 'interview.md'), 'template interview\n', 'utf8');

    const program = createCliProgram({
      stdout,
      stderr,
      dashboardSessionClient: createDashboardSessionClientStub(),
      dashboardQueryService: createDashboardQueryServiceStub(),
      taskService: { getHealthSnapshot: () => ({}) } as unknown as TaskService,
    }).exitOverride();

    await program.parseAsync([
      'nomos',
      'scaffold',
      '--id', 'acme/web',
      '--name', 'Acme Web Nomos',
      '--description', 'Custom Nomos for Acme web delivery.',
      '--output-dir', join(outputRoot, 'acme-web'),
    ], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('Nomos pack 已生成');
    expect(stdout.value).toContain('Pack: acme/web@0.1.0');
    expect(readFileSync(join(outputRoot, 'acme-web', 'profile.toml'), 'utf8')).toContain('id = "acme/web"');
    expect(readFileSync(join(outputRoot, 'acme-web', 'README.md'), 'utf8')).toContain('# Acme Web Nomos');
  });

  it('refines a seeded project Nomos draft from its structured authoring spec', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const stdout = createBuffer();
    const stderr = createBuffer();
    const brainPackRoot = makeTempDir('agora-ts-cli-project-nomos-refine-');
    const repoParent = makeTempDir('agora-ts-cli-project-nomos-refine-repo-');
    const repoRoot = join(repoParent, 'repo-refine');
    const installedTemplateRoot = join(process.env.AGORA_HOME_DIR!, 'skills', 'create-nomos', 'assets', 'pack-template');
    mkdirSync(join(installedTemplateRoot, 'docs', 'reference'), { recursive: true });
    mkdirSync(join(installedTemplateRoot, 'prompts', 'bootstrap'), { recursive: true });
    writeFileSync(join(installedTemplateRoot, 'README.md'), '# template\n', 'utf8');
    writeFileSync(join(installedTemplateRoot, 'docs', 'reference', 'methodologies.md'), 'template methods\n', 'utf8');
    writeFileSync(join(installedTemplateRoot, 'prompts', 'bootstrap', 'interview.md'), 'template interview\n', 'utf8');
    const projectService = new ProjectService(db, {
      knowledgePort: new FilesystemProjectKnowledgeAdapter({ brainPackRoot }),
    });
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-NOMOS-REFINE',
      projectService,
    });
    const program = createCliProgram({
      projectService,
      taskService,
      stdout,
      stderr,
    }).exitOverride();

    await program.parseAsync([
      'projects',
      'create',
      '--id',
      'proj-refine',
      '--name',
      'Refine Project',
      '--repo-path',
      repoRoot,
      '--new-repo',
    ], { from: 'user' });

    const specPath = join(process.env.AGORA_HOME_DIR!, 'projects', 'proj-refine', 'docs', 'reference', 'project-nomos-authoring-spec.md');
    writeFileSync(specPath, [
      '---',
      'project_id: "proj-refine"',
      'project_name: "Refine Project"',
      'base_nomos_id: "agora/default"',
      'project_shape: "existing_repo"',
      `repo_path: ${JSON.stringify(repoRoot)}`,
      'purpose: "CLI refined Nomos description."',
      `lifecycle_modules: ${JSON.stringify(['project-bootstrap', 'task-closeout'])}`,
      `doctor_checks: ${JSON.stringify(['constitution-present'])}`,
      `methodology_keep: ${JSON.stringify(['planning trio'])}`,
      `methodology_change: ${JSON.stringify(['use lighter governance'])}`,
      `open_questions: ${JSON.stringify(['How strict should archive approval be?'])}`,
      '---',
      '',
      '# Project Nomos Authoring Spec',
    ].join('\n'), 'utf8');

    await program.parseAsync(['nomos', 'refine-project', '--project-id', 'proj-refine'], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('Project Nomos draft 已更新: proj-refine');
    const draftProfile = readFileSync(join(process.env.AGORA_HOME_DIR!, 'projects', 'proj-refine', 'nomos', 'project-nomos', 'profile.toml'), 'utf8');
    expect(draftProfile).toContain('description = "CLI refined Nomos description."');
    expect(draftProfile).toContain('modules = ["project-bootstrap", "task-closeout"]');
  });

  it('creates a project-bound task through the cli', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackRoot = makeTempDir('agora-ts-cli-project-task-');
    const projectService = new ProjectService(db, {
      knowledgePort: new FilesystemProjectKnowledgeAdapter({ brainPackRoot }),
    });
    projectService.createProject({
      id: 'proj-cli',
      name: 'CLI Project',
      owner: 'archon',
    });
    const stdout = createBuffer();
    const stderr = createBuffer();
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-PROJECT-CLI',
      projectService,
    });
    const program = createCliProgram({
      taskService,
      projectService,
      templateAuthoringService: new TemplateAuthoringService({ db, templatesDir }),
      rolePackService: new RolePackService({ db, rolePacksDir: rolePackDir }),
      stdout,
      stderr,
    }).exitOverride();

    await program.parseAsync(['create', 'project task', '--type', 'coding', '--project-id', 'proj-cli'], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('Project: proj-cli');
    expect(taskService.getTask('OC-PROJECT-CLI')?.project_id).toBe('proj-cli');
  });

  it('shows project knowledge through the cli', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackRoot = makeTempDir('agora-ts-cli-project-show-');
    const projectService = new ProjectService(db, {
      knowledgePort: new FilesystemProjectKnowledgeAdapter({ brainPackRoot }),
    });
    projectService.createProject({
      id: 'proj-show',
      name: 'Project Show',
      owner: 'archon',
    });
    const stdout = createBuffer();
    const stderr = createBuffer();
    const program = createCliProgram({
      projectService,
      stdout,
      stderr,
    }).exitOverride();

    await program.parseAsync(['projects', 'show', 'proj-show'], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('proj-show — Project Show');
    expect(stdout.value).toContain('index:');
    expect(stdout.value).toContain('# Project Show');
  });

  it('supports project knowledge CRUD and search through the cli', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackRoot = makeTempDir('agora-ts-cli-project-knowledge-');
    const projectService = new ProjectService(db, {
      knowledgePort: new FilesystemProjectKnowledgeAdapter({ brainPackRoot }),
    });
    projectService.createProject({
      id: 'proj-knowledge',
      name: 'Project Knowledge',
      owner: 'archon',
    });
    const stdout = createBuffer();
    const stderr = createBuffer();
    const program = createCliProgram({
      projectService,
      stdout,
      stderr,
    }).exitOverride();

    await program.parseAsync([
      'projects', 'knowledge', 'add',
      '--project', 'proj-knowledge',
      '--kind', 'decision',
      '--slug', 'runtime-boundary',
      '--title', 'Runtime Boundary',
      '--summary', 'Keep runtime-specific logic out of core.',
      '--body', 'Core keeps orchestration semantics. Runtime adapters stay outside core.',
      '--source-task', 'OC-100',
    ], { from: 'user' });
    await program.parseAsync([
      'projects', 'knowledge', 'list',
      '--project', 'proj-knowledge',
      '--kind', 'decision',
    ], { from: 'user' });
    await program.parseAsync([
      'projects', 'knowledge', 'show',
      '--project', 'proj-knowledge',
      '--kind', 'decision',
      '--slug', 'runtime-boundary',
    ], { from: 'user' });
    await program.parseAsync([
      'projects', 'search',
      '--project', 'proj-knowledge',
      '--query', 'orchestration semantics',
    ], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('Knowledge 已写入:');
    expect(stdout.value).toContain('decision\truntime-boundary\tRuntime Boundary');
    expect(stdout.value).toContain('decision/runtime-boundary');
    expect(stdout.value).toContain('Core keeps orchestration semantics.');
    expect(stdout.value).toContain('orchestration semantics');
  });

  it('supports citizen creation, listing, show, and preview through the cli', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackRoot = makeTempDir('agora-ts-cli-citizen-brain-');
    const projectService = new ProjectService(db);
    projectService.createProject({
      id: 'proj-citizen',
      name: 'Citizen Project',
      owner: 'archon',
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
    const projectBrainService = new ProjectBrainService({
      projectService,
      citizenService,
      projectBrainQueryPort: new FilesystemProjectBrainQueryAdapter({ brainPackRoot }),
    });
    const stdout = createBuffer();
    const stderr = createBuffer();
    const program = createCliProgram({
      projectService,
      projectBrainService,
      citizenService,
      rolePackService,
      stdout,
      stderr,
    }).exitOverride();

    await program.parseAsync([
      'citizens', 'create',
      '--id', 'citizen-alpha',
      '--project', 'proj-citizen',
      '--role', 'architect',
      '--name', 'Alpha Architect',
      '--persona', 'Systems thinker',
      '--boundary', 'Keep runtime adapters outside core.',
      '--skill', 'system-design',
    ], { from: 'user' });
    await program.parseAsync(['citizens', 'list', '--project', 'proj-citizen'], { from: 'user' });
    await program.parseAsync(['citizens', 'show', 'citizen-alpha'], { from: 'user' });
    await program.parseAsync(['citizens', 'preview', 'citizen-alpha'], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('Citizen 已创建: citizen-alpha');
    expect(stdout.value).toContain('citizen-alpha\tproj-citizen\tarchitect\tactive\tAlpha Architect');
    expect(stdout.value).toContain('citizen-alpha — Alpha Architect');
    expect(stdout.value).toContain('.openclaw/citizens/citizen-alpha/profile.json');
    expect(stdout.value).toContain('.openclaw/citizens/citizen-alpha/brain/03-citizen-scaffold.md');
  });

  it('supports project brain query and append through the cli', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackRoot = makeTempDir('agora-ts-cli-project-brain-');
    const projectService = new ProjectService(db, {
      knowledgePort: new FilesystemProjectKnowledgeAdapter({ brainPackRoot }),
    });
    projectService.createProject({
      id: 'proj-brain',
      name: 'Brain Project',
      owner: 'archon',
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
    const projectBrainService = new ProjectBrainService({
      projectService,
      citizenService,
      projectBrainQueryPort: new FilesystemProjectBrainQueryAdapter({ brainPackRoot }),
    });
    citizenService.createCitizen({
      citizen_id: 'citizen-alpha',
      project_id: 'proj-brain',
      role_id: 'architect',
      display_name: 'Alpha Architect',
      persona: null,
      boundaries: ['Keep runtime adapters outside core.'],
      skills_ref: [],
      channel_policies: {},
      brain_scaffold_mode: 'role_default',
      runtime_projection: {
        adapter: 'openclaw',
        auto_provision: false,
        metadata: {},
      },
    });
    const stdout = createBuffer();
    const stderr = createBuffer();
    const program = createCliProgram({
      projectService,
      projectBrainService,
      citizenService,
      rolePackService,
      stdout,
      stderr,
    }).exitOverride();

    await program.parseAsync([
      'projects', 'brain', 'query',
      '--project', 'proj-brain',
      '--query', 'runtime',
    ], { from: 'user' });
    await program.parseAsync([
      'projects', 'brain', 'append',
      '--project', 'proj-brain',
      '--kind', 'reference',
      '--slug', 'obsidian-notes',
      '--title', 'Obsidian Notes',
      '--body', 'Append this note into the project brain.',
    ], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('citizen_scaffold');
    expect(stdout.value).toContain('runtime-boundary');
    expect(stdout.value).toContain('Brain 已追加');
  });

  it('supports project brain bootstrap-context and promote through the cli', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackRoot = makeTempDir('agora-ts-cli-project-brain-bootstrap-');
    const projectService = new ProjectService(db, {
      knowledgePort: new FilesystemProjectKnowledgeAdapter({ brainPackRoot }),
    });
    projectService.createProject({
      id: 'proj-bootstrap',
      name: 'Bootstrap Project',
      owner: 'archon',
      summary: 'Project bootstrap summary',
    });
    projectService.upsertKnowledgeEntry({
      project_id: 'proj-bootstrap',
      kind: 'fact',
      slug: 'core-first',
      title: 'Core First',
      summary: 'Keep orchestration inside core.',
      body: 'Core keeps orchestration semantics.',
      source_task_ids: ['OC-BOOT-1'],
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
        heartbeat: ['Restate objective.'],
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
      project_id: 'proj-bootstrap',
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
    const projectBrainAutomationService = new ProjectBrainAutomationService({
      projectBrainService,
    });
    const stdout = createBuffer();
    const stderr = createBuffer();
    const program = createCliProgram({
      projectService,
      projectBrainService,
      projectBrainAutomationService,
      citizenService,
      rolePackService,
      stdout,
      stderr,
    }).exitOverride();

    await program.parseAsync([
      'projects', 'brain', 'bootstrap-context',
      '--project', 'proj-bootstrap',
      '--audience', 'controller',
    ], { from: 'user' });
    await program.parseAsync([
      'projects', 'brain', 'promote',
      '--project', 'proj-bootstrap',
      '--kind', 'decision',
      '--slug', 'obsidian-adapter',
      '--title', 'Obsidian Adapter',
      '--body', 'Obsidian stays optional.',
      '--source-task', 'OC-BOOT-1',
    ], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('project_brain_bootstrap_context');
    expect(stdout.value).toContain('Alpha Architect');
    expect(stdout.value).toContain('Brain 已提升');
  });

  it('exposes project brain hybrid query and index commands through the cli', async () => {
    const stdout = createBuffer();
    const stderr = createBuffer();
    const projectBrainRetrievalService = {
      searchTaskContext: vi.fn().mockResolvedValue([]),
    };
    const projectBrainIndexService = {
      rebuildProjectIndex: vi.fn().mockResolvedValue({
        project_id: 'proj-brain',
        indexed_documents: 2,
        indexed_chunks: 5,
      }),
      syncProjectIndex: vi.fn().mockResolvedValue({
        project_id: 'proj-brain',
        kind: 'decision',
        slug: 'runtime-boundary',
        indexed_documents: 1,
        indexed_chunks: 3,
      }),
      getProjectIndexStatus: vi.fn().mockResolvedValue({
        project_id: 'proj-brain',
        provider: 'qdrant',
        healthy: true,
        chunk_count: 5,
      }),
      inspectDocumentChunks: vi.fn().mockReturnValue({
        document: {
          project_id: 'proj-brain',
          kind: 'decision',
          slug: 'runtime-boundary',
          title: 'Runtime Boundary',
          path: '/brain/decision/runtime-boundary.md',
          content: 'Keep runtime-specific logic out of core.',
        },
        chunks: [
          {
            chunk_id: 'proj-brain:decision:runtime-boundary:0',
            project_id: 'proj-brain',
            kind: 'decision',
            slug: 'runtime-boundary',
            ordinal: 0,
            title: 'Runtime Boundary',
            content: 'Keep runtime-specific logic out of core.',
            search_text: 'Runtime Boundary Keep runtime-specific logic out of core.',
            path: '/brain/decision/runtime-boundary.md',
          },
        ],
      }),
    };
    const program = createCliProgram({
      taskService: {
        getTask: vi.fn().mockReturnValue({
          id: 'OC-HYBRID-1',
          project_id: 'proj-brain',
        }),
      } as never,
      projectBrainService: {
        queryDocuments: vi.fn().mockReturnValue([]),
      } as never,
      projectBrainRetrievalService: projectBrainRetrievalService as never,
      projectBrainIndexService: projectBrainIndexService as never,
      stdout,
      stderr,
    }).exitOverride();

    await program.parseAsync([
      'projects', 'brain', 'query',
      '--task', 'OC-HYBRID-1',
      '--audience', 'craftsman',
      '--query', 'vector recall',
      '--mode', 'auto',
    ], { from: 'user' });
    await program.parseAsync([
      'projects', 'brain', 'index', 'rebuild',
      '--project', 'proj-brain',
    ], { from: 'user' });
    await program.parseAsync([
      'projects', 'brain', 'index', 'sync',
      '--project', 'proj-brain',
      '--kind', 'decision',
      '--slug', 'runtime-boundary',
    ], { from: 'user' });
    await program.parseAsync([
      'projects', 'brain', 'index', 'status',
      '--project', 'proj-brain',
    ], { from: 'user' });
    await program.parseAsync([
      'projects', 'brain', 'chunk', 'inspect',
      '--project', 'proj-brain',
      '--kind', 'decision',
      '--slug', 'runtime-boundary',
    ], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(projectBrainRetrievalService.searchTaskContext).toHaveBeenCalledWith({
      task_id: 'OC-HYBRID-1',
      audience: 'craftsman',
      query: 'vector recall',
      max_results: 5,
    });
    expect(projectBrainIndexService.rebuildProjectIndex).toHaveBeenCalledWith('proj-brain');
    expect(projectBrainIndexService.syncProjectIndex).toHaveBeenCalledWith({
      project_id: 'proj-brain',
      kind: 'decision',
      slug: 'runtime-boundary',
    });
    expect(projectBrainIndexService.getProjectIndexStatus).toHaveBeenCalledWith('proj-brain');
    expect(projectBrainIndexService.inspectDocumentChunks).toHaveBeenCalledWith({
      project_id: 'proj-brain',
      kind: 'decision',
      slug: 'runtime-boundary',
    });
    expect(stdout.value).toContain('没有匹配结果');
    expect(stdout.value).toContain('project proj-brain rebuilt: 2 docs / 5 chunks');
    expect(stdout.value).toContain('project proj-brain synced: 1 docs / 3 chunks');
    expect(stdout.value).toContain('provider=qdrant healthy=true chunks=5');
    expect(stdout.value).toContain('chunks: 1');
  });

  it('routes project brain index commands through an injected index service', async () => {
    const stdout = createBuffer();
    const stderr = createBuffer();
    const projectBrainIndexService = {
      rebuildProjectIndex: vi.fn().mockResolvedValue({
        project_id: 'proj-brain',
        indexed_documents: 2,
        indexed_chunks: 3,
      }),
      syncProjectIndex: vi.fn().mockResolvedValue({
        project_id: 'proj-brain',
        kind: 'decision',
        slug: 'runtime-boundary',
        indexed_documents: 1,
        indexed_chunks: 1,
      }),
      getProjectIndexStatus: vi.fn().mockResolvedValue({
        healthy: true,
        provider: 'qdrant',
        chunk_count: 3,
      }),
      inspectDocumentChunks: vi.fn().mockResolvedValue({
        document: {
          project_id: 'proj-brain',
          kind: 'decision',
          slug: 'runtime-boundary',
        },
        chunks: [
          { chunk_id: 'proj-brain:decision:runtime-boundary:0' },
        ],
      }),
    };
    const program = createCliProgram({
      projectBrainIndexService: projectBrainIndexService as never,
      stdout,
      stderr,
    }).exitOverride();

    await program.parseAsync([
      'projects', 'brain', 'index', 'rebuild',
      '--project', 'proj-brain',
      '--json',
    ], { from: 'user' });
    await program.parseAsync([
      'projects', 'brain', 'index', 'sync',
      '--project', 'proj-brain',
      '--kind', 'decision',
      '--slug', 'runtime-boundary',
      '--json',
    ], { from: 'user' });
    await program.parseAsync([
      'projects', 'brain', 'index', 'status',
      '--project', 'proj-brain',
      '--json',
    ], { from: 'user' });
    await program.parseAsync([
      'projects', 'brain', 'chunk', 'inspect',
      '--project', 'proj-brain',
      '--kind', 'decision',
      '--slug', 'runtime-boundary',
      '--json',
    ], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(projectBrainIndexService.rebuildProjectIndex).toHaveBeenCalledWith('proj-brain');
    expect(projectBrainIndexService.syncProjectIndex).toHaveBeenCalledWith({
      project_id: 'proj-brain',
      kind: 'decision',
      slug: 'runtime-boundary',
    });
    expect(projectBrainIndexService.getProjectIndexStatus).toHaveBeenCalledWith('proj-brain');
    expect(projectBrainIndexService.inspectDocumentChunks).toHaveBeenCalledWith({
      project_id: 'proj-brain',
      kind: 'decision',
      slug: 'runtime-boundary',
    });
    expect(stdout.value).toContain('"indexed_chunks": 3');
    expect(stdout.value).toContain('"provider": "qdrant"');
    expect(stdout.value).toContain('"chunk_id": "proj-brain:decision:runtime-boundary:0"');
  });

  it('best-effort drains queued index jobs after knowledge writes', async () => {
    const stdout = createBuffer();
    const stderr = createBuffer();
    const projectService = {
      upsertKnowledgeEntry: vi.fn().mockReturnValue({
        path: '/brain/facts/runtime-boundary.md',
        kind: 'fact',
        slug: 'runtime-boundary',
      }),
    };
    const projectBrainIndexWorkerService = {
      drainPendingJobs: vi.fn().mockResolvedValue({
        processed: 1,
        succeeded: 1,
        failed: 0,
        pending: 0,
      }),
    };
    const program = createCliProgram({
      projectService: projectService as never,
      projectBrainIndexWorkerService: projectBrainIndexWorkerService as never,
      stdout,
      stderr,
    }).exitOverride();

    await program.parseAsync([
      'projects', 'knowledge', 'add',
      '--project', 'proj-brain',
      '--kind', 'fact',
      '--slug', 'runtime-boundary',
      '--title', 'Runtime Boundary',
      '--body', 'Keep runtime-specific logic out of core.',
    ], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(projectService.upsertKnowledgeEntry).toHaveBeenCalledWith({
      project_id: 'proj-brain',
      kind: 'fact',
      slug: 'runtime-boundary',
      title: 'Runtime Boundary',
      body: 'Keep runtime-specific logic out of core.',
    });
    expect(projectBrainIndexWorkerService.drainPendingJobs).toHaveBeenCalledWith({ limit: 5 });
  });

  it('prints project brain doctor output through an injected doctor service', async () => {
    const stdout = createBuffer();
    const stderr = createBuffer();
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const projectService = new ProjectService(db);
    projectService.createProject({
      id: 'proj-brain',
      name: 'Brain Project',
      metadata: {
        repo_path: '/tmp/repo',
        agora: {
          nomos: {
            id: 'project/proj-brain',
            activation_status: 'active_project',
            active_root: '/tmp/project-nomos',
            active_profile_path: '/tmp/project-nomos/profile.toml',
          },
        },
      },
    });
    const projectBrainDoctorService = {
      diagnoseProject: vi.fn().mockResolvedValue({
        project_id: 'proj-brain',
        db_path: '/Users/lizeyu/.agora/agora.db',
        embedding: {
          configured: true,
          healthy: true,
          provider: 'openai-compatible',
          model: 'embedding-3',
        },
        vector_index: {
          provider: 'qdrant',
          healthy: true,
          chunk_count: 5,
        },
        jobs: {
          pending: 2,
          running: 1,
          failed: 0,
          succeeded: 7,
        },
        drift: {
          detected: false,
          documents_without_jobs: 0,
        },
      }),
    };
    const program = createCliProgram({
      projectService,
      projectBrainDoctorService: projectBrainDoctorService as never,
      stdout,
      stderr,
    }).exitOverride();

    await program.parseAsync([
      'projects', 'brain', 'doctor',
      '--project', 'proj-brain',
      '--json',
    ], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(projectBrainDoctorService.diagnoseProject).toHaveBeenCalledWith('proj-brain');
    expect(stdout.value).toContain('"project_id": "proj-brain"');
    expect(stdout.value).toContain('"pending": 2');
    expect(stdout.value).toContain('"provider": "qdrant"');
    expect(stdout.value).toContain('"nomos_runtime"');
    expect(stdout.value).toContain('"nomos_id": "project/proj-brain"');
  });

  it('routes project brain task query through an injected retrieval service', async () => {
    const stdout = createBuffer();
    const stderr = createBuffer();
    const projectBrainRetrievalService = {
      searchTaskContext: vi.fn().mockResolvedValue([
        {
          project_id: 'proj-brain',
          kind: 'decision',
          slug: 'runtime-boundary',
          title: 'Runtime Boundary',
          path: '/brain/decision/runtime-boundary.md',
          snippet: 'Keep runtime-specific logic out of core.',
          retrieval_mode: 'hybrid',
          chunk_id: 'proj-brain:decision:runtime-boundary:0',
        },
      ]),
    };
    const program = createCliProgram({
      projectBrainRetrievalService: projectBrainRetrievalService as never,
      stdout,
      stderr,
    }).exitOverride();

    await program.parseAsync([
      'projects', 'brain', 'query',
      '--task', 'OC-HYBRID-1',
      '--audience', 'craftsman',
      '--query', 'runtime boundary',
      '--mode', 'auto',
      '--json',
    ], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(projectBrainRetrievalService.searchTaskContext).toHaveBeenCalledWith({
      task_id: 'OC-HYBRID-1',
      audience: 'craftsman',
      query: 'runtime boundary',
      max_results: 5,
    });
    expect(stdout.value).toContain('"retrieval_mode": "hybrid"');
    expect(stdout.value).toContain('"chunk_id": "proj-brain:decision:runtime-boundary:0"');
  });

  it('keeps task query on the raw path when mode=raw', async () => {
    const stdout = createBuffer();
    const stderr = createBuffer();
    const taskService = {
      getTask: vi.fn().mockReturnValue({
        id: 'OC-HYBRID-1',
        project_id: 'proj-brain',
      }),
    };
    const projectBrainService = {
      queryDocuments: vi.fn().mockReturnValue([
        {
          project_id: 'proj-brain',
          kind: 'decision',
          slug: 'runtime-boundary',
          title: 'Runtime Boundary',
          path: '/brain/decision/runtime-boundary.md',
          snippet: 'Keep runtime-specific logic out of core.',
        },
      ]),
    };
    const projectBrainRetrievalService = {
      searchTaskContext: vi.fn(),
    };
    const program = createCliProgram({
      taskService: taskService as never,
      projectBrainService: projectBrainService as never,
      projectBrainRetrievalService: projectBrainRetrievalService as never,
      stdout,
      stderr,
    }).exitOverride();

    await program.parseAsync([
      'projects', 'brain', 'query',
      '--task', 'OC-HYBRID-1',
      '--query', 'runtime boundary',
      '--mode', 'raw',
      '--json',
    ], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(taskService.getTask).toHaveBeenCalledWith('OC-HYBRID-1');
    expect(projectBrainRetrievalService.searchTaskContext).not.toHaveBeenCalled();
    expect(projectBrainService.queryDocuments).toHaveBeenCalledWith('proj-brain', 'runtime boundary', undefined);
    expect(stdout.value).toContain('"retrieval_mode": "raw"');
  });

  it('keeps project query on the existing raw path even when hybrid services are present', async () => {
    const stdout = createBuffer();
    const stderr = createBuffer();
    const projectBrainService = {
      queryDocuments: vi.fn().mockReturnValue([
        {
          project_id: 'proj-brain',
          kind: 'fact',
          slug: 'core-first',
          title: 'Core First',
          path: '/brain/fact/core-first.md',
          snippet: 'Keep orchestration inside core.',
        },
      ]),
    };
    const projectBrainRetrievalService = {
      searchTaskContext: vi.fn(),
    };
    const program = createCliProgram({
      projectBrainService: projectBrainService as never,
      projectBrainRetrievalService: projectBrainRetrievalService as never,
      stdout,
      stderr,
    }).exitOverride();

    await program.parseAsync([
      'projects', 'brain', 'query',
      '--project', 'proj-brain',
      '--query', 'core first',
      '--mode', 'auto',
      '--json',
    ], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(projectBrainRetrievalService.searchTaskContext).not.toHaveBeenCalled();
    expect(projectBrainService.queryDocuments).toHaveBeenCalledWith('proj-brain', 'core first', undefined);
    expect(stdout.value).toContain('"retrieval_mode": "raw"');
  });

  it('routes task-aware bootstrap-context through task metadata when task is provided', async () => {
    const stdout = createBuffer();
    const stderr = createBuffer();
    const taskService = {
      getTask: vi.fn().mockReturnValue({
        id: 'OC-HYBRID-1',
        title: 'Implement hybrid retrieval',
        description: 'Need vector recall and lexical rerank.',
        project_id: 'proj-brain',
        team: {
          members: [
            { role: 'architect', agentId: 'opus', member_kind: 'controller' },
            { role: 'citizen', agentId: 'citizen-alpha', member_kind: 'citizen' },
          ],
        },
      }),
    };
    const projectBrainAutomationService = {
      buildBootstrapContextAsync: vi.fn().mockResolvedValue({
        project_id: 'proj-brain',
        audience: 'controller',
        markdown: '# Project Brain Bootstrap Context',
        source_documents: [],
      }),
      buildBootstrapContext: vi.fn().mockReturnValue({
        project_id: 'proj-brain',
        audience: 'controller',
        markdown: '# Project Brain Bootstrap Context',
        source_documents: [],
      }),
    };
    const program = createCliProgram({
      taskService: taskService as never,
      projectBrainAutomationService: projectBrainAutomationService as never,
      stdout,
      stderr,
    }).exitOverride();

    await program.parseAsync([
      'projects', 'brain', 'bootstrap-context',
      '--task', 'OC-HYBRID-1',
      '--audience', 'controller',
    ], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(projectBrainAutomationService.buildBootstrapContextAsync).toHaveBeenCalledWith({
      project_id: 'proj-brain',
      task_id: 'OC-HYBRID-1',
      task_title: 'Implement hybrid retrieval',
      task_description: 'Need vector recall and lexical rerank.',
      allowed_citizen_ids: ['citizen-alpha'],
      audience: 'controller',
    });
  });

  it('prints runtime diagnosis results through the cli', async () => {
    const stdout = createBuffer();
    const stderr = createBuffer();
    const program = createCliProgram({
      taskService: {
        requestRuntimeDiagnosis: () => ({
          operation: 'request_runtime_diagnosis',
          task_id: 'OC-RUNTIME',
          agent_ref: 'opus',
          status: 'accepted',
          health: 'healthy',
          runtime_provider: 'openclaw',
          runtime_actor_ref: 'runtime-opus',
          summary: 'runtime healthy',
          detail: null,
        }),
      } as unknown as TaskService,
      stdout,
      stderr,
    }).exitOverride();

    await program.parseAsync(['runtime', 'diagnose', 'OC-RUNTIME', 'opus', '--caller-id', 'opus'], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('"operation": "request_runtime_diagnosis"');
    expect(stdout.value).toContain('"status": "accepted"');
  });

  it('prints craftsman stop results through the cli', async () => {
    const stdout = createBuffer();
    const stderr = createBuffer();
    const program = createCliProgram({
      taskService: {
        stopCraftsmanExecution: () => ({
          operation: 'stop_execution',
          status: 'accepted',
          task_id: 'OC-STOP',
          agent_ref: 'claude',
          execution_id: 'exec-stop',
          summary: 'stop signal sent',
          detail: null,
        }),
      } as unknown as TaskService,
      stdout,
      stderr,
    }).exitOverride();

    await program.parseAsync(['craftsman', 'stop', 'exec-stop', '--caller-id', 'opus'], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('"operation": "stop_execution"');
    expect(stdout.value).toContain('"execution_id": "exec-stop"');
  });

  it('treats a symlinked executable path as the cli entrypoint', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agora-ts-cli-entrypoint-'));
    tempPaths.push(dir);

    const target = join(dir, 'index.js');
    const link = join(dir, 'agora');
    writeFileSync(target, '// test entrypoint\n');
    symlinkSync(target, link);

    expect(isCliEntrypoint(pathToFileURL(target).href, link)).toBe(true);
  });

  it('creates tasks and shows them in status/list commands', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-300',
    });
    const stdout = createBuffer();
    const stderr = createBuffer();
    const program = createCliProgram({ taskService, stdout, stderr }).exitOverride();

    await program.parseAsync(['create', '实现 CLI parity', '--type', 'coding', '--priority', 'high'], {
      from: 'user',
    });
    await program.parseAsync(['status', 'OC-300'], { from: 'user' });
    await program.parseAsync(['list'], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('任务已创建: OC-300');
    expect(stdout.value).toContain('OC-300');
    expect(stdout.value).toContain('实现 CLI parity');
    expect(stdout.value).toContain('active');
  });

  it('creates tasks with team/workflow/im-target overrides through the cli', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-300B',
    });
    const stdout = createBuffer();
    const stderr = createBuffer();
    const program = createCliProgram({ taskService, stdout, stderr }).exitOverride();

    await program.parseAsync([
      'create',
      '实现 CLI override create',
      '--type', 'coding',
      '--team-json', '{"members":[{"role":"architect","agentId":"opus","model_preference":"strong_reasoning"},{"role":"developer","agentId":"codex","model_preference":"fast_coding"}]}',
      '--workflow-json', '{"type":"custom","stages":[{"id":"kickoff","mode":"discuss","gate":{"type":"command"}},{"id":"build","mode":"execute","gate":{"type":"all_subtasks_done"}}]}',
      '--im-target-json', '{"provider":"discord","conversation_ref":"channel-1","visibility":"private","participant_refs":["opus","codex"]}',
    ], {
      from: 'user',
    });

    const created = taskService.getTask('OC-300B');
    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('任务已创建: OC-300B');
    expect(created?.current_stage).toBe('kickoff');
    expect(created?.team).toEqual({
      members: [
        {
          role: 'architect',
          agentId: 'opus',
          model_preference: 'strong_reasoning',
          agent_origin: 'user_managed',
          briefing_mode: 'overlay_full',
        },
        {
          role: 'developer',
          agentId: 'codex',
          model_preference: 'fast_coding',
          agent_origin: 'user_managed',
          briefing_mode: 'overlay_full',
        },
      ],
    });
  });

  it('surfaces invalid json option errors with the flag name', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-300B-ERR',
    });
    const stdout = createBuffer();
    const stderr = createBuffer();
    const program = createCliProgram({ taskService, stdout, stderr }).exitOverride();

    await expect(program.parseAsync([
      'create',
      'broken json create',
      '--type', 'coding',
      '--team-json', '{broken-json',
    ], {
      from: 'user',
    })).rejects.toThrow(/invalid json for --team-json/i);
  });

  it('creates tasks with controller and role binding convenience options', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-300C',
    });
    const templateAuthoringService = new TemplateAuthoringService({ db, templatesDir });
    const rolePackService = new RolePackService({ db, rolePacksDir: rolePackDir });
    const stdout = createBuffer();
    const stderr = createBuffer();
    const program = createCliProgram({
      taskService,
      templateAuthoringService,
      rolePackService,
      dashboardQueryService: createDashboardQueryServiceForDb(db),
      tmuxRuntimeService: createTmuxRuntimeServiceStub() as never,
      dashboardSessionClient: createDashboardSessionClientStub(),
      humanAccountService: new HumanAccountService(db),
      taskConversationService: new TaskConversationService(db),
      stdout,
      stderr,
    }).exitOverride();

    await program.parseAsync([
      'create',
      'controller aware cli create',
      '--type', 'coding',
      '--controller', 'opus',
      '--bind', 'developer=sonnet',
      '--bind', 'craftsman=codex',
    ], { from: 'user' });

    const created = taskService.getTask('OC-300C');
    expect(stderr.value).toBe('');
    expect(created?.team?.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'architect', agentId: 'opus', member_kind: 'controller' }),
        expect.objectContaining({ role: 'developer', agentId: 'sonnet', member_kind: 'citizen' }),
        expect.objectContaining({ role: 'craftsman', agentId: 'codex', member_kind: 'craftsman' }),
      ]),
    );
  });

  it('creates smoke-test tasks through the cli flag', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-300SMOKE',
    });
    const stdout = createBuffer();
    const stderr = createBuffer();
    const program = createCliProgram({ taskService, stdout, stderr }).exitOverride();

    await program.parseAsync([
      'create',
      'smoke create',
      '--type', 'coding',
      '--smoke-test',
    ], { from: 'user' });

    const created = taskService.getTask('OC-300SMOKE');
    expect(stderr.value).toBe('');
    expect(created?.control?.mode).toBe('smoke_test');
  });

  it('rejects live regression commands when developer regression mode is disabled', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const bindings = new TaskContextBindingService(db);
    const conversations = new TaskConversationService(db);
    const provisioning = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'discord-thread-cli-regression-off',
    });
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-CLI-REG-OFF',
      imProvisioningPort: provisioning,
      taskContextBindingService: bindings,
    });
    const stdout = createBuffer();
    const stderr = createBuffer();
    const program = createCliProgram({
      taskService,
      taskConversationService: conversations,
      taskContextBindingService: bindings,
      imProvisioningPort: provisioning,
      stdout,
      stderr,
    }).exitOverride();

    await expect(program.parseAsync([
      'regression',
      'live',
      '--task-id', 'OC-CLI-REG-OFF',
      '--goal', 'should fail without env gate',
      '--message', 'continue',
    ], { from: 'user' })).rejects.toThrow(/AGORA_DEV_REGRESSION_MODE/);
  });

  it('runs live regression through the cli against an existing bound task', async () => {
    process.env.AGORA_DEV_REGRESSION_MODE = 'true';
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const bindings = new TaskContextBindingService(db);
    const conversations = new TaskConversationService(db);
    const provisioning = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'discord-thread-cli-regression-on',
    });
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-CLI-REG-ON',
      imProvisioningPort: provisioning,
      taskContextBindingService: bindings,
    });

    taskService.createTask({
      title: 'cli regression task',
      type: 'coding',
      creator: 'archon',
      description: 'drive execute stage from cli regression',
      priority: 'normal',
      control: { mode: 'regression_test' },
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'triage',
            mode: 'discuss',
            gate: { type: 'command' },
          },
          {
            id: 'execute',
            mode: 'execute',
            gate: { type: 'all_subtasks_done' },
          },
        ],
      },
      im_target: {
        provider: 'discord',
        visibility: 'private',
      },
    });
    await taskService.drainBackgroundOperations();
    provisioning.published.length = 0;

    const stdout = createBuffer();
    const stderr = createBuffer();
    const program = createCliProgram({
      taskService,
      taskConversationService: conversations,
      taskContextBindingService: bindings,
      imProvisioningPort: provisioning,
      stdout,
      stderr,
    }).exitOverride();

    await program.parseAsync([
      'regression',
      'live',
      '--task-id', 'OC-CLI-REG-ON',
      '--goal', 'drive execute stage from cli',
      '--message', 'advance if ready',
      '--participant', 'opus',
      '--action', 'advance_current',
      '--action-actor', 'archon',
      '--json',
    ], { from: 'user' });

    const payload = JSON.parse(stdout.value);
    expect(stderr.value).toBe('');
    expect(payload).toMatchObject({
      taskId: 'OC-CLI-REG-ON',
      threadRef: 'discord-thread-cli-regression-on',
      currentStage: 'execute',
      state: 'active',
    });
    expect(provisioning.published).toEqual(expect.arrayContaining([
      expect.objectContaining({
        thread_ref: 'discord-thread-cli-regression-on',
        messages: [
          expect.objectContaining({
            kind: 'regression_operator',
            participant_refs: ['opus'],
            body: 'advance if ready',
          }),
        ],
      }),
    ]));
  });

  it('can create a regression-mode task directly from the live regression command', async () => {
    process.env.AGORA_DEV_REGRESSION_MODE = 'true';
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const bindings = new TaskContextBindingService(db);
    const conversations = new TaskConversationService(db);
    const provisioning = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'discord-thread-cli-regression-create',
    });
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-CLI-REG-CREATE',
      imProvisioningPort: provisioning,
      taskContextBindingService: bindings,
    });
    const stdout = createBuffer();
    const stderr = createBuffer();
    const program = createCliProgram({
      taskService,
      taskConversationService: conversations,
      taskContextBindingService: bindings,
      imProvisioningPort: provisioning,
      rolePackService: new RolePackService({ db, rolePacksDir: rolePackDir }),
      templateAuthoringService: new TemplateAuthoringService({ db, templatesDir }),
      stdout,
      stderr,
    }).exitOverride();

    await program.parseAsync([
      'regression',
      'live',
      '--title', 'fresh regression task',
      '--type', 'coding',
      '--goal', 'create and start a fresh regression task',
      '--message', 'start the live regression loop',
      '--json',
    ], { from: 'user' });

    const payload = JSON.parse(stdout.value);
    const created = taskService.getTask('OC-CLI-REG-CREATE');
    expect(stderr.value).toBe('');
    expect(payload).toMatchObject({
      taskId: 'OC-CLI-REG-CREATE',
      threadRef: 'discord-thread-cli-regression-create',
      state: 'active',
    });
    expect(created?.control?.mode).toBe('regression_test');
    expect(provisioning.published).toEqual(expect.arrayContaining([
      expect.objectContaining({
        thread_ref: 'discord-thread-cli-regression-create',
        messages: [
          expect.objectContaining({
            kind: 'regression_operator',
            body: 'start the live regression loop',
          }),
        ],
      }),
    ]));
  });

  it('creates tasks with global and role-scoped skill policy through the cli', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-300SKILL',
    });
    const stdout = createBuffer();
    const stderr = createBuffer();
    const program = createCliProgram({ taskService, stdout, stderr }).exitOverride();

    await program.parseAsync([
      'create',
      'skill aware create',
      '--type', 'coding',
      '--skill', 'planning-with-files',
      '--skill', 'agora-bootstrap',
      '--role-skill', 'architect=brainstorming',
      '--role-skill', 'developer=refactoring-ui',
    ], { from: 'user' });

    const created = taskService.getTask('OC-300SKILL');
    expect(stderr.value).toBe('');
    expect(created?.skill_policy).toEqual({
      global_refs: ['planning-with-files', 'agora-bootstrap'],
      role_refs: {
        architect: ['brainstorming'],
        developer: ['refactoring-ui'],
      },
      enforcement: 'required',
    });
  });

  it('lists roles and stores scoped bindings through the cli', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const stdout = createBuffer();
    const stderr = createBuffer();
    const program = createCliProgram({
      taskService: new TaskService(db, { templatesDir }),
      templateAuthoringService: new TemplateAuthoringService({ db, templatesDir }),
      rolePackService: new RolePackService({ db, rolePacksDir: rolePackDir }),
      dashboardQueryService: createDashboardQueryServiceForDb(db),
      tmuxRuntimeService: createTmuxRuntimeServiceStub() as never,
      dashboardSessionClient: createDashboardSessionClientStub(),
      humanAccountService: new HumanAccountService(db),
      taskConversationService: new TaskConversationService(db),
      stdout,
      stderr,
    }).exitOverride();

    await program.parseAsync(['roles', 'show', 'controller'], { from: 'user' });
    await program.parseAsync([
      'bindings',
      'set',
      '--scope', 'workspace',
      '--ref', 'default',
      '--role', 'controller',
      '--target-kind', 'runtime_agent',
      '--target-adapter', 'openclaw',
      '--target-ref', 'opus',
    ], { from: 'user' });
    await program.parseAsync(['bindings', 'list', '--scope', 'workspace', '--ref', 'default'], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('controller — Controller');
    expect(stdout.value).toContain('binding 已设置: controller -> openclaw:opus');
    expect(stdout.value).toContain('controller\tworkspace:default\truntime_agent\topenclaw:opus');
  });

  it('uses workspace role bindings as create-time defaults before template suggested values', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-300D',
    });
    const rolePackService = new RolePackService({ db, rolePacksDir: rolePackDir });
    rolePackService.saveBinding({
      id: 'binding-create-1',
      role_id: 'developer',
      scope: 'workspace',
      scope_ref: 'default',
      target_kind: 'runtime_agent',
      target_adapter: 'openclaw',
      target_ref: 'glm47',
      binding_mode: 'overlay',
    });
    const stdout = createBuffer();
    const stderr = createBuffer();
    const program = createCliProgram({
      taskService,
      templateAuthoringService: new TemplateAuthoringService({ db, templatesDir }),
      rolePackService,
      dashboardQueryService: createDashboardQueryServiceForDb(db),
      tmuxRuntimeService: createTmuxRuntimeServiceStub() as never,
      dashboardSessionClient: createDashboardSessionClientStub(),
      humanAccountService: new HumanAccountService(db),
      taskConversationService: new TaskConversationService(db),
      stdout,
      stderr,
    }).exitOverride();

    await program.parseAsync(['create', 'binding aware create', '--type', 'coding'], { from: 'user' });

    const created = taskService.getTask('OC-300D');
    expect(stderr.value).toBe('');
    expect(created?.team?.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'developer', agentId: 'glm47' }),
      ]),
    );
  });

  it('supports template role and stage CRUD through the cli', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const templateAuthoringService = new TemplateAuthoringService({ db, templatesDir });
    const stdout = createBuffer();
    const stderr = createBuffer();
    const program = createCliProgram({
      taskService: new TaskService(db, { templatesDir }),
      templateAuthoringService,
      rolePackService: new RolePackService({ db, rolePacksDir: rolePackDir }),
      dashboardQueryService: createDashboardQueryServiceForDb(db),
      tmuxRuntimeService: createTmuxRuntimeServiceStub() as never,
      dashboardSessionClient: createDashboardSessionClientStub(),
      humanAccountService: new HumanAccountService(db),
      taskConversationService: new TaskConversationService(db),
      stdout,
      stderr,
    }).exitOverride();

    await program.parseAsync(['templates', 'role', 'add', 'coding', '--role', 'analyst', '--member-kind', 'citizen', '--suggested', 'gpt52'], { from: 'user' });
    await program.parseAsync(['templates', 'role', 'remove', 'coding', '--role', 'reviewer'], { from: 'user' });
    await program.parseAsync(['templates', 'stage', 'add', 'coding', '--id', 'implement', '--name', '实施', '--mode', 'execute'], { from: 'user' });
    await program.parseAsync(['templates', 'stage', 'move', 'coding', '--id', 'implement', '--before', 'review'], { from: 'user' });
    await program.parseAsync(['templates', 'show', 'coding', '--json'], { from: 'user' });

    const template = templateAuthoringService.getTemplate('coding');
    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('模板角色已新增: coding -> analyst');
    expect(stdout.value).toContain('模板角色已删除: coding -> reviewer');
    expect(stdout.value).toContain('模板阶段已新增: coding -> implement');
    expect(stdout.value).toContain('模板阶段已重排: coding -> implement');
    expect(template.defaultTeam?.analyst?.member_kind).toBe('citizen');
    expect(template.defaultTeam?.reviewer).toBeUndefined();
    expect(template.stages?.map((stage) => stage.id)).toEqual(['discuss', 'develop', 'implement', 'review']);
  });

  it('validates, renders, and applies workflow graphs through the cli', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const templateAuthoringService = new TemplateAuthoringService({ db, templatesDir });
    const stdout = createBuffer();
    const stderr = createBuffer();
    const workflowFile = makeWorkflowFile({
      defaultWorkflow: 'custom',
      stages: [
        { id: 'triage', name: 'Triage', mode: 'discuss', gate: { type: 'command' } },
        { id: 'implement', name: 'Implement', mode: 'execute', gate: { type: 'all_subtasks_done' } },
        { id: 'review', name: 'Review', mode: 'discuss', gate: { type: 'approval', approver: 'reviewer' }, reject_target: 'implement' },
      ],
    });
    const program = createCliProgram({
      taskService: new TaskService(db, { templatesDir }),
      templateAuthoringService,
      rolePackService: new RolePackService({ db, rolePacksDir: rolePackDir }),
      dashboardQueryService: createDashboardQueryServiceForDb(db),
      tmuxRuntimeService: createTmuxRuntimeServiceStub() as never,
      dashboardSessionClient: createDashboardSessionClientStub(),
      humanAccountService: new HumanAccountService(db),
      taskConversationService: new TaskConversationService(db),
      stdout,
      stderr,
    }).exitOverride();

    await program.parseAsync(['graph', 'validate', '--file', workflowFile], { from: 'user' });
    await program.parseAsync(['graph', 'render', '--format', 'mermaid', '--file', workflowFile], { from: 'user' });
    await program.parseAsync(['graph', 'apply', '--template', 'coding', '--file', workflowFile], { from: 'user' });
    await program.parseAsync(['graph', 'show', '--template', 'coding'], { from: 'user' });

    const template = templateAuthoringService.getTemplate('coding');
    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('workflow graph valid');
    expect(stdout.value).toContain('flowchart TD');
    expect(stdout.value).toContain('triage --> implement');
    expect(stdout.value).toContain('workflow graph 已应用到模板: coding');
    expect(stdout.value).toContain('graph version: 1');
    expect(template.stages?.map((stage) => stage.id)).toEqual(['triage', 'implement', 'review']);
    expect(template.graph?.entry_nodes).toEqual(['triage']);
  });

  it('surfaces invalid workflow file json with a clear graph command error', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const templateAuthoringService = new TemplateAuthoringService({ db, templatesDir });
    const stdout = createBuffer();
    const stderr = createBuffer();
    const workflowFile = makeRawWorkflowFile('{broken-json');
    const program = createCliProgram({
      taskService: new TaskService(db, { templatesDir }),
      templateAuthoringService,
      rolePackService: new RolePackService({ db, rolePacksDir: rolePackDir }),
      dashboardQueryService: createDashboardQueryServiceForDb(db),
      tmuxRuntimeService: createTmuxRuntimeServiceStub() as never,
      dashboardSessionClient: createDashboardSessionClientStub(),
      humanAccountService: new HumanAccountService(db),
      taskConversationService: new TaskConversationService(db),
      stdout,
      stderr,
    }).exitOverride();

    await expect(program.parseAsync(['graph', 'validate', '--file', workflowFile], {
      from: 'user',
    })).rejects.toThrow(/invalid json in workflow file/i);
  });

  it('manages archive jobs through the cli', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, { templatesDir });
    const dashboardQueryService = createDashboardQueryServiceForDb(db);
    const archives = new ArchiveJobRepository(db);
    const stdout = createBuffer();
    const stderr = createBuffer();
    const program = createCliProgram({
      taskService,
      dashboardQueryService,
      tmuxRuntimeService: createTmuxRuntimeServiceStub() as never,
      dashboardSessionClient: createDashboardSessionClientStub(),
      humanAccountService: new HumanAccountService(db),
      taskConversationService: new TaskConversationService(db),
      templateAuthoringService: new TemplateAuthoringService({ db, templatesDir }),
      rolePackService: new RolePackService({ db, rolePacksDir: rolePackDir }),
      stdout,
      stderr,
    }).exitOverride();

    const task = taskService.createTask({
      title: 'archive cli',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    const job = archives.insertArchiveJob({
      task_id: task.id,
      status: 'review_pending',
      target_path: 'ZeYu-AI-Brain/tasks/',
      payload: {
        closeout_review: {
          required: true,
          state: 'review_pending',
        },
      },
      writer_agent: 'writer-agent',
    });
    expect(job).toBeDefined();

    await program.parseAsync(['archive', 'jobs', 'list'], { from: 'user' });
    await program.parseAsync(['archive', 'jobs', 'show', String(job?.id), '--json'], { from: 'user' });
    await program.parseAsync(['archive', 'jobs', 'approve', String(job?.id), '--approver-id', 'lizeyu', '--comment', 'looks good'], { from: 'user' });
    await program.parseAsync(['archive', 'jobs', 'complete', String(job?.id), '--commit-hash', 'deadbeef'], { from: 'user' });
    await program.parseAsync(['archive', 'jobs', 'retry', String(job?.id)], { from: 'user' });
    await program.parseAsync(['archive', 'jobs', 'fail', String(job?.id), '--error-message', 'writer timeout'], { from: 'user' });

    const finalJob = dashboardQueryService.getArchiveJob(job!.id);
    expect(stderr.value).toBe('');
    expect(stdout.value).toContain(`\t${task.id}\treview_pending\t`);
    expect(stdout.value).toContain(`"task_id": "${task.id}"`);
    expect(stdout.value).toContain(`archive job 已审批放行: ${job?.id} -> pending`);
    expect(stdout.value).toContain(`archive job 已完成: ${job?.id} -> synced`);
    expect(stdout.value).toContain(`archive job 已重置: ${job?.id} -> pending`);
    expect(stdout.value).toContain(`archive job 已失败: ${job?.id} -> failed`);
    expect(finalJob.status).toBe('failed');
    expect(finalJob.payload).toMatchObject({ error_message: 'writer timeout' });
  });

  it('archives and deletes projects through the cli with lifecycle guards', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const stdout = createBuffer();
    const stderr = createBuffer();
    const projectService = new ProjectService(db);
    projectService.createProject({
      id: 'proj-ops',
      name: 'Project Ops',
    });
    const program = createCliProgram({
      projectService,
      stdout,
      stderr,
    }).exitOverride();

    await program.parseAsync(['projects', 'archive', 'proj-ops'], { from: 'user' });
    await program.parseAsync(['projects', 'delete', 'proj-ops'], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('Project 已归档: proj-ops');
    expect(stdout.value).toContain('Project 已删除: proj-ops');
    expect(projectService.getProject('proj-ops')).toBeNull();
  });

  it('runs task action commands through the cli', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    let taskCounter = 301;
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => `OC-${taskCounter++}`,
    });
    const subtasks = new SubtaskRepository(db);
    const stdout = createBuffer();
    const stderr = createBuffer();
    const program = createCliProgram({ taskService, stdout, stderr }).exitOverride();

    await program.parseAsync(['create', '实现 CLI actions', '--type', 'document'], { from: 'user' });
    await program.parseAsync(['archon-approve', 'OC-301', '--reviewer-id', 'lizeyu', '--comment', 'ok'], { from: 'user' });

    subtasks.insertSubtask({
      id: 'write-doc',
      task_id: 'OC-301',
      stage_id: 'write',
      title: '写正文',
      assignee: 'glm5',
    });
    await program.parseAsync(['subtask-done', 'OC-301', '--subtask-id', 'write-doc', '--caller-id', 'glm5', '--output', 'done'], { from: 'user' });
    await program.parseAsync(['advance', 'OC-301', '--caller-id', 'archon'], { from: 'user' });
    await program.parseAsync(['approve', 'OC-301', '--approver-id', 'gpt52', '--comment', 'ship it'], { from: 'user' });
    subtasks.insertSubtask({
      id: 'archive-doc',
      task_id: 'OC-301',
      stage_id: 'write',
      title: '归档正文',
      assignee: 'glm5',
    });
    subtasks.insertSubtask({
      id: 'cancel-doc',
      task_id: 'OC-301',
      stage_id: 'write',
      title: '取消正文',
      assignee: 'glm5',
    });
    await program.parseAsync(['subtasks', 'archive', 'OC-301', '--subtask-id', 'archive-doc', '--caller-id', 'glm5', '--note', 'hold'], { from: 'user' });
    await program.parseAsync(['subtasks', 'cancel', 'OC-301', '--subtask-id', 'cancel-doc', '--caller-id', 'glm5', '--note', 'drop'], { from: 'user' });
    await program.parseAsync(['create', '实现 CLI states', '--type', 'document'], { from: 'user' });
    await program.parseAsync(['pause', 'OC-302', '--reason', 'hold'], { from: 'user' });
    await program.parseAsync(['resume', 'OC-302'], { from: 'user' });
    await program.parseAsync(['cancel', 'OC-302', '--reason', 'closed'], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('已 Archon 审批通过');
    expect(stdout.value).toContain('子任务 write-doc 已完成');
    expect(stdout.value).toContain('子任务 archive-doc 已归档');
    expect(stdout.value).toContain('子任务 cancel-doc 已取消');
    expect(stdout.value).toContain('已推进到阶段: review');
    expect(stdout.value).toContain('已审批通过');
    expect(stdout.value).toContain('已暂停');
    expect(stdout.value).toContain('已恢复');
    expect(stdout.value).toContain('已取消');
  });

  it('runs quorum confirm and unblock commands', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-302',
    });
    const tasks = new TaskRepository(db);
    const stdout = createBuffer();
    const stderr = createBuffer();
    const program = createCliProgram({ taskService, stdout, stderr }).exitOverride();

    tasks.insertTask({
      id: 'OC-302',
      title: 'CLI quorum',
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
    tasks.updateTask('OC-302', 1, { state: 'created' });
    tasks.updateTask('OC-302', 2, { state: 'active', current_stage: 'vote' });
    db.prepare('INSERT INTO stage_history (task_id, stage_id) VALUES (?, ?)').run('OC-302', 'vote');

    await program.parseAsync(['confirm', 'OC-302', '--voter-id', 'opus', '--vote', 'approve', '--comment', 'first'], { from: 'user' });
    await program.parseAsync(['confirm', 'OC-302', '--voter-id', 'gpt52', '--vote', 'approve', '--comment', 'second'], { from: 'user' });
    tasks.updateTask('OC-302', 3, { state: 'blocked' });
    await program.parseAsync(['unblock', 'OC-302', '--reason', 'dependency cleared'], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('当前票数: approved=1 total=1');
    expect(stdout.value).toContain('当前票数: approved=2 total=2');
    expect(stdout.value).toContain('已解除阻塞');
  });

  it('runs dashboard session commands through the cli with the legacy runtime transport shim', async () => {
    const stdout = createBuffer();
    const stderr = createBuffer();
    const program = createCliProgram({
      taskService: {
        createTask: () => {
          throw new Error('unused');
        },
      } as unknown as TaskService,
      legacyRuntimeService: {
        up: () => {
          throw new Error('unused');
        },
        status: () => {
          throw new Error('unused');
        },
        send: () => {
          throw new Error('unused');
        },
        sendText: () => {
          throw new Error('unused');
        },
        sendKeys: () => {
          throw new Error('unused');
        },
        submitChoice: () => {
          throw new Error('unused');
        },
        start: () => {
          throw new Error('unused');
        },
        resume: () => {
          throw new Error('unused');
        },
        task: () => {
          throw new Error('unused');
        },
        tail: () => {
          throw new Error('unused');
        },
        doctor: () => {
          throw new Error('unused');
        },
        down: () => {
          throw new Error('unused');
        },
        recordIdentity: () => {
          throw new Error('unused');
        },
      },
      dashboardSessionClient: createDashboardSessionClientStub(),
      dashboardQueryService: createDashboardQueryServiceStub(),
      stdout,
      stderr,
    }).exitOverride();

    await program.parseAsync(['dashboard', 'session', 'login', '--username', 'lizeyu', '--password', 'secret-pass'], { from: 'user' });
    await program.parseAsync(['dashboard', 'session', 'status'], { from: 'user' });
    await program.parseAsync(['dashboard', 'session', 'logout'], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('dashboard session 已建立: lizeyu');
    expect(stdout.value).toContain('authenticated: true');
    expect(stdout.value).toContain('dashboard session 已清除');
  });

  it('reads dashboard session login credentials from env in developer regression mode', async () => {
    const stdout = createBuffer();
    const stderr = createBuffer();
    process.env.AGORA_DEV_REGRESSION_MODE = 'true';
    process.env.AGORA_DASHBOARD_LOGIN_USER = 'regression-admin';
    process.env.AGORA_DASHBOARD_LOGIN_PASSWORD = 'secret-pass';

    const program = createCliProgram({
      taskService: {
        createTask: () => {
          throw new Error('unused');
        },
      } as unknown as TaskService,
      legacyRuntimeService: {
        up: () => {
          throw new Error('unused');
        },
        status: () => {
          throw new Error('unused');
        },
        send: () => {
          throw new Error('unused');
        },
        sendText: () => {
          throw new Error('unused');
        },
        sendKeys: () => {
          throw new Error('unused');
        },
        submitChoice: () => {
          throw new Error('unused');
        },
        start: () => {
          throw new Error('unused');
        },
        resume: () => {
          throw new Error('unused');
        },
        task: () => {
          throw new Error('unused');
        },
        tail: () => {
          throw new Error('unused');
        },
        doctor: () => {
          throw new Error('unused');
        },
        down: () => {
          throw new Error('unused');
        },
        recordIdentity: () => {
          throw new Error('unused');
        },
      },
      dashboardSessionClient: createDashboardSessionClientStub(),
      dashboardQueryService: createDashboardQueryServiceStub(),
      stdout,
      stderr,
    }).exitOverride();

    await program.parseAsync(['dashboard', 'session', 'login'], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('dashboard session 已建立: regression-admin');
  });

  it('runs local dev stack through the start command and run alias', async () => {
    const stdout = createBuffer();
    const stderr = createBuffer();
    const startCommandRunner = vi.fn().mockResolvedValue(undefined);
    const agoraProjectRoot = resolve(import.meta.dirname, '../../../../');
    const program = createCliProgram({
      taskService: {
        createTask: () => {
          throw new Error('unused');
        },
      } as unknown as TaskService,
      legacyRuntimeService: {
        up: () => {
          throw new Error('unused');
        },
        status: () => {
          throw new Error('unused');
        },
        send: () => {
          throw new Error('unused');
        },
        sendText: () => {
          throw new Error('unused');
        },
        sendKeys: () => {
          throw new Error('unused');
        },
        submitChoice: () => {
          throw new Error('unused');
        },
        start: () => {
          throw new Error('unused');
        },
        resume: () => {
          throw new Error('unused');
        },
        task: () => {
          throw new Error('unused');
        },
        tail: () => {
          throw new Error('unused');
        },
        doctor: () => {
          throw new Error('unused');
        },
        down: () => {
          throw new Error('unused');
        },
        recordIdentity: () => {
          throw new Error('unused');
        },
      } as never,
      dashboardSessionClient: createDashboardSessionClientStub(),
      dashboardQueryService: createDashboardQueryServiceStub(),
      humanAccountService: {
        bootstrapAdmin: () => {
          throw new Error('unused');
        },
      } as unknown as HumanAccountService,
      taskConversationService: {
        listByTaskId: () => {
          throw new Error('unused');
        },
      } as unknown as TaskConversationService,
      startCommandRunner,
      startCommandCwd: makeTempDir('agora-ts-cli-start-cwd-'),
      startCommandFallbackRoot: agoraProjectRoot,
      stdout,
      stderr,
    }).exitOverride();

    await program.parseAsync(['start'], { from: 'user' });
    await program.parseAsync(['run'], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(startCommandRunner).toHaveBeenCalledTimes(2);
    expect(startCommandRunner.mock.calls[0]?.[0]?.args?.[0]).toContain('scripts/dev-start.sh');
  });

  it('reads task conversation entries through the cli', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-960',
    });
    const bindings = new TaskContextBindingService(db, {
      idGenerator: () => 'binding-1',
    });
    const conversations = new TaskConversationService(db, {
      idGenerator: () => 'entry-1',
      now: () => new Date('2026-03-10T12:00:01.000Z'),
    });
    const stdout = createBuffer();
    const stderr = createBuffer();

    const task = taskService.createTask({
      title: 'cli conversation',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    bindings.createBinding({
      task_id: task.id,
      im_provider: 'discord',
      thread_ref: 'thread-1',
    });
    conversations.ingest({
      provider: 'discord',
      thread_ref: 'thread-1',
      provider_message_ref: 'msg-1',
      direction: 'inbound',
      author_kind: 'human',
      author_ref: 'user-1',
      display_name: 'Lizeyu',
      body: 'hello cli',
      occurred_at: '2026-03-10T12:00:00.000Z',
    });

    const program = createCliProgram({
      taskService,
      taskConversationService: conversations,
      dashboardQueryService: createDashboardQueryServiceForDb(db),
      tmuxRuntimeService: {
        up: () => { throw new Error('unused'); },
        status: () => { throw new Error('unused'); },
        send: () => { throw new Error('unused'); },
        sendText: () => { throw new Error('unused'); },
        sendKeys: () => { throw new Error('unused'); },
        submitChoice: () => { throw new Error('unused'); },
        start: () => { throw new Error('unused'); },
        resume: () => { throw new Error('unused'); },
        task: () => { throw new Error('unused'); },
        tail: () => { throw new Error('unused'); },
        doctor: () => { throw new Error('unused'); },
        down: () => { throw new Error('unused'); },
        recordIdentity: () => { throw new Error('unused'); },
      },
      dashboardSessionClient: createDashboardSessionClientStub(),
      humanAccountService: new HumanAccountService(db),
      stdout,
      stderr,
    }).exitOverride();

    await program.parseAsync(['task', 'conversation', task.id, '--json'], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('"body": "hello cli"');
    expect(stdout.value).toContain('"task_id": "OC-960"');
  });

  it('reads task conversation summary through the cli', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-961',
    });
    const bindings = new TaskContextBindingService(db, {
      idGenerator: () => 'binding-2',
    });
    const conversations = new TaskConversationService(db, {
      idGenerator: () => 'entry-2',
      now: () => new Date('2026-03-10T12:00:01.000Z'),
    });
    const stdout = createBuffer();
    const stderr = createBuffer();

    const task = taskService.createTask({
      title: 'cli conversation summary',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    bindings.createBinding({
      task_id: task.id,
      im_provider: 'discord',
      thread_ref: 'thread-2',
    });
    conversations.ingest({
      provider: 'discord',
      thread_ref: 'thread-2',
      provider_message_ref: 'msg-2',
      direction: 'outbound',
      author_kind: 'agent',
      display_name: 'Agora Bot',
      body: 'hello summary cli',
      occurred_at: '2026-03-10T12:00:00.000Z',
    });

    const program = createCliProgram({
      taskService,
      taskConversationService: conversations,
      dashboardQueryService: createDashboardQueryServiceForDb(db),
      tmuxRuntimeService: {
        up: () => { throw new Error('unused'); },
        status: () => { throw new Error('unused'); },
        send: () => { throw new Error('unused'); },
        sendText: () => { throw new Error('unused'); },
        sendKeys: () => { throw new Error('unused'); },
        submitChoice: () => { throw new Error('unused'); },
        start: () => { throw new Error('unused'); },
        resume: () => { throw new Error('unused'); },
        task: () => { throw new Error('unused'); },
        tail: () => { throw new Error('unused'); },
        doctor: () => { throw new Error('unused'); },
        down: () => { throw new Error('unused'); },
        recordIdentity: () => { throw new Error('unused'); },
      },
      dashboardSessionClient: createDashboardSessionClientStub(),
      humanAccountService: new HumanAccountService(db),
      stdout,
      stderr,
    }).exitOverride();

    await program.parseAsync(['task', 'conversation-summary', task.id, '--json'], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('"task_id": "OC-961"');
    expect(stdout.value).toContain('"latest_body_excerpt": "hello summary cli"');
  });

  it('marks task conversation as read through the cli', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-962',
    });
    const bindings = new TaskContextBindingService(db, {
      idGenerator: () => 'binding-3',
    });
    const conversations = new TaskConversationService(db, {
      idGenerator: () => 'entry-3',
      now: () => new Date('2026-03-10T12:00:01.000Z'),
    });
    const humans = new HumanAccountService(db);
    const account = humans.bootstrapAdmin({
      username: 'lizeyu',
      password: 'secret-pass',
    });
    const stdout = createBuffer();
    const stderr = createBuffer();

    const task = taskService.createTask({
      title: 'cli conversation mark read',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    bindings.createBinding({
      task_id: task.id,
      im_provider: 'discord',
      thread_ref: 'thread-3',
    });
    conversations.ingest({
      provider: 'discord',
      thread_ref: 'thread-3',
      provider_message_ref: 'msg-3',
      direction: 'inbound',
      author_kind: 'human',
      display_name: 'Lizeyu',
      body: 'hello unread cli',
      occurred_at: '2026-03-10T12:00:00.000Z',
    });

    const program = createCliProgram({
      taskService,
      taskConversationService: conversations,
      dashboardQueryService: createDashboardQueryServiceForDb(db),
      tmuxRuntimeService: {
        up: () => { throw new Error('unused'); },
        status: () => { throw new Error('unused'); },
        send: () => { throw new Error('unused'); },
        sendText: () => { throw new Error('unused'); },
        sendKeys: () => { throw new Error('unused'); },
        submitChoice: () => { throw new Error('unused'); },
        start: () => { throw new Error('unused'); },
        resume: () => { throw new Error('unused'); },
        task: () => { throw new Error('unused'); },
        tail: () => { throw new Error('unused'); },
        doctor: () => { throw new Error('unused'); },
        down: () => { throw new Error('unused'); },
        recordIdentity: () => { throw new Error('unused'); },
      },
      dashboardSessionClient: createDashboardSessionClientStub(),
      humanAccountService: new HumanAccountService(db),
      stdout,
      stderr,
    }).exitOverride();

    await program.parseAsync([
      'task',
      'conversation-read',
      task.id,
      '--account-id',
      String(account.id),
      '--entry-id',
      'entry-3',
      '--json',
    ], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('"task_id": "OC-962"');
    expect(stdout.value).toContain('"unread_count": 0');
  });

  it('manages lightweight dashboard users through the cli', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const humanAccountService = new HumanAccountService(db);
    humanAccountService.bootstrapAdmin({
      username: 'lizeyu',
      password: 'secret-pass',
    });
    const stdout = createBuffer();
    const stderr = createBuffer();
    const program = createCliProgram({
      taskService: {
        createTask: () => {
          throw new Error('unused');
        },
      } as unknown as TaskService,
      tmuxRuntimeService: {
        up: () => {
          throw new Error('unused');
        },
        status: () => {
          throw new Error('unused');
        },
        send: () => {
          throw new Error('unused');
        },
        start: () => {
          throw new Error('unused');
        },
        resume: () => {
          throw new Error('unused');
        },
        task: () => {
          throw new Error('unused');
        },
        tail: () => {
          throw new Error('unused');
        },
        doctor: () => {
          throw new Error('unused');
        },
        down: () => {
          throw new Error('unused');
        },
        recordIdentity: () => {
          throw new Error('unused');
        },
      } as never,
      dashboardSessionClient: createDashboardSessionClientStub(),
      dashboardQueryService: createDashboardQueryServiceForDb(db),
      humanAccountService,
      stdout,
      stderr,
    }).exitOverride();

    await program.parseAsync(['dashboard', 'users', 'add', '--username', 'alice', '--password', 'alice-pass'], { from: 'user' });
    await program.parseAsync(['dashboard', 'users', 'bind-identity', '--username', 'alice', '--provider', 'discord', '--external-user-id', 'discord-user-123'], { from: 'user' });
    await program.parseAsync(['dashboard', 'users', 'list'], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('dashboard 用户已创建: alice');
    expect(stdout.value).toContain('identity 已绑定: alice -> discord:discord-user-123');
    expect(stdout.value).toContain('alice\tmember\tenabled');
  });

  it('supports unblock retry through the cli command', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-306',
    });
    const subtasks = new SubtaskRepository(db);
    const stdout = createBuffer();
    const stderr = createBuffer();
    const program = createCliProgram({ taskService, stdout, stderr }).exitOverride();

    await program.parseAsync(['create', 'CLI unblock retry', '--type', 'coding'], { from: 'user' });
    subtasks.insertSubtask({
      id: 'retry-cli',
      task_id: 'OC-306',
      stage_id: 'discuss',
      title: 'retry from cli',
      assignee: 'codex',
      status: 'failed',
      output: 'timed out',
      craftsman_type: 'codex',
      craftsman_session: 'tmux:retry-cli',
      dispatch_status: 'failed',
      dispatched_at: '2026-03-09T11:00:00.000Z',
      done_at: '2026-03-09T11:01:00.000Z',
    });
    taskService.updateTaskState('OC-306', 'blocked', { reason: 'timeout escalation' });
    await program.parseAsync(['unblock', 'OC-306', '--reason', 'retry now', '--action', 'retry'], { from: 'user' });

    const status = taskService.getTaskStatus('OC-306');

    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('任务 OC-306 已解除阻塞');
    expect(status.subtasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'retry-cli',
          status: 'pending',
          output: null,
          craftsman_session: null,
          dispatch_status: null,
        }),
      ]),
    );
  });

  it('supports unblock skip through the cli command', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-307',
    });
    const subtasks = new SubtaskRepository(db);
    const stdout = createBuffer();
    const stderr = createBuffer();
    const program = createCliProgram({ taskService, stdout, stderr }).exitOverride();

    await program.parseAsync(['create', 'CLI unblock skip', '--type', 'coding'], { from: 'user' });
    subtasks.insertSubtask({
      id: 'skip-cli',
      task_id: 'OC-307',
      stage_id: 'discuss',
      title: 'skip from cli',
      assignee: 'codex',
      status: 'failed',
      output: 'timed out',
      craftsman_type: 'codex',
      craftsman_session: 'tmux:skip-cli',
      dispatch_status: 'failed',
      dispatched_at: '2026-03-09T11:00:00.000Z',
    });
    taskService.updateTaskState('OC-307', 'blocked', { reason: 'human intervention' });
    await program.parseAsync(['unblock', 'OC-307', '--reason', 'skip now', '--action', 'skip'], { from: 'user' });

    const status = taskService.getTaskStatus('OC-307');

    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('任务 OC-307 已解除阻塞');
    expect(status.subtasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'skip-cli',
          status: 'done',
          output: 'Skipped by archon: skip now',
          craftsman_session: null,
          dispatch_status: 'skipped',
        }),
      ]),
    );
  });

  it('supports unblock reassign through the cli command', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-308',
    });
    const subtasks = new SubtaskRepository(db);
    const stdout = createBuffer();
    const stderr = createBuffer();
    const program = createCliProgram({ taskService, stdout, stderr }).exitOverride();

    await program.parseAsync(['create', 'CLI unblock reassign', '--type', 'coding'], { from: 'user' });
    subtasks.insertSubtask({
      id: 'reassign-cli',
      task_id: 'OC-308',
      stage_id: 'discuss',
      title: 'reassign from cli',
      assignee: 'codex',
      status: 'failed',
      output: 'timed out',
      craftsman_type: 'codex',
      craftsman_session: 'tmux:reassign-cli',
      dispatch_status: 'failed',
      dispatched_at: '2026-03-09T11:00:00.000Z',
    });
    taskService.updateTaskState('OC-308', 'blocked', { reason: 'human intervention' });
    await program.parseAsync([
      'unblock',
      'OC-308',
      '--reason', 'reassign now',
      '--action', 'reassign',
      '--assignee', 'claude',
      '--craftsman-type', 'claude',
    ], { from: 'user' });

    const status = taskService.getTaskStatus('OC-308');

    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('任务 OC-308 已解除阻塞');
    expect(status.subtasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'reassign-cli',
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

  it('cleans up orphaned tasks through the cli command', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-303',
    });
    const tasks = new TaskRepository(db);
    const stdout = createBuffer();
    const stderr = createBuffer();
    const program = createCliProgram({ taskService, stdout, stderr }).exitOverride();

    tasks.insertTask({
      id: 'OC-303',
      title: 'cleanup orphaned',
      description: '',
      type: 'custom',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: { stages: [] },
    });
    tasks.updateTask('OC-303', 1, { state: 'orphaned' });

    await program.parseAsync(['cleanup', '--task-id', 'OC-303'], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('已清理 orphaned 任务: 1');
    expect(taskService.getTask('OC-303')).toBeNull();
  });

  it('probes stuck tasks through the cli command', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const provisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      thread_ref: 'thread-cli-probe-1',
    });
    const taskContextBindingService = new TaskContextBindingService(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-303B',
      imProvisioningPort: provisioningPort,
      taskContextBindingService,
    });
    const stdout = createBuffer();
    const stderr = createBuffer();
    const program = createCliProgram({ taskService, stdout, stderr }).exitOverride();

    taskService.createTask({
      title: 'probe stuck cli',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      im_target: { provider: 'discord', visibility: 'private' },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    db.prepare('UPDATE tasks SET updated_at = ? WHERE id = ?').run('2026-03-12T00:00:00.000Z', 'OC-303B');

    await program.parseAsync(['probe-stuck', '--controller-ms', '1000', '--roster-ms', '2000', '--inbox-ms', '3000'], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('scanned_tasks: 1');
    expect(stdout.value).toContain('controller_pings:');
    expect(stdout.value).toContain('roster_pings:');
  });

  it('dispatches craftsmen subtasks and handles callback/status commands through the cli', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const dispatcher = new CraftsmanDispatcher(db, {
      executionIdGenerator: () => 'exec-cli-1',
      adapters: {
        codex: new StubCraftsmanAdapter('codex', () => '2026-03-08T14:10:00.000Z'),
      },
    });
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-304',
      craftsmanDispatcher: dispatcher,
    });
    const subtasks = new SubtaskRepository(db);
    const stdout = createBuffer();
    const stderr = createBuffer();
    const program = createCliProgram({ taskService, stdout, stderr }).exitOverride();

    taskService.createTask({
      title: '实现 craftsmen cli',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      workflow_override: {
        type: 'craftsman-ready',
        stages: [{
          id: 'develop',
          mode: 'execute',
          execution_kind: 'citizen_execute',
          allowed_actions: ['execute', 'dispatch_craftsman'],
          gate: { type: 'all_subtasks_done' },
        }],
      },
    });
    subtasks.insertSubtask({
      id: 'sub-codex',
      task_id: 'OC-304',
      stage_id: 'develop',
      title: 'run codex',
      assignee: 'sonnet',
      craftsman_type: 'codex',
    });

    await program.parseAsync([
      'craftsman', 'dispatch',
      'OC-304',
      'sub-codex',
      '--caller-id', 'opus',
      '--adapter', 'codex',
      '--workdir', '/tmp/codex',
    ], { from: 'user' });
    await program.parseAsync(['craftsman', 'status', 'exec-cli-1'], { from: 'user' });
    await program.parseAsync(['craftsman', 'history', 'OC-304', 'sub-codex'], { from: 'user' });
    await program.parseAsync([
      'craftsman', 'callback',
      'exec-cli-1',
      '--status', 'succeeded',
      '--session-id', 'codex:exec-cli-1',
      '--payload', '{"summary":"cli callback done"}',
      '--finished-at', '2026-03-08T14:12:00.000Z',
    ], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('craftsman execution 已派发: exec-cli-1');
    expect(stdout.value).toContain('exec-cli-1');
    expect(stdout.value).toContain('running');
    expect(stdout.value).toContain('adapter: codex');
    expect(stdout.value).toContain('craftsman callback 已处理: exec-cli-1');
    expect(stdout.value).toContain('cli callback done');
  });

  it('rejects craftsmen dispatch through the cli when the task is paused', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const dispatcher = new CraftsmanDispatcher(db, {
      executionIdGenerator: () => 'exec-cli-paused-1',
      adapters: {
        codex: new StubCraftsmanAdapter('codex', () => '2026-03-09T11:00:00.000Z'),
      },
    });
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-305',
      craftsmanDispatcher: dispatcher,
    });
    const subtasks = new SubtaskRepository(db);
    const stdout = createBuffer();
    const stderr = createBuffer();
    const program = createCliProgram({ taskService, stdout, stderr }).exitOverride();

    await program.parseAsync(['create', 'paused craftsmen cli guard', '--type', 'coding'], { from: 'user' });
    subtasks.insertSubtask({
      id: 'sub-codex-paused',
      task_id: 'OC-305',
      stage_id: 'discuss',
      title: 'run codex later',
      assignee: 'sonnet',
      craftsman_type: 'codex',
    });
    await program.parseAsync(['pause', 'OC-305', '--reason', 'hold'], { from: 'user' });

    await expect(program.parseAsync([
      'craftsman', 'dispatch',
      'OC-305',
      'sub-codex-paused',
      '--caller-id', 'opus',
      '--adapter', 'codex',
      '--workdir', '/tmp/codex',
    ], { from: 'user' })).rejects.toThrow("Task OC-305 is in state 'paused', expected 'active'");
    expect(stderr.value).toBe('');
    expect(stdout.value).not.toContain('craftsman execution 已派发');
  });

  it('rejects craftsmen dispatch through the cli when concurrency limit is reached', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const dispatcher = new CraftsmanDispatcher(db, {
      maxConcurrentRunning: 1,
      executionIdGenerator: () => 'exec-cli-limit-1',
      adapters: {
        codex: new StubCraftsmanAdapter('codex', () => '2026-03-09T16:40:00.000Z'),
      },
    });
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-306',
      craftsmanDispatcher: dispatcher,
    });
    const subtasks = new SubtaskRepository(db);
    const stdout = createBuffer();
    const stderr = createBuffer();
    const program = createCliProgram({ taskService, stdout, stderr }).exitOverride();

    taskService.createTask({
      title: 'craftsman cli limit',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      workflow_override: {
        type: 'craftsman-ready',
        stages: [{
          id: 'develop',
          mode: 'execute',
          execution_kind: 'citizen_execute',
          allowed_actions: ['execute', 'dispatch_craftsman'],
          gate: { type: 'all_subtasks_done' },
        }],
      },
    });
    subtasks.insertSubtask({
      id: 'sub-codex-1',
      task_id: 'OC-306',
      stage_id: 'develop',
      title: 'run codex 1',
      assignee: 'sonnet',
      craftsman_type: 'codex',
    });
    subtasks.insertSubtask({
      id: 'sub-codex-2',
      task_id: 'OC-306',
      stage_id: 'develop',
      title: 'run codex 2',
      assignee: 'sonnet',
      craftsman_type: 'codex',
    });

    await program.parseAsync([
      'craftsman', 'dispatch',
      'OC-306',
      'sub-codex-1',
      '--caller-id', 'opus',
      '--adapter', 'codex',
      '--workdir', '/tmp/codex-1',
    ], { from: 'user' });

    await expect(program.parseAsync([
      'craftsman', 'dispatch',
      'OC-306',
      'sub-codex-2',
      '--caller-id', 'opus',
      '--adapter', 'codex',
      '--workdir', '/tmp/codex-2',
    ], { from: 'user' })).rejects.toThrow('craftsman concurrency limit exceeded: max 1 active executions');

    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('craftsman execution 已派发: exec-cli-limit-1');
  });

  it('creates and lists subtasks through the cli formal surface', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const dispatcher = new CraftsmanDispatcher(db, {
      executionIdGenerator: () => 'exec-cli-subtask-1',
      adapters: {
        codex: new StubCraftsmanAdapter('codex', () => '2026-03-13T11:00:00.000Z'),
      },
    });
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-307',
      craftsmanDispatcher: dispatcher,
    });
    const stdout = createBuffer();
    const stderr = createBuffer();
    const program = createCliProgram({ taskService, stdout, stderr }).exitOverride();
    const subtaskFile = makeWorkflowFile({
      subtasks: [
        {
          id: 'build-api',
          title: 'Build API',
          assignee: 'sonnet',
          execution_target: 'craftsman',
          craftsman: {
            adapter: 'codex',
            mode: 'one_shot',
            workdir: '/tmp/cli-subtask-build-api',
          },
        },
        {
          id: 'write-tests',
          title: 'Write tests',
          assignee: 'gpt52',
          execution_target: 'manual',
        },
      ],
    });

    taskService.createTask({
      title: 'formal cli subtasks',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      workflow_override: {
        type: 'custom',
        stages: [{
          id: 'develop',
          mode: 'execute',
          execution_kind: 'craftsman_dispatch',
          allowed_actions: ['execute', 'dispatch_craftsman'],
          gate: { type: 'all_subtasks_done' },
        }],
      },
    });

    await program.parseAsync([
      'subtasks',
      'create',
      'OC-307',
      '--caller-id',
      'opus',
      '--file',
      subtaskFile,
    ], { from: 'user' });
    await program.parseAsync(['subtasks', 'list', 'OC-307'], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('任务 OC-307 已创建 2 个 subtasks');
    expect(stdout.value).toContain('auto-dispatched executions: exec-cli-subtask-1');
    expect(stdout.value).toContain('build-api\tdevelop\tsonnet\tin_progress\tcodex');
    expect(stdout.value).toContain('write-tests\tdevelop\tgpt52\tpending\t-');
  });

  it('supports execution-scoped craftsman input commands through the cli', async () => {
    const stdout = createBuffer();
    const stderr = createBuffer();
    const calls: Array<{ kind: string; executionId: string; payload: unknown }> = [];
    const program = createCliProgram({
      stdout,
      stderr,
      taskService: {
        sendCraftsmanInputText: (executionId: string, text: string, submit = true) => {
          calls.push({ kind: 'text', executionId, payload: { text, submit } });
          return { executionId };
        },
        sendCraftsmanInputKeys: (executionId: string, keys: string[]) => {
          calls.push({ kind: 'keys', executionId, payload: keys });
          return { executionId };
        },
        submitCraftsmanChoice: (executionId: string, keys: string[]) => {
          calls.push({ kind: 'choice', executionId, payload: keys });
          return { executionId };
        },
      } as unknown as TaskService,
      tmuxRuntimeService: createTmuxRuntimeServiceStub(),
      dashboardQueryService: createDashboardQueryServiceStub(),
    }).exitOverride();

    await program.parseAsync(['craftsman', 'input-text', 'exec-123', 'Continue', '--no-submit'], { from: 'user' });
    await program.parseAsync(['craftsman', 'input-keys', 'exec-123', 'Down'], { from: 'user' });
    await program.parseAsync(['craftsman', 'submit-choice', 'exec-123', 'Down'], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(calls).toEqual([
      { kind: 'text', executionId: 'exec-123', payload: { text: 'Continue', submit: false } },
      { kind: 'keys', executionId: 'exec-123', payload: ['Down'] },
      { kind: 'choice', executionId: 'exec-123', payload: ['Down'] },
    ]);
    expect(stdout.value).toContain('craftsman input 已发送: exec-123');
    expect(stdout.value).toContain('craftsman keys 已发送: exec-123');
    expect(stdout.value).toContain('craftsman choice 已提交: exec-123');
  });

  it('supports execution-scoped craftsman probe through the cli', async () => {
    const stdout = createBuffer();
    const stderr = createBuffer();
    const calls: string[] = [];
    const program = createCliProgram({
      stdout,
      stderr,
      taskService: {
        probeCraftsmanExecution: (executionId: string) => {
          calls.push(executionId);
          return {
            execution: { execution_id: executionId, status: 'running' },
            probed: true,
          };
        },
      } as unknown as TaskService,
      tmuxRuntimeService: createTmuxRuntimeServiceStub(),
      dashboardQueryService: createDashboardQueryServiceStub(),
    }).exitOverride();

    await program.parseAsync(['craftsman', 'probe', 'exec-123'], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(calls).toEqual(['exec-123']);
    expect(stdout.value).toContain('craftsman probe 已执行: exec-123');
    expect(stdout.value).toContain('status: running');
  });

  it('supports execution-scoped craftsman tail through the cli', async () => {
    const stdout = createBuffer();
    const stderr = createBuffer();
    const calls: Array<{ executionId: string; lines: number }> = [];
    const program = createCliProgram({
      stdout,
      stderr,
      taskService: {
        getCraftsmanExecutionTail: (executionId: string, lines: number) => {
          calls.push({ executionId, lines });
          return {
            execution_id: executionId,
            available: true,
            output: 'recent tail output',
            source: 'tmux',
          };
        },
      } as unknown as TaskService,
      tmuxRuntimeService: createTmuxRuntimeServiceStub(),
      dashboardQueryService: createDashboardQueryServiceStub(),
    }).exitOverride();

    await program.parseAsync(['craftsman', 'tail', 'exec-123', '--lines', '55'], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(calls).toEqual([{ executionId: 'exec-123', lines: 55 }]);
    expect(stdout.value).toContain('recent tail output');
  });

  it('shows craftsman governance snapshot through the cli', async () => {
    const stdout = createBuffer();
    const stderr = createBuffer();
    const program = createCliProgram({
      stdout,
      stderr,
      taskService: {
        getCraftsmanGovernanceSnapshot: () => ({
          limits: {
            max_concurrent_running: 8,
            max_concurrent_per_agent: 3,
            host_memory_utilization_limit: 0.9,
            host_swap_utilization_limit: 0.9,
            host_load_per_cpu_limit: 1.5,
          },
          active_executions: 2,
          active_by_assignee: [{ assignee: 'opus', count: 2 }],
          warnings: [],
          active_execution_details: [],
          host_pressure_status: 'healthy',
          host: {
            observed_at: '2026-03-13T12:00:00.000Z',
            cpu_count: 8,
            load_1m: 4,
            memory_total_bytes: 100,
            memory_used_bytes: 50,
            memory_utilization: 0.5,
            swap_total_bytes: 10,
            swap_used_bytes: 1,
            swap_utilization: 0.1,
          },
        }),
      } as unknown as TaskService,
      tmuxRuntimeService: createTmuxRuntimeServiceStub(),
      dashboardQueryService: createDashboardQueryServiceStub(),
    }).exitOverride();

    await program.parseAsync(['craftsman', 'governance'], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('active executions: 2');
    expect(stdout.value).toContain('opus\t2');
  });

  it('supports craftsman observation through the cli', async () => {
    const stdout = createBuffer();
    const stderr = createBuffer();
    const calls: Array<{ runningAfterMs: number; waitingAfterMs: number }> = [];
    const program = createCliProgram({
      stdout,
      stderr,
      taskService: {
        observeCraftsmanExecutions: (input: { runningAfterMs: number; waitingAfterMs: number }) => {
          calls.push(input);
          return { scanned: 2, probed: 1, progressed: 1 };
        },
      } as unknown as TaskService,
      tmuxRuntimeService: createTmuxRuntimeServiceStub(),
      dashboardQueryService: createDashboardQueryServiceStub(),
    }).exitOverride();

    await program.parseAsync(['craftsman', 'observe', '--running-after-ms', '60000', '--waiting-after-ms', '15000'], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(calls).toEqual([{ runningAfterMs: 60000, waitingAfterMs: 15000 }]);
    expect(stdout.value).toContain('"probed": 1');
  });
});
