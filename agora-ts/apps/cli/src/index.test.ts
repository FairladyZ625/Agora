import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgoraDatabase, runMigrations, SubtaskRepository, TaskRepository } from '@agora-ts/db';
import { CraftsmanDispatcher, StubCraftsmanAdapter, TaskService } from '@agora-ts/core';
import { createCliProgram } from './index.js';

const tempPaths: string[] = [];
const templatesDir = resolve(process.cwd(), '../agora/templates');

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

describe('agora-ts cli', () => {
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

  it('runs task action commands through the cli', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-301',
    });
    const subtasks = new SubtaskRepository(db);
    const stdout = createBuffer();
    const stderr = createBuffer();
    const program = createCliProgram({ taskService, stdout, stderr }).exitOverride();

    await program.parseAsync(['create', '实现 CLI actions', '--type', 'document'], { from: 'user' });
    await program.parseAsync(['archon-approve', 'OC-301', '--reviewer-id', 'lizeyu', '--comment', 'ok'], { from: 'user' });
    await program.parseAsync(['force-advance', 'OC-301', '--reason', 'move to write'], { from: 'user' });

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
    await program.parseAsync(['pause', 'OC-301', '--reason', 'hold'], { from: 'user' });
    await program.parseAsync(['resume', 'OC-301'], { from: 'user' });
    await program.parseAsync(['cancel', 'OC-301', '--reason', 'closed'], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('已 Archon 审批通过');
    expect(stdout.value).toContain('已强制推进到阶段: write');
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
          lastRecoveryMode: 'resume_exact' as const,
          transportSessionId: 'tmux:agora-craftsmen:codex',
        }],
      }),
      send: () => {},
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
    await program.parseAsync(['craftsman', 'tmux', 'task', 'codex', 'Implement this'], { from: 'user' });
    await program.parseAsync(['craftsman', 'tmux', 'tail', 'codex', '--lines', '20'], { from: 'user' });
    await program.parseAsync(['craftsman', 'tmux', 'doctor'], { from: 'user' });
    await program.parseAsync(['craftsman', 'tmux', 'down'], { from: 'user' });

    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('tmux session 已就绪: agora-craftsmen');
    expect(stdout.value).toContain('%0\tcodex\tbash\tactive');
    expect(stdout.value).toContain('tmux command 已发送: codex');
    expect(stdout.value).toContain('tmux task 已派发: tmux:agora-craftsmen:codex');
    expect(stdout.value).toContain('tail output');
    expect(stdout.value).toContain('codex\t%0\tbash\tready');
    expect(stdout.value).toContain('tmux session 已关闭: agora-craftsmen');
  });
});
