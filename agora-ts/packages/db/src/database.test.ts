import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgoraDatabase, listAppliedMigrations, runMigrations } from './database.js';
import { ArchiveJobRepository } from './repositories/archive-job.repository.js';
import { TaskRepository } from './repositories/task.repository.js';
import { TodoRepository } from './repositories/todo.repository.js';

const tempPaths: string[] = [];

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-db-'));
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

describe('agora-ts sqlite bootstrap', () => {
  it('runs the initial migration and records it', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });

    runMigrations(db);

    expect(listAppliedMigrations(db)).toEqual(['001_initial.sql', '002_inbox.sql', '003_craftsman_executions.sql', '004_context_bindings.sql']);
    const taskTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tasks'")
      .get() as { name: string } | undefined;
    expect(taskTable?.name).toBe('tasks');
  });

  it('stores and reads task JSON fields via the task repository', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const tasks = new TaskRepository(db);

    tasks.insertTask({
      id: 'OC-001',
      title: '迁移 task repository',
      description: '把 Python 版 task row 语义迁到 TS。',
      type: 'coding',
      priority: 'high',
      creator: 'archon',
      team: {
        members: [{ role: 'architect', agentId: 'opus', model_preference: 'strong_reasoning' }],
      },
      workflow: {
        type: 'discuss-execute-review',
        stages: [{ id: 'discuss', gate: { type: 'archon_review' } }],
      },
    });

    const task = tasks.getTask('OC-001');

    expect(task?.id).toBe('OC-001');
    expect(task?.state).toBe('draft');
    expect(task?.team.members[0]?.agentId).toBe('opus');
    expect(task?.workflow.stages?.[0]?.id).toBe('discuss');
  });

  it('supports todo CRUD and tag deserialization', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const todos = new TodoRepository(db);

    const created = todos.insertTodo({
      text: '补 ts lint',
      due: '2026-03-12',
      tags: ['typescript', 'governance'],
    });
    const updated = todos.updateTodo(created.id, {
      status: 'done',
      completed_at: '2026-03-08T00:00:00Z',
    });
    const listed = todos.listTodos();
    const deleted = todos.deleteTodo(created.id);

    expect(created.tags).toEqual(['typescript', 'governance']);
    expect(updated.status).toBe('done');
    expect(listed).toHaveLength(1);
    expect(deleted).toBe(true);
    expect(todos.listTodos()).toEqual([]);
  });

  it('joins archive jobs with task metadata and parses payloads', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const tasks = new TaskRepository(db);
    const archives = new ArchiveJobRepository(db);

    tasks.insertTask({
      id: 'OC-002',
      title: '归档日报',
      description: '',
      type: 'document',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: { stages: [] },
    });

    const job = archives.insertArchiveJob({
      task_id: 'OC-002',
      status: 'failed',
      target_path: 'ZeYu-AI-Brain/docs/',
      payload: { error_message: 'timeout' },
      writer_agent: 'writer-agent',
    });
    const fetched = archives.getArchiveJob(job.id);

    expect(fetched?.task_title).toBe('归档日报');
    expect(fetched?.payload).toEqual({ error_message: 'timeout' });
    expect(archives.listArchiveJobs()[0]?.task_type).toBe('document');
  });

  it('updates archive job status with commit hash and error payloads', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const tasks = new TaskRepository(db);
    const archives = new ArchiveJobRepository(db);

    tasks.insertTask({
      id: 'OC-003',
      title: '归档状态更新',
      description: '',
      type: 'document',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: { stages: [] },
    });

    const job = archives.insertArchiveJob({
      task_id: 'OC-003',
      status: 'pending',
      target_path: 'ZeYu-AI-Brain/docs/',
      payload: {},
      writer_agent: 'writer-agent',
    });
    const notified = archives.updateArchiveJob(job.id, { status: 'notified' });
    const failed = archives.updateArchiveJob(job.id, { status: 'failed', error_message: 'writer timeout' });
    const synced = archives.updateArchiveJob(job.id, { status: 'synced', commit_hash: 'abc123' });

    expect(notified.status).toBe('notified');
    expect(notified.completed_at).toBeNull();
    expect(failed).toMatchObject({
      status: 'failed',
      completed_at: expect.any(String),
      payload: { error_message: 'writer timeout' },
    });
    expect(synced).toMatchObject({
      status: 'synced',
      commit_hash: 'abc123',
      completed_at: expect.any(String),
    });
  });

  it('merges additional payload metadata while updating archive jobs', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const tasks = new TaskRepository(db);
    const archives = new ArchiveJobRepository(db);

    tasks.insertTask({
      id: 'OC-005',
      title: '归档通知元数据',
      description: '',
      type: 'document',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: { stages: [] },
    });

    const job = archives.insertArchiveJob({
      task_id: 'OC-005',
      status: 'pending',
      target_path: 'ZeYu-AI-Brain/docs/',
      payload: { task_id: 'OC-005' },
      writer_agent: 'writer-agent',
    });
    const notified = archives.updateArchiveJob(job.id, {
      status: 'notified',
      payload_patch: {
        notification_receipt: {
          notification_id: 'archive-job-5',
          outbox_path: '/tmp/archive-job-5.json',
        },
      },
    });

    expect(notified).toMatchObject({
      status: 'notified',
      payload: {
        task_id: 'OC-005',
        notified_at: expect.any(String),
        notification_receipt: {
          notification_id: 'archive-job-5',
          outbox_path: '/tmp/archive-job-5.json',
        },
      },
    });
  });

  it('marks stale notified archive jobs as failed during a timeout scan', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const tasks = new TaskRepository(db);
    const archives = new ArchiveJobRepository(db);

    tasks.insertTask({
      id: 'OC-004',
      title: '归档超时扫描',
      description: '',
      type: 'document',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: { stages: [] },
    });

    const job = archives.insertArchiveJob({
      task_id: 'OC-004',
      status: 'pending',
      target_path: 'ZeYu-AI-Brain/docs/',
      payload: {},
      writer_agent: 'writer-agent',
    });
    archives.updateArchiveJob(job.id, { status: 'notified' });

    const failed = archives.failStaleNotifiedJobs({
      timeoutMs: 1,
      now: new Date(Date.now() + 10),
    });
    const fetched = archives.getArchiveJob(job.id);

    expect(failed).toBe(1);
    expect(fetched).toMatchObject({
      status: 'failed',
      completed_at: expect.any(String),
      payload: expect.objectContaining({
        error_message: 'archive notify timeout',
        notified_at: expect.any(String),
      }),
    });
  });
});
