import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAgoraDatabase, runMigrations, ArchiveJobRepository, CraftsmanExecutionRepository, SubtaskRepository, TaskRepository } from '@agora-ts/db';
import { FileArchiveJobNotifier, FileArchiveJobReceiptIngestor } from './archive-job-notifier.js';
import { DashboardQueryService } from './dashboard-query-service.js';
import { LiveSessionStore } from './live-session-store.js';
import { StubIMProvisioningPort } from './im-ports.js';
import type { AgentInventorySource, PresenceSource } from './runtime-ports.js';
import { TaskContextBindingService } from './task-context-binding-service.js';
import { TaskService } from './task-service.js';

const tempPaths: string[] = [];
const templatesDir = resolve(process.cwd(), 'templates');

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-dashboard-core-'));
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

describe('dashboard query service', () => {
  it('aggregates active agents, craftsmen, and template summaries', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-400',
    });
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);
    const queries = new DashboardQueryService(db, { templatesDir });

    taskService.createTask({
      title: '实现 dashboard agent pane',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'high',
    });
    subtasks.insertSubtask({
      id: 'dev-api',
      task_id: 'OC-400',
      stage_id: 'discuss',
      title: '后端 API',
      assignee: 'sonnet',
      craftsman_type: 'codex',
      dispatch_status: 'success',
      dispatched_at: '2026-03-08T10:00:00Z',
    });
    db.prepare(`
      INSERT INTO progress_log (task_id, kind, stage_id, subtask_id, content, actor)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('OC-400', 'progress', 'discuss', 'dev-api', 'working', 'sonnet');
    executions.insertExecution({
      execution_id: 'exec-dashboard-1',
      task_id: 'OC-400',
      subtask_id: 'dev-api',
      adapter: 'codex',
      mode: 'one_shot',
      session_id: 'tmux:agora-craftsmen:codex',
      status: 'running',
      callback_payload: {
        runtime_mode: 'tmux',
        transport: 'tmux-pane',
      },
      started_at: '2026-03-08T10:00:00.000Z',
    });

    const agentsStatus = queries.getAgentsStatus();
    const templates = queries.listTemplates();

    expect(agentsStatus.summary).toMatchObject({
      active_tasks: 1,
      active_agents: expect.any(Number),
      online_agents: expect.any(Number),
      stale_agents: expect.any(Number),
      disconnected_agents: expect.any(Number),
      busy_craftsmen: 1,
    });
    expect(agentsStatus.agents.map((item) => item.id)).toContain('sonnet');
    expect(agentsStatus.channel_summaries).toEqual([]);
    expect(agentsStatus.host_summaries).toEqual([]);
    expect(agentsStatus.craftsmen).toMatchObject([
      expect.objectContaining({
        id: 'codex',
        task_id: 'OC-400',
        subtask_id: 'dev-api',
        recent_executions: [
          expect.objectContaining({
            execution_id: 'exec-dashboard-1',
            status: 'running',
            transport: 'tmux-pane',
          }),
        ],
      }),
    ]);
    expect(templates.some((item) => item.id === 'coding')).toBe(true);
    expect(queries.getTemplate('coding')).toMatchObject({
      type: 'coding',
      defaultTeam: expect.any(Object),
    });
  });

  it('uses provider-tagged history events without core hardcoded channel heuristics', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const queries = new DashboardQueryService(db, {
      templatesDir,
      agentRegistry: {
        listAgents: () => [{
          id: 'ops',
          role: null,
          host_framework: 'openclaw',
          channel_providers: ['feishu'],
          inventory_sources: ['test'],
          primary_model: null,
          workspace_dir: null,
        }],
      },
      presenceSource: {
        listPresence: () => [{
          agent_id: 'ops',
          presence: 'online',
          provider: 'feishu',
          account_id: 'ops',
          last_seen_at: '2026-03-13T02:00:00.000Z',
          reason: 'provider_start',
        }],
        listHistory: () => [{
          occurred_at: '2026-03-13T02:00:00.000Z',
          agent_id: 'ops',
          provider: 'feishu',
          account_id: 'ops',
          presence: 'online',
          reason: 'provider_start',
        }],
        listSignals: () => [],
      },
    });

    const detail = queries.getAgentChannelDetail('feishu');

    expect(detail.channel).toBe('feishu');
    expect(detail.history).toEqual([
      expect.objectContaining({
        agent_id: 'ops',
        account_id: 'ops',
        presence: 'online',
        reason: 'provider_start',
      }),
    ]);
  });

  it('lists and retries archive jobs with joined task metadata', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const tasks = new TaskRepository(db);
    const archives = new ArchiveJobRepository(db);
    const queries = new DashboardQueryService(db, { templatesDir });

    tasks.insertTask({
      id: 'OC-401',
      title: '归档日报',
      description: '',
      type: 'document',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: { stages: [] },
    });
    const job = archives.insertArchiveJob({
      task_id: 'OC-401',
      status: 'failed',
      target_path: 'ZeYu-AI-Brain/docs/',
      payload: { error_message: 'timeout' },
      writer_agent: 'writer-agent',
    });

    const listed = queries.listArchiveJobs();
    const retried = queries.retryArchiveJob(job.id);

    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      task_title: '归档日报',
      task_type: 'document',
    });
    expect(retried).toMatchObject({
      id: job.id,
      status: 'pending',
      commit_hash: null,
      completed_at: null,
    });
  });

  it('updates archive job statuses through the dashboard query service', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const tasks = new TaskRepository(db);
    const archives = new ArchiveJobRepository(db);
    const queries = new DashboardQueryService(db, { templatesDir });

    tasks.insertTask({
      id: 'OC-403',
      title: '归档状态推进',
      description: '',
      type: 'document',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: { stages: [] },
    });
    const job = archives.insertArchiveJob({
      task_id: 'OC-403',
      status: 'pending',
      target_path: 'ZeYu-AI-Brain/docs/',
      payload: {},
      writer_agent: 'writer-agent',
    });

    const notified = queries.updateArchiveJob(job.id, { status: 'notified' });
    const failed = queries.updateArchiveJob(job.id, { status: 'failed', error_message: 'writer timeout' });
    const synced = queries.updateArchiveJob(job.id, { status: 'synced', commit_hash: 'abc123' });

    expect(notified.status).toBe('notified');
    expect(failed).toMatchObject({
      status: 'failed',
      payload: { error_message: 'writer timeout' },
    });
    expect(synced).toMatchObject({
      status: 'synced',
      commit_hash: 'abc123',
    });
  });

  it('destroys the archived IM context when an archive job becomes synced', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const provisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent',
      thread_ref: 'discord-thread-destroy-1',
    });
    const bindings = new TaskContextBindingService(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-ARCHIVE-CTX',
      imProvisioningPort: provisioningPort,
      taskContextBindingService: bindings,
    });
    const queries = new DashboardQueryService(db, {
      templatesDir,
      taskContextBindingService: bindings,
      imProvisioningPort: provisioningPort,
    });

    taskService.createTask({
      title: 'archive sync deletes thread',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      im_target: {
        provider: 'discord',
        visibility: 'private',
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    const binding = bindings.listBindings('OC-ARCHIVE-CTX')[0];
    expect(binding?.status).toBe('active');

    taskService.cancelTask('OC-ARCHIVE-CTX', { reason: 'archive me' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(bindings.listBindings('OC-ARCHIVE-CTX')[0]?.status).toBe('archived');

    const job = queries.listArchiveJobs({ taskId: 'OC-ARCHIVE-CTX' })[0];
    expect(job?.status).toBe('pending');

    queries.updateArchiveJob(job!.id, { status: 'synced', commit_hash: 'commit-1' });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(provisioningPort.archived).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          binding_id: binding?.id,
          thread_ref: 'discord-thread-destroy-1',
          mode: 'delete',
        }),
      ]),
    );
    expect(bindings.listBindings('OC-ARCHIVE-CTX')[0]?.status).toBe('destroyed');
  });

  it('fails stale notified archive jobs through the dashboard query service scan', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const tasks = new TaskRepository(db);
    const archives = new ArchiveJobRepository(db);
    const queries = new DashboardQueryService(db, { templatesDir });

    tasks.insertTask({
      id: 'OC-404',
      title: '归档超时扫描',
      description: '',
      type: 'document',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: { stages: [] },
    });
    const job = archives.insertArchiveJob({
      task_id: 'OC-404',
      status: 'pending',
      target_path: 'ZeYu-AI-Brain/docs/',
      payload: {},
      writer_agent: 'writer-agent',
    });
    queries.updateArchiveJob(job.id, { status: 'notified' });

    const failed = queries.failStaleArchiveJobs({ timeoutMs: 1, now: new Date(Date.now() + 10) });
    const fetched = queries.getArchiveJob(job.id);

    expect(failed).toEqual({ failed: 1 });
    expect(fetched).toMatchObject({
      status: 'failed',
      payload: { error_message: 'archive notify timeout', notified_at: expect.any(String) },
    });
  });

  it('notifies a pending archive job through the writer outbox notifier', () => {
    const dbPath = makeDbPath();
    const db = createAgoraDatabase({ dbPath });
    runMigrations(db);
    const tasks = new TaskRepository(db);
    const archives = new ArchiveJobRepository(db);
    const outboxDir = join(dirname(dbPath), 'archive-outbox');
    const queries = new DashboardQueryService(db, {
      templatesDir,
      archiveJobNotifier: new FileArchiveJobNotifier({
        outboxDir,
        now: () => new Date('2026-03-09T14:00:00.000Z'),
      }),
    });

    tasks.insertTask({
      id: 'OC-405',
      title: '归档通知',
      description: '',
      type: 'document',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: { stages: [] },
    });
    const job = archives.insertArchiveJob({
      task_id: 'OC-405',
      status: 'pending',
      target_path: 'ZeYu-AI-Brain/docs/',
      payload: { task_id: 'OC-405' },
      writer_agent: 'writer-agent',
    });

    const notified = queries.notifyArchiveJob(job.id);
    const files = readdirSync(outboxDir);
    const outboxPayload = JSON.parse(readFileSync(join(outboxDir, files[0]!), 'utf8')) as Record<string, unknown>;

    expect(notified).toMatchObject({
      status: 'notified',
      payload: {
        task_id: 'OC-405',
        notified_at: expect.any(String),
        notification_receipt: {
          notification_id: 'archive-job-1',
          outbox_path: expect.stringContaining('archive-job-1.json'),
        },
      },
    });
    expect(files).toEqual(['archive-job-1.json']);
    expect(outboxPayload).toMatchObject({
      notification_id: 'archive-job-1',
      job_id: 1,
      task_id: 'OC-405',
      target_path: 'ZeYu-AI-Brain/docs/',
      writer_agent: 'writer-agent',
      notified_at: '2026-03-09T14:00:00.000Z',
    });
  });

  it('ingests writer receipts and advances notified archive jobs to synced', () => {
    const dbPath = makeDbPath();
    const db = createAgoraDatabase({ dbPath });
    runMigrations(db);
    const tasks = new TaskRepository(db);
    const archives = new ArchiveJobRepository(db);
    const receiptDir = join(dirname(dbPath), 'archive-receipts');
    const queries = new DashboardQueryService(db, {
      templatesDir,
      archiveJobReceiptIngestor: new FileArchiveJobReceiptIngestor({
        receiptDir,
      }),
    });

    tasks.insertTask({
      id: 'OC-406',
      title: '归档回执',
      description: '',
      type: 'document',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: { stages: [] },
    });
    const job = archives.insertArchiveJob({
      task_id: 'OC-406',
      status: 'pending',
      target_path: 'ZeYu-AI-Brain/docs/',
      payload: {},
      writer_agent: 'writer-agent',
    });
    archives.updateArchiveJob(job.id, { status: 'notified' });
    mkdirSync(receiptDir, { recursive: true });
    writeFileSync(join(receiptDir, 'archive-job-1.receipt.json'), JSON.stringify({
      job_id: 1,
      status: 'synced',
      commit_hash: 'deadbeef',
    }), 'utf8');

    const result = queries.ingestArchiveJobReceipts();
    const updated = queries.getArchiveJob(job.id);

    expect(result).toEqual({ processed: 1, synced: 1, failed: 0 });
    expect(updated).toMatchObject({
      status: 'synced',
      commit_hash: 'deadbeef',
      payload: {
        writer_receipt: {
          status: 'synced',
          processed_path: expect.stringContaining('archive-job-1.processed.json'),
        },
      },
    });
    expect(readdirSync(receiptDir)).toEqual(['archive-job-1.processed.json']);
  });

  it('surfaces archive jobs that were auto-enqueued by task completion', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-402',
    });
    const subtasks = new SubtaskRepository(db);
    const queries = new DashboardQueryService(db, { templatesDir });

    service.createTask({
      title: '归档自动入队',
      type: 'document',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    service.archonApproveTask('OC-402', {
      reviewerId: 'lizeyu',
      comment: 'outline ok',
    });
    subtasks.insertSubtask({
      id: 'write-doc',
      task_id: 'OC-402',
      stage_id: 'write',
      title: '写正文',
      assignee: 'glm5',
    });
    service.completeSubtask('OC-402', {
      subtaskId: 'write-doc',
      callerId: 'glm5',
      output: '草稿完成',
    });
    service.advanceTask('OC-402', { callerId: 'archon' });
    service.approveTask('OC-402', {
      approverId: 'gpt52',
      comment: 'ship it',
    });

    const jobs = queries.listArchiveJobs({ taskId: 'OC-402' });

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      task_id: 'OC-402',
      task_title: '归档自动入队',
      status: 'pending',
    });
  });

  it('merges real openclaw live sessions into agent status even without active tasks', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const liveSessions = new LiveSessionStore({
      staleAfterMs: 60_000,
      now: () => new Date('2026-03-08T06:10:30.000Z'),
    });
    const queries = new DashboardQueryService(db, { templatesDir, liveSessions });

    liveSessions.upsert({
      source: 'openclaw',
      agent_id: 'ops',
      session_key: 'agent:ops:discord:channel:alerts',
      channel: 'discord',
      conversation_id: 'alerts',
      thread_id: '42',
      status: 'active',
      last_event: 'message_received',
      last_event_at: '2026-03-08T06:10:00.000Z',
      metadata: { trigger: 'user' },
    });

    const agentsStatus = queries.getAgentsStatus();

    expect(agentsStatus.summary.active_agents).toBe(1);
    expect(agentsStatus.agents).toMatchObject([
      expect.objectContaining({
        id: 'ops',
        status: 'busy',
        last_active_at: '2026-03-08T06:10:00.000Z',
        channel_providers: ['discord'],
        host_framework: 'openclaw',
        inventory_sources: ['openclaw'],
      }),
    ]);
    expect(agentsStatus.channel_summaries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        channel: 'discord',
        total_agents: 1,
        busy_agents: 1,
      }),
    ]));
    expect(agentsStatus.host_summaries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        host: 'openclaw',
        total_agents: 1,
        busy_agents: 1,
      }),
    ]));
  });

  it('returns the full agent inventory and marks non-running agents as idle', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const liveSessions = new LiveSessionStore({
      staleAfterMs: 60_000,
      now: () => new Date('2026-03-08T06:47:30.000Z'),
    });
    const agentRegistry: AgentInventorySource = {
      listAgents: () => [
        {
          id: 'main',
          host_framework: 'openclaw',
          channel_providers: ['discord'],
          inventory_sources: ['discord', 'openclaw'],
          primary_model: 'openai-codex/gpt-5.4',
          workspace_dir: '/tmp/main',
        },
        {
          id: 'review',
          host_framework: null,
          channel_providers: ['discord'],
          inventory_sources: ['discord'],
          primary_model: null,
          workspace_dir: null,
        },
      ],
    };
    const queries = new DashboardQueryService(db, { templatesDir, liveSessions, agentRegistry });

    liveSessions.upsert({
      source: 'openclaw',
      agent_id: 'main',
      session_key: 'agent:main:main',
      channel: 'main',
      conversation_id: 'main',
      thread_id: null,
      status: 'active',
      last_event: 'before_agent_start',
      last_event_at: '2026-03-08T06:47:13.657Z',
      metadata: {},
    });

    const agentsStatus = queries.getAgentsStatus();

    expect(agentsStatus.summary).toMatchObject({
      active_tasks: 0,
      active_agents: 1,
      total_agents: 2,
      online_agents: 1,
      stale_agents: 0,
      disconnected_agents: 0,
      busy_craftsmen: 0,
    });
    expect(agentsStatus.agents).toEqual([
      expect.objectContaining({
        id: 'main',
        status: 'busy',
        presence: 'online',
        presence_reason: 'live_session',
        channel_providers: ['discord'],
        host_framework: 'openclaw',
        inventory_sources: ['discord', 'openclaw'],
        primary_model: 'openai-codex/gpt-5.4',
      }),
      expect.objectContaining({
        id: 'review',
        status: 'idle',
        presence: 'offline',
        presence_reason: 'inventory_only',
        channel_providers: ['discord'],
        host_framework: null,
        inventory_sources: ['discord'],
        primary_model: null,
        load: 0,
      }),
    ]);
    expect(agentsStatus.channel_summaries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        channel: 'discord',
        total_agents: 2,
        busy_agents: 1,
        online_agents: 1,
        offline_agents: 1,
        overall_presence: 'online',
      }),
    ]));
    expect(agentsStatus.host_summaries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        host: 'openclaw',
        total_agents: 1,
        busy_agents: 1,
        online_agents: 1,
        overall_presence: 'online',
      }),
    ]));
    expect(agentsStatus.craftsman_runtime).toBeNull();
  });

  it('does not project closed live sessions into the active agent summary', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const liveSessions = new LiveSessionStore({
      staleAfterMs: 60_000,
      now: () => new Date('2026-03-08T06:47:30.000Z'),
    });
    const queries = new DashboardQueryService(db, { templatesDir, liveSessions });

    liveSessions.upsert({
      source: 'openclaw',
      agent_id: 'ops',
      session_key: 'agent:ops:discord:channel:alerts',
      channel: 'discord',
      conversation_id: 'alerts',
      thread_id: null,
      status: 'closed',
      last_event: 'agent_end',
      last_event_at: '2026-03-08T06:47:13.657Z',
      metadata: { success: false, error: 'unknown model' },
    });

    const agentsStatus = queries.getAgentsStatus();

    expect(agentsStatus.summary.active_agents).toBe(0);
    expect(agentsStatus.agents).toEqual([]);
  });

  it('overlays provider presence and last seen timestamps from gateway events', () => {
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
        {
          id: 'sonnet',
          host_framework: null,
          channel_providers: ['discord'],
          inventory_sources: ['discord'],
          primary_model: 'gac/claude-sonnet-4-6',
          workspace_dir: null,
        },
        {
          id: 'review',
          host_framework: null,
          channel_providers: ['discord'],
          inventory_sources: ['discord'],
          primary_model: null,
          workspace_dir: null,
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
        {
          agent_id: 'sonnet',
          presence: 'disconnected',
          provider: 'discord',
          account_id: 'sonnet',
          last_seen_at: '2026-03-08T07:27:00.166Z',
          reason: 'health_monitor_restart',
        },
      ],
      listHistory: () => [
        {
          occurred_at: '2026-03-08T07:30:25.241Z',
          agent_id: 'main',
          provider: 'discord',
          account_id: 'main',
          presence: 'online',
          reason: 'provider_start',
        },
        {
          occurred_at: '2026-03-08T07:27:00.166Z',
          agent_id: 'sonnet',
          provider: 'discord',
          account_id: 'sonnet',
          presence: 'disconnected',
          reason: 'health_monitor_restart',
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
        {
          occurred_at: '2026-03-08T07:27:00.166Z',
          provider: 'discord',
          agent_id: 'sonnet',
          account_id: 'sonnet',
          kind: 'health_restart',
          severity: 'error',
          detail: 'stuck',
        },
      ],
    };
    const queries = new DashboardQueryService(db, {
      templatesDir,
      agentRegistry,
      presenceSource,
    });

    const agentsStatus = queries.getAgentsStatus();

    expect(agentsStatus.summary).toMatchObject({
      total_agents: 3,
      online_agents: 1,
      stale_agents: 0,
      disconnected_agents: 1,
    });
    expect(agentsStatus.channel_summaries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        channel: 'discord',
        total_agents: 3,
        disconnected_agents: 1,
        overall_presence: 'disconnected',
        presence_reason: 'health_monitor_restart',
        signal_status: 'unknown',
        signal_counts: expect.objectContaining({
          ready_events: 0,
          restart_events: 0,
          transport_errors: 0,
        }),
        affected_agents: [],
        history: [],
        signals: [],
      }),
    ]));
    expect(agentsStatus.host_summaries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        host: 'openclaw',
        total_agents: 1,
        online_agents: 1,
        affected_agents: [],
      }),
    ]));
    expect(agentsStatus.agents).toEqual([
      expect.objectContaining({
        id: 'main',
        status: 'idle',
        presence: 'online',
        presence_reason: 'provider_start',
        channel_providers: ['discord'],
        host_framework: 'openclaw',
        inventory_sources: ['discord', 'openclaw'],
        account_id: 'main',
        last_seen_at: '2026-03-08T07:30:25.241Z',
      }),
      expect.objectContaining({
        id: 'sonnet',
        status: 'idle',
        presence: 'disconnected',
        presence_reason: 'health_monitor_restart',
        channel_providers: ['discord'],
        host_framework: null,
        inventory_sources: ['discord'],
        account_id: 'sonnet',
        last_seen_at: '2026-03-08T07:27:00.166Z',
      }),
      expect.objectContaining({
        id: 'review',
        status: 'idle',
        presence: 'offline',
        presence_reason: 'inventory_only',
        channel_providers: ['discord'],
        host_framework: null,
        inventory_sources: ['discord'],
        account_id: null,
        last_seen_at: null,
      }),
    ]);
  });

  it('builds channel detail without querying tmux runtime or craftsman execution history', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-410',
    });
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);
    const tmuxRuntimeService = {
      status: vi.fn(() => ({
        session: 'agora-craftsmen',
        panes: [],
      })),
      doctor: vi.fn(() => ({
        session: 'agora-craftsmen',
        panes: [],
      })),
      tail: vi.fn(() => ''),
    };
    const presenceSource: PresenceSource = {
      listPresence: () => [
        {
          agent_id: 'sonnet',
          presence: 'online',
          provider: 'discord',
          account_id: 'sonnet',
          last_seen_at: '2026-03-08T10:00:00.000Z',
          reason: 'provider_start',
        },
      ],
      listHistory: () => [
        {
          occurred_at: '2026-03-08T10:00:00.000Z',
          agent_id: 'sonnet',
          provider: 'discord',
          account_id: 'sonnet',
          presence: 'online',
          reason: 'provider_start',
        },
      ],
      listSignals: () => [
        {
          occurred_at: '2026-03-08T10:05:00.000Z',
          provider: 'discord',
          agent_id: 'sonnet',
          account_id: 'sonnet',
          kind: 'transport_error',
          severity: 'error',
          detail: 'code 1005',
        },
      ],
    };
    const queries = new DashboardQueryService(db, {
      templatesDir,
      presenceSource,
      tmuxRuntimeService,
    });
    const listBySubtaskSpy = vi.spyOn(
      (queries as unknown as { executions: CraftsmanExecutionRepository }).executions,
      'listBySubtask',
    );

    taskService.createTask({
      title: '实现 dashboard refresh deepening',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'high',
    });
    subtasks.insertSubtask({
      id: 'dev-api',
      task_id: 'OC-410',
      stage_id: 'discuss',
      title: '后端 API',
      assignee: 'sonnet',
      craftsman_type: 'codex',
      dispatch_status: 'success',
      dispatched_at: '2026-03-08T10:00:00Z',
    });
    executions.insertExecution({
      execution_id: 'exec-dashboard-410',
      task_id: 'OC-410',
      subtask_id: 'dev-api',
      adapter: 'codex',
      mode: 'one_shot',
      session_id: 'tmux:agora-craftsmen:codex',
      status: 'running',
      callback_payload: {
        runtime_mode: 'tmux',
        transport: 'tmux-pane',
      },
      started_at: '2026-03-08T10:00:00.000Z',
    });

    const detail = queries.getAgentChannelDetail('discord');

    expect(detail).toMatchObject({
      channel: 'discord',
      history: [
        expect.objectContaining({
          agent_id: 'sonnet',
          presence: 'online',
        }),
      ],
      signals: [
        expect.objectContaining({
          kind: 'transport_error',
          severity: 'error',
        }),
      ],
    });
    expect(tmuxRuntimeService.status).not.toHaveBeenCalled();
    expect(tmuxRuntimeService.doctor).not.toHaveBeenCalled();
    expect(listBySubtaskSpy).not.toHaveBeenCalled();
  });

  it('batches subtask and craftsman execution reads when building the agent summary', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    let nextTaskId = 420;
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => `OC-${nextTaskId++}`,
    });
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);
    const queries = new DashboardQueryService(db, { templatesDir });
    const internalSubtasks = (queries as unknown as { subtasks: SubtaskRepository }).subtasks;
    const internalExecutions = (queries as unknown as { executions: CraftsmanExecutionRepository }).executions;
    const listByTaskSpy = vi.spyOn(internalSubtasks, 'listByTask');
    const listByTaskIdsSpy = vi.spyOn(internalSubtasks, 'listByTaskIds');
    const listBySubtaskSpy = vi.spyOn(internalExecutions, 'listBySubtask');
    const listExecutionsByTaskIdsSpy = vi.spyOn(internalExecutions, 'listByTaskIds');

    taskService.createTask({
      title: 'Task A',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'high',
    });
    taskService.createTask({
      title: 'Task B',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'high',
    });
    subtasks.insertSubtask({
      id: 'dev-a',
      task_id: 'OC-420',
      stage_id: 'discuss',
      title: 'Dev A',
      assignee: 'sonnet',
      craftsman_type: 'codex',
    });
    subtasks.insertSubtask({
      id: 'dev-b',
      task_id: 'OC-421',
      stage_id: 'discuss',
      title: 'Dev B',
      assignee: 'codex',
      craftsman_type: 'claude',
    });
    executions.insertExecution({
      execution_id: 'exec-420',
      task_id: 'OC-420',
      subtask_id: 'dev-a',
      adapter: 'codex',
      mode: 'one_shot',
      status: 'running',
    });
    executions.insertExecution({
      execution_id: 'exec-421',
      task_id: 'OC-421',
      subtask_id: 'dev-b',
      adapter: 'claude',
      mode: 'one_shot',
      status: 'running',
    });

    const status = queries.getAgentsStatus();

    expect(status.summary.active_tasks).toBe(2);
    expect(listByTaskIdsSpy).toHaveBeenCalledWith(expect.arrayContaining(['OC-420', 'OC-421']));
    expect(listExecutionsByTaskIdsSpy).toHaveBeenCalledWith(expect.arrayContaining(['OC-420', 'OC-421']));
    expect(listByTaskSpy).not.toHaveBeenCalled();
    expect(listBySubtaskSpy).not.toHaveBeenCalled();
  });

  it('merges tmux runtime panes into the agents read model', () => {
    const tail = (agent: string) => `tail:${agent}`;
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const queries = new DashboardQueryService(db, {
      templatesDir,
      tmuxRuntimeService: {
        status: () => ({
          session: 'agora-craftsmen',
          panes: [
            {
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
            },
            {
              id: '%1',
              title: '✳ Claude Code',
              currentCommand: 'bash',
              active: false,
              continuityBackend: 'claude_session_id' as const,
              resumeCapability: 'native_resume' as const,
              sessionReference: null,
              identitySource: 'registry_default' as const,
              lastRecoveryMode: null,
              transportSessionId: null,
            },
          ],
        }),
        doctor: () => ({
          session: 'agora-craftsmen',
          panes: [
            {
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
            },
            {
              agent: 'claude',
              pane: '%1',
              command: 'bash',
              active: false,
              ready: true,
              continuityBackend: 'claude_session_id' as const,
              resumeCapability: 'native_resume' as const,
              sessionReference: null,
              identitySource: 'registry_default' as const,
              lastRecoveryMode: null,
              transportSessionId: null,
            },
            {
              agent: 'gemini',
              pane: null,
              command: null,
              active: false,
              ready: false,
              continuityBackend: 'gemini_session_id' as const,
              resumeCapability: 'native_resume' as const,
              sessionReference: null,
              identitySource: 'registry_default' as const,
              lastRecoveryMode: null,
              transportSessionId: null,
            },
          ],
        }),
        tail,
      },
    });

    const agentsStatus = queries.getAgentsStatus();

    expect(agentsStatus.craftsman_runtime).toEqual({
      providers: [
        {
          provider: 'tmux',
          session: 'agora-craftsmen',
          slot_count: 3,
          ready_slots: 2,
          active_slots: 1,
        },
      ],
      slots: [
        {
          provider: 'tmux',
          agent: 'claude',
          session_id: null,
          runtime_mode: 'tmux',
          transport: 'tmux-pane',
          status: 'idle',
          ready: true,
          active: false,
          current_command: 'bash',
          tail_preview: null,
          session_reference: null,
          execution_id: null,
          task_id: null,
          subtask_id: null,
          title: null,
        },
        {
          provider: 'tmux',
          agent: 'codex',
          session_id: 'tmux:agora-craftsmen:codex',
          runtime_mode: 'tmux',
          transport: 'tmux-pane',
          status: 'running',
          ready: true,
          active: true,
          current_command: 'bash',
          tail_preview: null,
          session_reference: 'codex-session-123',
          execution_id: null,
          task_id: null,
          subtask_id: null,
          title: null,
        },
        {
          provider: 'tmux',
          agent: 'gemini',
          session_id: null,
          runtime_mode: 'tmux',
          transport: 'tmux-pane',
          status: 'unready',
          ready: false,
          active: false,
          current_command: null,
          tail_preview: null,
          session_reference: null,
          execution_id: null,
          task_id: null,
          subtask_id: null,
          title: null,
        },
      ],
    });
    expect(tail('codex')).toBe('tail:codex');
  });

  it('marks a channel as recovering and collapses duplicate transport errors when presence is still online', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const agentRegistry: AgentInventorySource = {
      listAgents: () => [
        {
          id: 'main',
          host_framework: 'openclaw',
          channel_providers: ['discord'],
          inventory_sources: ['discord', 'openclaw'],
          primary_model: null,
          workspace_dir: null,
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
          last_seen_at: '2026-03-09T02:29:00.000Z',
          reason: 'provider_start',
        },
      ],
      listHistory: () => [],
      listSignals: () => [
        {
          occurred_at: '2026-03-09T02:28:04.217Z',
          provider: 'discord',
          agent_id: null,
          account_id: null,
          kind: 'transport_error',
          severity: 'error',
          detail: 'code 1005',
        },
        {
          occurred_at: '2026-03-09T02:19:19.938Z',
          provider: 'discord',
          agent_id: null,
          account_id: null,
          kind: 'transport_error',
          severity: 'error',
          detail: 'code 1005',
        },
        {
          occurred_at: '2026-03-09T02:10:00.000Z',
          provider: 'discord',
          agent_id: null,
          account_id: '1475474396008419490',
          kind: 'provider_ready',
          severity: 'info',
          detail: 'Main ready',
        },
      ],
    };
    const queries = new DashboardQueryService(db, {
      templatesDir,
      agentRegistry,
      presenceSource,
    });

    const agentsStatus = queries.getAgentsStatus();
    const discord = agentsStatus.channel_summaries.find((item) => item.channel === 'discord');

    expect(discord).toMatchObject({
      signal_status: 'unknown',
      signal_counts: {
        ready_events: 0,
        restart_events: 0,
        transport_errors: 0,
      },
    });
    expect(discord?.signals).toEqual([]);
  });
});
