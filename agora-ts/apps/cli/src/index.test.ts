import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArchiveJobRepository, createAgoraDatabase, runMigrations, SubtaskRepository, TaskRepository, type AgoraDatabase } from '@agora-ts/db';
import { CraftsmanDispatcher, DashboardQueryService, HumanAccountService, RolePackService, StubCraftsmanAdapter, StubIMProvisioningPort, TaskConversationService, TaskContextBindingService, TaskService, TemplateAuthoringService } from '@agora-ts/core';
import { createCliProgram, isCliEntrypoint } from './index.js';
import type { DashboardSessionClient } from './dashboard-session-client.js';

const tempPaths: string[] = [];
const templatesDir = resolve(process.cwd(), 'templates');
const rolePackDir = resolve(process.cwd(), 'role-packs', 'agora-default');
const agoraProjectRoot = resolve(import.meta.dirname, '../../../../');

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
    listArchiveJobs: () => [],
    getArchiveJob: () => { throw new Error('unused'); },
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

  it('renders redirect help for agora tmux --help', async () => {
    const stdout = createBuffer();
    const stderr = createBuffer();
    const program = createCliProgram({
      configPath: '/definitely/missing/agora.json',
      stdout,
      stderr,
    }).exitOverride();

    try {
      await program.parseAsync(['tmux', '--help'], { from: 'user' });
    } catch {
      // Commander may surface help as an exit signal.
    }

    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('Moved to: agora craftsman tmux');
    expect(stdout.value).toContain('agora craftsman tmux status');
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
      status: 'pending',
      target_path: 'ZeYu-AI-Brain/tasks/',
      payload: {},
      writer_agent: 'writer-agent',
    });
    expect(job).toBeDefined();

    await program.parseAsync(['archive', 'jobs', 'list'], { from: 'user' });
    await program.parseAsync(['archive', 'jobs', 'show', String(job?.id), '--json'], { from: 'user' });
    await program.parseAsync(['archive', 'jobs', 'complete', String(job?.id), '--commit-hash', 'deadbeef'], { from: 'user' });
    await program.parseAsync(['archive', 'jobs', 'retry', String(job?.id)], { from: 'user' });
    await program.parseAsync(['archive', 'jobs', 'fail', String(job?.id), '--error-message', 'writer timeout'], { from: 'user' });

    const finalJob = dashboardQueryService.getArchiveJob(job!.id);
    expect(stderr.value).toBe('');
    expect(stdout.value).toContain(`\t${task.id}\tpending\t`);
    expect(stdout.value).toContain(`"task_id": "${task.id}"`);
    expect(stdout.value).toContain(`archive job 已完成: ${job?.id} -> synced`);
    expect(stdout.value).toContain(`archive job 已重置: ${job?.id} -> pending`);
    expect(stdout.value).toContain(`archive job 已失败: ${job?.id} -> failed`);
    expect(finalJob.status).toBe('failed');
    expect(finalJob.payload).toMatchObject({ error_message: 'writer timeout' });
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
    tasks.updateTask('OC-302', 3, { state: 'blocked' });
    db.prepare('INSERT INTO stage_history (task_id, stage_id) VALUES (?, ?)').run('OC-302', 'vote');

    await program.parseAsync(['confirm', 'OC-302', '--voter-id', 'opus', '--vote', 'approve', '--comment', 'first'], { from: 'user' });
    await program.parseAsync(['confirm', 'OC-302', '--voter-id', 'gpt52', '--vote', 'approve', '--comment', 'second'], { from: 'user' });
    await program.parseAsync(['unblock', 'OC-302', '--reason', 'dependency cleared'], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('当前票数: approved=1 total=1');
    expect(stdout.value).toContain('当前票数: approved=2 total=2');
    expect(stdout.value).toContain('已解除阻塞');
  });

  it('runs dashboard session commands through the cli', async () => {
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

  it('runs local dev stack through the start command and run alias', async () => {
    const stdout = createBuffer();
    const stderr = createBuffer();
    const startCommandRunner = vi.fn().mockResolvedValue(undefined);
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
      startCommandCwd: agoraProjectRoot,
      startCommandFallbackRoot: agoraProjectRoot,
      stdout,
      stderr,
    }).exitOverride();

    await program.parseAsync(['start'], { from: 'user' });
    await program.parseAsync(['run'], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(startCommandRunner).toHaveBeenCalledTimes(2);
    expect(startCommandRunner.mock.calls[0]?.[0]?.args?.[0]).toContain('docs/02-PRODUCT/scripts/dev-start.sh');
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

  it('supports tmux runtime management commands through the cli', async () => {
    const stdout = createBuffer();
    const stderr = createBuffer();
    const tmuxRuntimeService = {
      up: () => ({
        session: 'agora-craftsmen',
        panes: [{
          id: '%0',
          title: 'codex',
          currentCommand: 'bash',
          active: true,
          continuityBackend: 'codex_session_file' as const,
          resumeCapability: 'native_resume' as const,
          sessionReference: 'codex-session-123',
          identitySource: 'session_file' as const,
          identityPath: '/tmp/codex/session.json',
          sessionObservedAt: '2026-03-08T23:01:00.000Z',
          workspaceRoot: '/tmp/codex',
          lastRecoveryMode: 'resume_exact' as const,
          transportSessionId: 'tmux:agora-craftsmen:codex',
        }],
      }),
      status: () => ({
        session: 'agora-craftsmen',
        panes: [{
          id: '%0',
          title: 'codex',
          currentCommand: 'bash',
          active: true,
          continuityBackend: 'codex_session_file' as const,
          resumeCapability: 'native_resume' as const,
          sessionReference: 'codex-session-123',
          identitySource: 'session_file' as const,
          identityPath: '/tmp/codex/session.json',
          sessionObservedAt: '2026-03-08T23:01:00.000Z',
          workspaceRoot: '/tmp/codex',
          lastRecoveryMode: 'resume_exact' as const,
          transportSessionId: 'tmux:agora-craftsmen:codex',
        }],
      }),
      send: () => {},
      sendText: () => {},
      sendKeys: () => {},
      submitChoice: () => {},
      recordIdentity: () => ({
        continuityBackend: 'codex_session_file' as const,
        resumeCapability: 'native_resume' as const,
        sessionReference: 'codex-session-456',
        identitySource: 'hook_event' as const,
        identityPath: null,
        sessionObservedAt: '2026-03-08T23:02:00.000Z',
        workspaceRoot: '/tmp/codex',
        lastRecoveryMode: 'resume_exact' as const,
        transportSessionId: 'tmux:agora-craftsmen:codex',
      }),
      start: () => ({
        pane: '%0',
        command: 'codex -a never',
        recoveryMode: 'fresh_start' as const,
      }),
      resume: () => ({
        pane: '%0',
        command: 'codex resume -a never codex-session-123',
        recoveryMode: 'resume_exact' as const,
      }),
      task: () => ({
        status: 'running' as const,
        session_id: 'tmux:agora-craftsmen:codex',
        started_at: '2026-03-08T22:00:00.000Z',
      }),
      tail: () => 'tail output',
      doctor: () => ({
        session: 'agora-craftsmen',
        panes: [{
          agent: 'codex',
          pane: '%0',
          command: 'bash',
          active: true,
          ready: true,
          continuityBackend: 'codex_session_file' as const,
          resumeCapability: 'native_resume' as const,
          sessionReference: 'codex-session-123',
          identitySource: 'session_file' as const,
          identityPath: '/tmp/codex/session.json',
          sessionObservedAt: '2026-03-08T23:01:00.000Z',
          workspaceRoot: '/tmp/codex',
          lastRecoveryMode: 'resume_exact' as const,
          transportSessionId: 'tmux:agora-craftsmen:codex',
        }],
      }),
      down: () => {},
    };
    const program = createCliProgram({
      stdout,
      stderr,
      tmuxRuntimeService,
      dashboardQueryService: createDashboardQueryServiceStub(),
    }).exitOverride();

    await program.parseAsync(['craftsman', 'tmux', 'up'], { from: 'user' });
    await program.parseAsync(['craftsman', 'tmux', 'status'], { from: 'user' });
    await program.parseAsync(['craftsman', 'tmux', 'send', 'codex', 'echo hello'], { from: 'user' });
    await program.parseAsync(['craftsman', 'tmux', 'start', 'codex'], { from: 'user' });
    await program.parseAsync(['craftsman', 'tmux', 'resume', 'codex', 'codex-session-123'], { from: 'user' });
    await program.parseAsync(['craftsman', 'runtime', 'identity', 'codex', '--identity-source', 'hook_event', '--session-reference', 'codex-session-456', '--workspace-root', '/tmp/codex'], { from: 'user' });
    await program.parseAsync(['craftsman', 'tmux', 'task', 'codex', 'Implement this'], { from: 'user' });
    await program.parseAsync(['craftsman', 'tmux', 'tail', 'codex', '--lines', '20'], { from: 'user' });
    await program.parseAsync(['craftsman', 'tmux', 'doctor'], { from: 'user' });
    await program.parseAsync(['craftsman', 'tmux', 'down'], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('tmux session 已就绪: agora-craftsmen');
    expect(stdout.value).toContain('%0\tcodex\tbash\tactive\tcodex_session_file\tsession_file\tcodex-session-123\t/tmp/codex/session.json\t2026-03-08T23:01:00.000Z');
    expect(stdout.value).toContain('tmux command 已发送: codex');
    expect(stdout.value).toContain('tmux runtime 已启动: codex');
    expect(stdout.value).toContain('command: codex -a never');
    expect(stdout.value).toContain('tmux runtime 已恢复: codex');
    expect(stdout.value).toContain('command: codex resume -a never codex-session-123');
    expect(stdout.value).toContain('runtime identity 已回填: codex');
    expect(stdout.value).toContain('source: hook_event');
    expect(stdout.value).toContain('session: codex-session-456');
    expect(stdout.value).toContain('tmux task 已派发: tmux:agora-craftsmen:codex');
    expect(stdout.value).toContain('tail output');
    expect(stdout.value).toContain('codex\t%0\tbash\tready\tcodex_session_file\tsession_file\tcodex-session-123\t/tmp/codex/session.json\t2026-03-08T23:01:00.000Z');
    expect(stdout.value).toContain('tmux session 已关闭: agora-craftsmen');
  });

  it('supports tmux structured input commands through the cli', async () => {
    const stdout = createBuffer();
    const stderr = createBuffer();
    const calls: Array<{ kind: string; agent: string; payload: unknown }> = [];
    const tmuxRuntimeService = {
      ...createTmuxRuntimeServiceStub(),
      sendText: (agent: string, text: string, submit = true) => {
        calls.push({ kind: 'text', agent, payload: { text, submit } });
      },
      sendKeys: (agent: string, keys: string[]) => {
        calls.push({ kind: 'keys', agent, payload: keys });
      },
      submitChoice: (agent: string, keys: string[]) => {
        calls.push({ kind: 'choice', agent, payload: keys });
      },
    };
    const program = createCliProgram({
      stdout,
      stderr,
      tmuxRuntimeService,
      dashboardQueryService: createDashboardQueryServiceStub(),
    }).exitOverride();

    await program.parseAsync(['craftsman', 'tmux', 'send-text', 'codex', 'Need approval', '--no-submit'], { from: 'user' });
    await program.parseAsync(['craftsman', 'tmux', 'send-keys', 'codex', 'Down', 'Tab'], { from: 'user' });
    await program.parseAsync(['craftsman', 'tmux', 'submit-choice', 'codex', 'Down'], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(calls).toEqual([
      { kind: 'text', agent: 'codex', payload: { text: 'Need approval', submit: false } },
      { kind: 'keys', agent: 'codex', payload: ['Down', 'Tab'] },
      { kind: 'choice', agent: 'codex', payload: ['Down'] },
    ]);
    expect(stdout.value).toContain('tmux text 已发送: codex');
    expect(stdout.value).toContain('tmux keys 已发送: codex');
    expect(stdout.value).toContain('tmux choice 已提交: codex');
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
