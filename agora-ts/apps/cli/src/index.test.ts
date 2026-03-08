import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgoraDatabase, runMigrations, SubtaskRepository, TaskRepository } from '@agora-ts/db';
import { TaskService } from '@agora-ts/core';
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
});
