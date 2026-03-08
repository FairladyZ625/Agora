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
import { DashboardQueryService, LiveSessionStore, TaskService } from '@agora-ts/core';
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
    expect(agents.json().tmux_runtime).toBeNull();
    expect(agents.json().provider_summaries).toEqual([
      expect.objectContaining({
        provider: 'openclaw',
        total_agents: expect.any(Number),
        overall_presence: 'online',
        signal_status: expect.any(String),
      }),
    ]);
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

  it('returns 400 for malformed todo payloads and invalid numeric ids', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-502',
    });
    const dashboardQueries = new DashboardQueryService(db, { templatesDir });
    const app = buildApp({ taskService, dashboardQueryService: dashboardQueries });

    const badCreateTodo = await app.inject({
      method: 'POST',
      url: '/api/todos',
      payload: {},
    });
    const badPatchTodo = await app.inject({
      method: 'PATCH',
      url: '/api/todos/not-a-number',
      payload: { status: 'done' },
    });
    const badPromoteTodo = await app.inject({
      method: 'POST',
      url: '/api/todos/not-a-number/promote',
      payload: { type: 'quick', creator: 'archon', priority: 'high' },
    });
    const badArchiveJob = await app.inject({
      method: 'GET',
      url: '/api/archive/jobs/not-a-number',
    });

    expect(badCreateTodo.statusCode).toBe(400);
    expect(badPatchTodo.statusCode).toBe(400);
    expect(badPromoteTodo.statusCode).toBe(400);
    expect(badArchiveJob.statusCode).toBe(400);
  });

  it('ingests live openclaw sessions and exposes them through dashboard status routes', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const liveSessions = new LiveSessionStore({
      staleAfterMs: 60_000,
      now: () => new Date('2026-03-08T07:00:30.000Z'),
    });
    const dashboardQueries = new DashboardQueryService(db, { templatesDir, liveSessions });
    const app = buildApp({ dashboardQueryService: dashboardQueries, liveSessionStore: liveSessions });

    const ingest = await app.inject({
      method: 'POST',
      url: '/api/live/openclaw/sessions',
      payload: {
        source: 'openclaw',
        agent_id: 'ops',
        session_key: 'agent:ops:discord:channel:alerts',
        channel: 'discord',
        conversation_id: 'alerts',
        thread_id: '42',
        status: 'active',
        last_event: 'session_start',
        last_event_at: '2026-03-08T07:00:00.000Z',
        metadata: { trigger: 'user' },
      },
    });
    const listed = await app.inject({
      method: 'GET',
      url: '/api/live/openclaw/sessions',
    });
    const agents = await app.inject({
      method: 'GET',
      url: '/api/agents/status',
    });

    expect(ingest.statusCode).toBe(200);
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toMatchObject([
      expect.objectContaining({
        session_key: 'agent:ops:discord:channel:alerts',
        status: 'active',
      }),
    ]);
    expect(agents.statusCode).toBe(200);
    expect(agents.json().agents).toMatchObject([
      expect.objectContaining({
        id: 'ops',
        status: 'busy',
      }),
    ]);
  });

  it('supports manual cleanup of stale live sessions', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const liveSessions = new LiveSessionStore({
      staleAfterMs: 60_000,
      now: () => new Date('2026-03-08T07:02:00.000Z'),
    });
    const dashboardQueries = new DashboardQueryService(db, { templatesDir, liveSessions });
    const app = buildApp({ dashboardQueryService: dashboardQueries, liveSessionStore: liveSessions });

    await app.inject({
      method: 'POST',
      url: '/api/live/openclaw/sessions',
      payload: {
        source: 'openclaw',
        agent_id: 'ops',
        session_key: 'agent:ops:discord:channel:alerts',
        channel: 'discord',
        conversation_id: 'alerts',
        thread_id: null,
        status: 'active',
        last_event: 'session_start',
        last_event_at: '2026-03-08T07:00:00.000Z',
        metadata: {},
      },
    });

    const cleanup = await app.inject({
      method: 'POST',
      url: '/api/live/openclaw/sessions/cleanup',
    });
    const listed = await app.inject({
      method: 'GET',
      url: '/api/live/openclaw/sessions',
    });

    expect(cleanup.statusCode).toBe(200);
    expect(cleanup.json()).toEqual({ cleaned: 1 });
    expect(listed.json()).toMatchObject([
      expect.objectContaining({
        session_key: 'agent:ops:discord:channel:alerts',
        status: 'closed',
        last_event: 'stale_timeout',
      }),
    ]);
  });
});
