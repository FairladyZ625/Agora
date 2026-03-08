import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createAgoraDatabase,
  runMigrations,
  ArchiveJobRepository,
  SubtaskRepository,
  TaskRepository,
  TodoRepository,
} from '@agora-ts/db';
import { DashboardQueryService, TaskService } from '@agora-ts/core';
import { buildApp } from './app.js';

const tempPaths: string[] = [];
const templatesDir = resolve(process.cwd(), '../agora/templates');

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-dashboard-server-'));
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

describe('dashboard routes', () => {
  it('serves agents status, archive jobs, todos, and templates', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-500',
    });
    const dashboardQueries = new DashboardQueryService(db, { templatesDir });
    const subtasks = new SubtaskRepository(db);
    const archives = new ArchiveJobRepository(db);
    const todos = new TodoRepository(db);

    taskService.createTask({
      title: 'dashboard status',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'high',
    });
    subtasks.insertSubtask({
      id: 'api',
      task_id: 'OC-500',
      stage_id: 'discuss',
      title: 'API',
      assignee: 'sonnet',
      craftsman_type: 'codex',
      dispatch_status: 'success',
      dispatched_at: '2026-03-08T10:00:00Z',
    });
    archives.insertArchiveJob({
      task_id: 'OC-500',
      status: 'failed',
      target_path: 'ZeYu-AI-Brain/docs/',
      payload: { error_message: 'timeout' },
      writer_agent: 'writer-agent',
    });
    todos.insertTodo({ text: '补 dashboard todo', due: '2026-03-10', tags: ['dashboard'] });

    const app = buildApp({ taskService, dashboardQueryService: dashboardQueries });

    const agents = await app.inject({ method: 'GET', url: '/api/agents/status' });
    const archive = await app.inject({ method: 'GET', url: '/api/archive/jobs' });
    const todosList = await app.inject({ method: 'GET', url: '/api/todos' });
    const templates = await app.inject({ method: 'GET', url: '/api/templates' });
    const templateDetail = await app.inject({ method: 'GET', url: '/api/templates/coding' });

    expect(agents.statusCode).toBe(200);
    expect(agents.json().summary.active_tasks).toBe(1);
    expect(archive.statusCode).toBe(200);
    expect(archive.json()).toHaveLength(1);
    expect(todosList.statusCode).toBe(200);
    expect(todosList.json()).toHaveLength(1);
    expect(templates.statusCode).toBe(200);
    expect(templates.json().some((item: { id: string }) => item.id === 'coding')).toBe(true);
    expect(templateDetail.statusCode).toBe(200);
    expect(templateDetail.json()).toMatchObject({ type: 'coding' });
  });

  it('supports todo CRUD, promote, and archive retry routes', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-501',
    });
    const dashboardQueries = new DashboardQueryService(db, { templatesDir });
    const tasks = new TaskRepository(db);
    const archives = new ArchiveJobRepository(db);

    tasks.insertTask({
      id: 'OC-OLD',
      title: '旧归档任务',
      description: '',
      type: 'document',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: { stages: [] },
    });
    const archiveJob = archives.insertArchiveJob({
      task_id: 'OC-OLD',
      status: 'failed',
      target_path: 'ZeYu-AI-Brain/docs/',
      payload: { error_message: 'timeout' },
      writer_agent: 'writer-agent',
    });

    const app = buildApp({ taskService, dashboardQueryService: dashboardQueries });

    const createTodo = await app.inject({
      method: 'POST',
      url: '/api/todos',
      payload: { text: '升级成任务', due: '2026-03-09', tags: ['triage'] },
    });
    const createdTodo = createTodo.json();
    const patchTodo = await app.inject({
      method: 'PATCH',
      url: `/api/todos/${createdTodo.id}`,
      payload: { text: '升级成正式任务', status: 'done' },
    });
    const promoteTodo = await app.inject({
      method: 'POST',
      url: `/api/todos/${createdTodo.id}/promote`,
      payload: { type: 'quick', creator: 'archon', priority: 'high' },
    });
    const retryArchive = await app.inject({
      method: 'POST',
      url: `/api/archive/jobs/${archiveJob.id}/retry`,
      payload: { reason: 'manual retry' },
    });
    const deleteTodo = await app.inject({
      method: 'DELETE',
      url: `/api/todos/${createdTodo.id}`,
    });

    expect(createTodo.statusCode).toBe(200);
    expect(patchTodo.statusCode).toBe(200);
    expect(patchTodo.json()).toMatchObject({ status: 'done', text: '升级成正式任务' });
    expect(promoteTodo.statusCode).toBe(200);
    expect(promoteTodo.json()).toMatchObject({
      todo: { promoted_to: 'OC-501' },
      task: { id: 'OC-501', title: '升级成正式任务' },
    });
    expect(retryArchive.statusCode).toBe(200);
    expect(retryArchive.json()).toMatchObject({ status: 'pending' });
    expect(deleteTodo.statusCode).toBe(200);
  });
});
