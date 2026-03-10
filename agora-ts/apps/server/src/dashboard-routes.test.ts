import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createAgoraDatabase,
  runMigrations,
  ArchiveJobRepository,
  CraftsmanExecutionRepository,
  SubtaskRepository,
  TaskRepository,
  TodoRepository,
} from '@agora-ts/db';
import { DashboardQueryService, FileArchiveJobNotifier, FileArchiveJobReceiptIngestor, LiveSessionStore, TaskContextBindingService, TaskParticipationService, TaskService } from '@agora-ts/core';
import { buildApp } from './app.js';
import type { AgentInventorySource, PresenceSource } from '@agora-ts/core';

const tempPaths: string[] = [];
const templatesDir = resolve(process.cwd(), 'templates');

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
    const executions = new CraftsmanExecutionRepository(db);
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
    executions.insertExecution({
      execution_id: 'exec-route-dashboard-1',
      task_id: 'OC-500',
      subtask_id: 'api',
      adapter: 'codex',
      mode: 'task',
      session_id: 'tmux:agora-craftsmen:codex',
      status: 'running',
      callback_payload: {
        runtime_mode: 'tmux',
        transport: 'tmux-pane',
      },
      started_at: '2026-03-08T10:00:00.000Z',
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
    expect(agents.json().craftsmen[0].recent_executions[0]).toMatchObject({
      execution_id: 'exec-route-dashboard-1',
      transport: 'tmux-pane',
    });
    expect(agents.json().channel_summaries).toEqual([]);
    expect(agents.json().host_summaries).toEqual([]);
    expect(archive.statusCode).toBe(200);
    expect(archive.json()).toHaveLength(1);
    expect(todosList.statusCode).toBe(200);
    expect(todosList.json()).toHaveLength(1);
    expect(templates.statusCode).toBe(200);
    expect(templates.json().some((item: { id: string }) => item.id === 'coding')).toBe(true);
    expect(templateDetail.statusCode).toBe(200);
    expect(templateDetail.json()).toMatchObject({ type: 'coding' });
  });

  it('serves slim agent status and channel detail separately', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const agentRegistry: AgentInventorySource = {
      listAgents: () => [
        {
          id: 'main',
          host_framework: 'openclaw',
          channel_providers: ['discord'],
          inventory_sources: ['discord', 'openclaw'],
          primary_model: 'openai-codex/gpt-5.3-codex',
          workspace_dir: '/tmp/main',
        },
      ],
    };
    const presenceSource: PresenceSource = {
      listPresence: () => [
        {
          agent_id: 'main',
          presence: 'online',
          provider: 'discord',
          account_id: 'main',
          last_seen_at: '2026-03-08T07:30:25.241Z',
          reason: 'provider_start',
        },
      ],
      listHistory: () => [
        {
          occurred_at: '2026-03-08T07:30:25.241Z',
          agent_id: 'main',
          account_id: 'main',
          presence: 'online',
          reason: 'provider_start',
        },
      ],
      listSignals: () => [
        {
          occurred_at: '2026-03-08T07:31:00.000Z',
          provider: 'discord',
          agent_id: null,
          account_id: 'main',
          kind: 'provider_ready',
          severity: 'info',
          detail: 'Main ready',
        },
      ],
    };
    const dashboardQueries = new DashboardQueryService(db, { templatesDir, agentRegistry, presenceSource });
    const app = buildApp({ dashboardQueryService: dashboardQueries });

    const summary = await app.inject({ method: 'GET', url: '/api/agents/status' });
    const detail = await app.inject({ method: 'GET', url: '/api/agents/channels/discord' });

    expect(summary.statusCode).toBe(200);
    expect(summary.json().channel_summaries).toEqual([
      expect.objectContaining({
        channel: 'discord',
        affected_agents: [],
        history: [],
        signals: [],
        signal_status: 'unknown',
      }),
    ]);
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toEqual(expect.objectContaining({
      channel: 'discord',
      history: [
        expect.objectContaining({
          agent_id: 'main',
          presence: 'online',
        }),
      ],
      signals: [
        expect.objectContaining({
          kind: 'provider_ready',
          severity: 'info',
        }),
      ],
      affected_agents: [
        expect.objectContaining({
          id: 'main',
          presence: 'online',
        }),
      ],
    }));
  });

  it('supports todo CRUD, promote, and archive retry routes', async () => {
    const dbPath = makeDbPath();
    const db = createAgoraDatabase({ dbPath });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-501',
    });
    const outboxDir = join(dirname(dbPath), 'archive-outbox');
    const dashboardQueries = new DashboardQueryService(db, {
      templatesDir,
      archiveJobNotifier: new FileArchiveJobNotifier({
        outboxDir,
        now: () => new Date('2026-03-09T15:00:00.000Z'),
      }),
    });
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
    const notifyArchive = await app.inject({
      method: 'POST',
      url: `/api/archive/jobs/${archiveJob.id}/notify`,
    });
    const markArchiveNotified = await app.inject({
      method: 'POST',
      url: `/api/archive/jobs/${archiveJob.id}/status`,
      payload: { status: 'notified' },
    });
    const markArchiveFailed = await app.inject({
      method: 'POST',
      url: `/api/archive/jobs/${archiveJob.id}/status`,
      payload: { status: 'failed', error_message: 'writer timeout' },
    });
    const markArchiveSynced = await app.inject({
      method: 'POST',
      url: `/api/archive/jobs/${archiveJob.id}/status`,
      payload: { status: 'synced', commit_hash: 'abc123' },
    });
    const rescanArchive = await app.inject({
      method: 'POST',
      url: '/api/archive/jobs/scan-stale',
      payload: { timeout_ms: 1 },
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
    expect(notifyArchive.statusCode).toBe(200);
    expect(notifyArchive.json()).toMatchObject({
      status: 'notified',
      payload: {
        notification_receipt: {
          notification_id: 'archive-job-1',
          outbox_path: expect.stringContaining('archive-job-1.json'),
        },
      },
    });
    expect(readdirSync(outboxDir)).toEqual(['archive-job-1.json']);
    expect(markArchiveNotified.statusCode).toBe(200);
    expect(markArchiveNotified.json()).toMatchObject({ status: 'notified' });
    expect(markArchiveFailed.statusCode).toBe(200);
    expect(markArchiveFailed.json()).toMatchObject({ status: 'failed' });
    expect(markArchiveSynced.statusCode).toBe(200);
    expect(markArchiveSynced.json()).toMatchObject({ status: 'synced', commit_hash: 'abc123' });
    expect(rescanArchive.statusCode).toBe(200);
    expect(rescanArchive.json()).toEqual({ failed: 0 });
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

  it('supports manual stale archive scan', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-503',
    });
    const dashboardQueries = new DashboardQueryService(db, { templatesDir });
    const tasks = new TaskRepository(db);
    const archives = new ArchiveJobRepository(db);

    tasks.insertTask({
      id: 'OC-SCAN',
      title: '扫描超时归档',
      description: '',
      type: 'document',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: { stages: [] },
    });
    const archiveJob = archives.insertArchiveJob({
      task_id: 'OC-SCAN',
      status: 'pending',
      target_path: 'ZeYu-AI-Brain/docs/',
      payload: {},
      writer_agent: 'writer-agent',
    });
    archives.updateArchiveJob(archiveJob.id, { status: 'notified' });

    const app = buildApp({ taskService, dashboardQueryService: dashboardQueries });
    const scan = await app.inject({
      method: 'POST',
      url: '/api/archive/jobs/scan-stale',
      payload: { timeout_ms: 1 },
    });
    const archive = await app.inject({
      method: 'GET',
      url: `/api/archive/jobs/${archiveJob.id}`,
    });

    expect(scan.statusCode).toBe(200);
    expect(scan.json()).toEqual({ failed: 1 });
    expect(archive.statusCode).toBe(200);
    expect(archive.json()).toMatchObject({
      status: 'failed',
      payload: { error_message: 'archive notify timeout' },
    });
  });

  it('supports archive receipt scans that advance jobs to synced', async () => {
    const dbPath = makeDbPath();
    const db = createAgoraDatabase({ dbPath });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-504',
    });
    const receiptDir = join(dirname(dbPath), 'archive-receipts');
    const dashboardQueries = new DashboardQueryService(db, {
      templatesDir,
      archiveJobReceiptIngestor: new FileArchiveJobReceiptIngestor({
        receiptDir,
      }),
    });
    const tasks = new TaskRepository(db);
    const archives = new ArchiveJobRepository(db);

    tasks.insertTask({
      id: 'OC-RECEIPT',
      title: 'Writer 回执归档',
      description: '',
      type: 'document',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: { stages: [] },
    });
    const archiveJob = archives.insertArchiveJob({
      task_id: 'OC-RECEIPT',
      status: 'pending',
      target_path: 'ZeYu-AI-Brain/docs/',
      payload: {},
      writer_agent: 'writer-agent',
    });
    archives.updateArchiveJob(archiveJob.id, { status: 'notified' });
    mkdirSync(receiptDir, { recursive: true });
    writeFileSync(join(receiptDir, 'archive-job-1.receipt.json'), JSON.stringify({
      job_id: 1,
      status: 'synced',
      commit_hash: 'abc123',
    }), 'utf8');

    const app = buildApp({ taskService, dashboardQueryService: dashboardQueries });
    const scan = await app.inject({
      method: 'POST',
      url: '/api/archive/jobs/scan-receipts',
    });
    const archive = await app.inject({
      method: 'GET',
      url: `/api/archive/jobs/${archiveJob.id}`,
    });

    expect(scan.statusCode).toBe(200);
    expect(scan.json()).toEqual({ processed: 1, synced: 1, failed: 0 });
    expect(archive.statusCode).toBe(200);
    expect(archive.json()).toMatchObject({
      status: 'synced',
      commit_hash: 'abc123',
      payload: {
        writer_receipt: {
          status: 'synced',
        },
      },
    });
    expect(readdirSync(receiptDir)).toEqual(['archive-job-1.processed.json']);
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
        channel_providers: ['discord'],
        host_framework: 'openclaw',
      }),
    ]);
    expect(agents.json().channel_summaries).toEqual([
      expect.objectContaining({
        channel: 'discord',
        total_agents: 1,
        busy_agents: 1,
      }),
    ]);
    expect(agents.json().host_summaries).toEqual([
      expect.objectContaining({
        host: 'openclaw',
        total_agents: 1,
        busy_agents: 1,
      }),
    ]);
  });

  it('syncs live sessions into task participant and runtime session bindings', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const liveSessions = new LiveSessionStore({
      staleAfterMs: 60_000,
      now: () => new Date('2026-03-08T07:00:30.000Z'),
    });
    const taskContextBindings = new TaskContextBindingService(db);
    const taskParticipation = new TaskParticipationService(db, {
      participantIdGenerator: (() => {
        const ids = ['pb-route-1', 'pb-route-2', 'pb-route-3', 'pb-route-4'];
        return () => ids.shift() ?? 'pb-route-x';
      })(),
      runtimeSessionIdGenerator: () => 'rs-route-1',
      agentRuntimePort: {
        resolveAgent(agentRef: string) {
          return {
            agent_ref: agentRef,
            runtime_provider: 'openclaw',
            runtime_actor_ref: agentRef,
          };
        },
      },
    });
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-592',
      taskContextBindingService: taskContextBindings,
      taskParticipationService: taskParticipation,
    });
    const app = buildApp({
      taskService,
      liveSessionStore: liveSessions,
      taskContextBindingService: taskContextBindings,
      taskParticipationService: taskParticipation,
    });

    taskService.createTask({
      title: 'runtime binding route',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'high',
    });
    const binding = taskContextBindings.createBinding({
      task_id: 'OC-592',
      im_provider: 'discord',
      thread_ref: 'thread-route-92',
    });
    taskParticipation.attachContextBinding('OC-592', binding.id);

    const ingest = await app.inject({
      method: 'POST',
      url: '/api/live/openclaw/sessions',
      payload: {
        source: 'openclaw',
        agent_id: 'sonnet',
        session_key: 'agent:sonnet:discord:thread:route-92',
        channel: 'discord',
        conversation_id: 'alerts',
        thread_id: 'thread-route-92',
        status: 'active',
        last_event: 'session_start',
        last_event_at: '2026-03-08T07:00:00.000Z',
        metadata: { continuity_ref: 'cont-route-92' },
      },
    });
    const participants = await app.inject({
      method: 'GET',
      url: '/api/tasks/OC-592/participant-bindings',
    });
    const runtimeSessions = await app.inject({
      method: 'GET',
      url: '/api/tasks/OC-592/runtime-session-bindings',
    });

    expect(ingest.statusCode).toBe(200);
    expect(ingest.json()).toMatchObject({
      session_key: 'agent:sonnet:discord:thread:route-92',
      sync: {
        matched_participant_ids: ['pb-route-2'],
        matched_task_ids: ['OC-592'],
      },
    });
    expect(participants.statusCode).toBe(200);
    expect(participants.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'pb-route-2',
          task_id: 'OC-592',
          agent_ref: 'sonnet',
          binding_id: binding.id,
          join_status: 'joined',
        }),
      ]),
    );
    expect(runtimeSessions.statusCode).toBe(200);
    expect(runtimeSessions.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'rs-route-1',
          runtime_provider: 'openclaw',
          runtime_session_ref: 'agent:sonnet:discord:thread:route-92',
          runtime_actor_ref: 'sonnet',
          continuity_ref: 'cont-route-92',
          presence_state: 'active',
        }),
      ]),
    );
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
