import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAgoraDatabase, runMigrations, SubtaskRepository, TaskRepository } from '@agora-ts/db';
import { CraftsmanDispatcher, HumanAccountService, StubCraftsmanAdapter, TaskConversationService, TaskContextBindingService, TaskService } from '@agora-ts/core';
import { createCliProgram, isCliEntrypoint } from './index.js';
import type { DashboardSessionClient } from './dashboard-session-client.js';

const tempPaths: string[] = [];
const templatesDir = resolve(process.cwd(), 'templates');

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-cli-'));
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

describe('agora-ts cli', () => {
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
        { role: 'architect', agentId: 'opus', model_preference: 'strong_reasoning' },
        { role: 'developer', agentId: 'codex', model_preference: 'fast_coding' },
      ],
    });
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
    await program.parseAsync(['create', '实现 CLI states', '--type', 'document'], { from: 'user' });
    await program.parseAsync(['pause', 'OC-302', '--reason', 'hold'], { from: 'user' });
    await program.parseAsync(['resume', 'OC-302'], { from: 'user' });
    await program.parseAsync(['cancel', 'OC-302', '--reason', 'closed'], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('已 Archon 审批通过');
    expect(stdout.value).toContain('子任务 write-doc 已完成');
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
      tmuxRuntimeService: {
        up: () => { throw new Error('unused'); },
        status: () => { throw new Error('unused'); },
        send: () => { throw new Error('unused'); },
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
      tmuxRuntimeService: {
        up: () => { throw new Error('unused'); },
        status: () => { throw new Error('unused'); },
        send: () => { throw new Error('unused'); },
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
      tmuxRuntimeService: {
        up: () => { throw new Error('unused'); },
        status: () => { throw new Error('unused'); },
        send: () => { throw new Error('unused'); },
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
          status: 'not_started',
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
          status: 'not_started',
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

    await program.parseAsync(['create', '实现 craftsmen cli', '--type', 'coding'], { from: 'user' });
    subtasks.insertSubtask({
      id: 'sub-codex',
      task_id: 'OC-304',
      stage_id: 'discuss',
      title: 'run codex',
      assignee: 'sonnet',
      craftsman_type: 'codex',
    });

    await program.parseAsync([
      'craftsman', 'dispatch',
      'OC-304',
      'sub-codex',
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

    await program.parseAsync(['create', 'craftsman cli limit', '--type', 'coding'], { from: 'user' });
    subtasks.insertSubtask({
      id: 'sub-codex-1',
      task_id: 'OC-306',
      stage_id: 'discuss',
      title: 'run codex 1',
      assignee: 'sonnet',
      craftsman_type: 'codex',
    });
    subtasks.insertSubtask({
      id: 'sub-codex-2',
      task_id: 'OC-306',
      stage_id: 'discuss',
      title: 'run codex 2',
      assignee: 'sonnet',
      craftsman_type: 'codex',
    });

    await program.parseAsync([
      'craftsman', 'dispatch',
      'OC-306',
      'sub-codex-1',
      '--adapter', 'codex',
      '--workdir', '/tmp/codex-1',
    ], { from: 'user' });

    await expect(program.parseAsync([
      'craftsman', 'dispatch',
      'OC-306',
      'sub-codex-2',
      '--adapter', 'codex',
      '--workdir', '/tmp/codex-2',
    ], { from: 'user' })).rejects.toThrow('craftsman concurrency limit exceeded: max 1 active executions');

    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('craftsman execution 已派发: exec-cli-limit-1');
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
});
