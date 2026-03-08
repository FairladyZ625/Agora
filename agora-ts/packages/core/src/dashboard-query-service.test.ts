import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgoraDatabase, runMigrations, ArchiveJobRepository, SubtaskRepository, TaskRepository } from '@agora-ts/db';
import { DashboardQueryService } from './dashboard-query-service.js';
import { LiveSessionStore } from './live-session-store.js';
import type { AgentRegistry } from './openclaw-agent-registry.js';
import type { AgentPresenceSource } from './openclaw-provider-presence.js';
import { TaskService } from './task-service.js';

const tempPaths: string[] = [];
const templatesDir = resolve(process.cwd(), '../agora/templates');

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

    const agentsStatus = queries.getAgentsStatus();
    const templates = queries.listTemplates();

    expect(agentsStatus.summary).toMatchObject({
      active_tasks: 1,
      active_agents: expect.any(Number),
      online_agents: expect.any(Number),
      busy_craftsmen: 1,
    });
    expect(agentsStatus.agents.map((item) => item.id)).toContain('sonnet');
    expect(agentsStatus.craftsmen).toMatchObject([
      expect.objectContaining({
        id: 'codex',
        task_id: 'OC-400',
        subtask_id: 'dev-api',
      }),
    ]);
    expect(templates.some((item) => item.id === 'coding')).toBe(true);
    expect(queries.getTemplate('coding')).toMatchObject({
      type: 'coding',
      defaultTeam: expect.any(Object),
    });
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

  it('merges real openclaw live sessions into agent status even without active tasks', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const liveSessions = new LiveSessionStore();
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
      }),
    ]);
  });

  it('returns the full agent inventory and marks non-running agents as idle', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const liveSessions = new LiveSessionStore();
    const agentRegistry: AgentRegistry = {
      listAgents: () => [
        {
          id: 'main',
          source: 'openclaw+discord',
          primary_model: 'openai-codex/gpt-5.4',
          workspace_dir: '/tmp/main',
        },
        {
          id: 'review',
          source: 'discord',
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
      busy_craftsmen: 0,
    });
    expect(agentsStatus.agents).toEqual([
      expect.objectContaining({
        id: 'main',
        status: 'busy',
        presence: 'online',
        source: 'openclaw+discord',
        primary_model: 'openai-codex/gpt-5.4',
      }),
      expect.objectContaining({
        id: 'review',
        status: 'idle',
        presence: 'offline',
        source: 'discord',
        primary_model: null,
        load: 0,
      }),
    ]);
  });

  it('overlays provider presence and last seen timestamps from gateway events', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const agentRegistry: AgentRegistry = {
      listAgents: () => [
        {
          id: 'main',
          source: 'openclaw+discord',
          primary_model: 'openai-codex/gpt-5.3-codex',
          workspace_dir: '/tmp/main',
        },
        {
          id: 'sonnet',
          source: 'discord',
          primary_model: 'gac/claude-sonnet-4-6',
          workspace_dir: null,
        },
        {
          id: 'review',
          source: 'discord',
          primary_model: null,
          workspace_dir: null,
        },
      ],
    };
    const presenceSource: AgentPresenceSource = {
      listPresence: () => [
        {
          agent_id: 'main',
          presence: 'online',
          provider: 'discord',
          account_id: 'main',
          last_seen_at: '2026-03-08T07:30:25.241Z',
        },
        {
          agent_id: 'sonnet',
          presence: 'disconnected',
          provider: 'discord',
          account_id: 'sonnet',
          last_seen_at: '2026-03-08T07:27:00.166Z',
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
    });
    expect(agentsStatus.agents).toEqual([
      expect.objectContaining({
        id: 'main',
        status: 'idle',
        presence: 'online',
        account_id: 'main',
        last_seen_at: '2026-03-08T07:30:25.241Z',
      }),
      expect.objectContaining({
        id: 'sonnet',
        status: 'idle',
        presence: 'disconnected',
        account_id: 'sonnet',
        last_seen_at: '2026-03-08T07:27:00.166Z',
      }),
      expect.objectContaining({
        id: 'review',
        status: 'idle',
        presence: 'offline',
        account_id: null,
        last_seen_at: null,
      }),
    ]);
  });
});
