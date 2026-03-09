import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgentStore } from '@/stores/agentStore';
import { useArchiveStore } from '@/stores/archiveStore';
import { useTemplateStore } from '@/stores/templateStore';
import { useTodoStore } from '@/stores/todoStore';
import * as api from '@/lib/api';

vi.mock('@/lib/api', () => ({
  getAgentsStatus: vi.fn(),
  getAgentChannelDetail: vi.fn(),
  getTmuxTail: vi.fn(),
  listArchiveJobs: vi.fn(),
  getArchiveJob: vi.fn(),
  retryArchiveJob: vi.fn(),
  listTodos: vi.fn(),
  createTodo: vi.fn(),
  updateTodo: vi.fn(),
  deleteTodo: vi.fn(),
  promoteTodo: vi.fn(),
  listTemplates: vi.fn(),
  getTemplate: vi.fn(),
}));

describe('dashboard expansion stores', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    localStorage.clear();
    useAgentStore.setState({
      summary: null,
      agents: [],
      craftsmen: [
        {
          id: 'codex',
          status: 'busy',
          taskId: 'OC-101',
          subtaskId: 'dev-api',
          title: '实现 API',
          runningSince: '2026-03-08T10:00:00.000Z',
          recentExecutions: [
            {
              executionId: 'exec-dashboard-1',
              status: 'running',
              sessionId: 'tmux:agora-craftsmen:codex',
              transport: 'tmux-pane',
              runtimeMode: 'tmux',
              startedAt: '2026-03-08T10:00:00.000Z',
            },
          ],
        },
      ],
      channelSummaries: [],
      channelDetails: {},
      channelDetailFetchedAt: {},
      hostSummaries: [],
      tmuxRuntime: null,
      tmuxTailByAgent: {},
      presenceFilter: 'all',
      craftsmenFilter: 'all',
      channelFilter: null,
      hostFilter: null,
      loading: false,
      channelDetailLoading: false,
      tmuxTailLoadingByAgent: {},
      error: null,
      channelDetailError: null,
    });
    useArchiveStore.setState({
      jobs: [],
      selectedJobId: null,
      selectedJob: null,
      loading: false,
      detailLoading: false,
      error: null,
      filters: { status: null, taskId: '' },
    });
    useTodoStore.setState({
      todos: [],
      loading: false,
      error: null,
      filter: 'all',
    });
    useTemplateStore.setState({
      templates: [],
      selectedTemplateId: null,
      selectedTemplate: null,
      loading: false,
      detailLoading: false,
      error: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads agent status into a dedicated dashboard store', async () => {
    vi.mocked(api.getAgentsStatus).mockResolvedValue({
      summary: { active_tasks: 1, active_agents: 1, total_agents: 2, online_agents: 1, stale_agents: 1, disconnected_agents: 0, busy_craftsmen: 1 },
      agents: [
        {
          id: 'sonnet',
          role: 'developer',
          status: 'busy',
          presence: 'online',
          presence_reason: 'live_session',
          channel_providers: ['discord'],
          host_framework: 'openclaw',
          inventory_sources: ['openclaw'],
          primary_model: 'gac/claude-sonnet-4-6',
          workspace_dir: '/tmp/sonnet',
          account_id: 'sonnet',
          active_task_ids: ['OC-101'],
          active_subtask_ids: ['dev-api'],
          load: 1,
          last_active_at: null,
          last_seen_at: '2026-03-08T10:00:00.000Z',
        },
      ],
      craftsmen: [{
        id: 'codex',
        status: 'busy',
        task_id: 'OC-101',
        subtask_id: 'dev-api',
        title: '实现 API',
        running_since: '2026-03-08T10:00:00.000Z',
        recent_executions: [
          {
            execution_id: 'exec-dashboard-1',
            status: 'running',
            session_id: 'tmux:agora-craftsmen:codex',
            transport: 'tmux-pane',
            runtime_mode: 'tmux',
            started_at: '2026-03-08T10:00:00.000Z',
          },
        ],
      }],
      channel_summaries: [{
        channel: 'discord',
        total_agents: 2,
        busy_agents: 1,
        online_agents: 1,
        stale_agents: 1,
        disconnected_agents: 0,
        offline_agents: 0,
        overall_presence: 'stale',
        last_seen_at: '2026-03-08T10:00:00.000Z',
        presence_reason: 'stale_gateway_log',
        affected_agents: [],
        history: [],
        signal_status: 'unknown',
        last_signal_at: null,
        signal_counts: {
          ready_events: 0,
          restart_events: 0,
          transport_errors: 0,
        },
        signals: [],
      }],
      host_summaries: [{
        host: 'openclaw',
        total_agents: 2,
        busy_agents: 1,
        online_agents: 1,
        stale_agents: 1,
        disconnected_agents: 0,
        offline_agents: 0,
        overall_presence: 'stale',
        last_seen_at: '2026-03-08T10:00:00.000Z',
        presence_reason: 'stale_gateway_log',
        affected_agents: [],
      }],
      tmux_runtime: {
        session: 'agora-craftsmen',
        panes: [
          {
            agent: 'codex',
            pane_id: '%0',
            current_command: 'bash',
            active: true,
            ready: true,
            tail_preview: null,
            continuity_backend: 'codex_session_file',
            resume_capability: 'native_resume',
            session_reference: 'codex-session-123',
            identity_source: 'session_file',
            identity_path: '/tmp/codex/session.json',
            session_observed_at: '2026-03-08T23:01:00.000Z',
            last_recovery_mode: 'resume_exact',
            transport_session_id: 'tmux:agora-craftsmen:codex',
          },
        ],
      },
    });

    const result = await useAgentStore.getState().fetchStatus();
    const state = useAgentStore.getState();

    expect(result).toBe('live');
    expect(state.summary?.activeTasks).toBe(1);
    expect(state.summary?.totalAgents).toBe(2);
    expect(state.summary?.onlineAgents).toBe(1);
    expect(state.summary?.staleAgents).toBe(1);
    expect(state.channelSummaries[0]?.overallPresence).toBe('stale');
    expect(state.channelSummaries[0]?.history).toEqual([]);
    expect(state.channelSummaries[0]?.signalStatus).toBe('unknown');
    expect(state.hostSummaries[0]?.host).toBe('openclaw');
    expect(state.tmuxRuntime?.session).toBe('agora-craftsmen');
    expect(state.tmuxTailByAgent.codex).toBeNull();
    expect(state.tmuxRuntime?.panes[0]?.identitySource).toBe('session_file');
    expect(state.tmuxRuntime?.panes[0]?.identityPath).toBe('/tmp/codex/session.json');
    expect(state.agents[0]?.id).toBe('sonnet');
    expect(state.agents[0]?.presence).toBe('online');
    expect(state.craftsmen[0]?.recentExecutions[0]?.runtimeMode).toBe('tmux');
  });

  it('loads channel detail into a dedicated slice without refetching the summary', async () => {
    vi.setSystemTime(new Date('2026-03-09T12:00:00.000Z'));
    vi.mocked(api.getAgentChannelDetail).mockResolvedValue({
      channel: 'discord',
      total_agents: 2,
      busy_agents: 1,
      online_agents: 1,
      stale_agents: 1,
      disconnected_agents: 0,
      offline_agents: 0,
      overall_presence: 'stale',
      last_seen_at: '2026-03-08T10:00:00.000Z',
      presence_reason: 'stale_gateway_log',
      affected_agents: [{
        id: 'sonnet',
        status: 'busy',
        presence: 'online',
        presence_reason: 'live_session',
        last_seen_at: '2026-03-08T10:00:00.000Z',
        account_id: 'sonnet',
      }],
      history: [{
        occurred_at: '2026-03-08T10:00:00.000Z',
        agent_id: 'sonnet',
        account_id: 'sonnet',
        presence: 'online',
        reason: 'provider_start',
      }],
      signal_status: 'degraded',
      last_signal_at: '2026-03-08T10:05:00.000Z',
      signal_counts: {
        ready_events: 1,
        restart_events: 1,
        transport_errors: 1,
      },
      signals: [{
        occurred_at: '2026-03-08T10:05:00.000Z',
        channel: 'discord',
        agent_id: 'sonnet',
        account_id: 'sonnet',
        kind: 'transport_error',
        severity: 'error',
        detail: 'code 1005',
      }],
    });

    const result = await useAgentStore.getState().fetchChannelDetail('discord');
    const state = useAgentStore.getState();

    expect(result).toBe('live');
    expect(state.channelDetails.discord?.history[0]?.agentId).toBe('sonnet');
    expect(state.channelDetails.discord?.signals[0]?.kind).toBe('transport_error');
    expect(state.channelDetailFetchedAt.discord).toBe(Date.parse('2026-03-09T12:00:00.000Z'));
  });

  it('loads tmux tail on demand per agent', async () => {
    vi.mocked(api.getTmuxTail).mockResolvedValue({ output: 'tail:codex' });

    const result = await useAgentStore.getState().fetchTmuxTail('codex', 20);
    const state = useAgentStore.getState();

    expect(result).toBe('live');
    expect(state.tmuxTailByAgent.codex).toBe('tail:codex');
    expect(state.tmuxTailLoadingByAgent.codex).toBe(false);
  });

  it('persists agent filters across refreshes', () => {
    useAgentStore.getState().setPresenceFilter('stale');
    useAgentStore.getState().setCraftsmenFilter('failures');
    useAgentStore.getState().setChannelFilter('discord');
    useAgentStore.getState().setHostFilter('openclaw');

    const raw = localStorage.getItem('agora-agent-filters');
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw ?? '{}')).toMatchObject({
      state: {
        presenceFilter: 'stale',
        craftsmenFilter: 'failures',
        channelFilter: 'discord',
        hostFilter: 'openclaw',
      },
    });
  });

  it('loads archive list and detail while preserving split-view state', async () => {
    vi.mocked(api.listArchiveJobs).mockResolvedValue([
      {
        id: 7,
        task_id: 'OC-301',
        task_title: '归档日报',
        task_type: 'document',
        status: 'failed',
        target_path: 'ZeYu-AI-Brain/docs/',
        writer_agent: 'writer-agent',
        commit_hash: null,
        requested_at: '2026-03-07T08:00:00.000Z',
        completed_at: null,
        payload: { error_message: 'timeout' },
      },
    ]);
    vi.mocked(api.getArchiveJob).mockResolvedValue({
      id: 7,
      task_id: 'OC-301',
      task_title: '归档日报',
      task_type: 'document',
      status: 'failed',
      target_path: 'ZeYu-AI-Brain/docs/',
      writer_agent: 'writer-agent',
      commit_hash: null,
      requested_at: '2026-03-07T08:00:00.000Z',
      completed_at: null,
      payload: { error_message: 'timeout' },
    });

    await useArchiveStore.getState().fetchJobs();
    await useArchiveStore.getState().selectJob(7);
    const state = useArchiveStore.getState();

    expect(state.jobs).toHaveLength(1);
    expect(state.selectedJob?.id).toBe(7);
    expect(state.selectedJob?.canRetry).toBe(true);
  });

  it('supports todo CRUD and promote refreshes through the store layer', async () => {
    vi.mocked(api.listTodos).mockResolvedValue([
      {
        id: 3,
        text: '补前端',
        status: 'pending',
        due: null,
        created_at: '2026-03-07T09:00:00.000Z',
        completed_at: null,
        tags: [],
        promoted_to: null,
      },
    ]);
    vi.mocked(api.createTodo).mockResolvedValue({
      id: 4,
      text: '补前端 v2',
      status: 'pending',
      due: null,
      created_at: '2026-03-07T10:00:00.000Z',
      completed_at: null,
      tags: [],
      promoted_to: null,
    });
    vi.mocked(api.promoteTodo).mockResolvedValue({
      todo: {
        id: 4,
        text: '补前端 v2',
        status: 'pending',
        due: null,
        created_at: '2026-03-07T10:00:00.000Z',
        completed_at: null,
        tags: [],
        promoted_to: 'OC-401',
      },
      task: {
        id: 'OC-401',
      },
    } as never);

    await useTodoStore.getState().fetchTodos();
    await useTodoStore.getState().createTodo({ text: '补前端 v2' });
    const promoted = await useTodoStore.getState().promoteTodo(4, {
      type: 'quick',
      creator: 'archon',
      priority: 'high',
    });

    expect(useTodoStore.getState().todos[0]?.id).toBe(4);
    expect(promoted.task.id).toBe('OC-401');
  });

  it('loads template summaries first and then full template detail', async () => {
    vi.mocked(api.listTemplates).mockResolvedValue([
      {
        id: 'coding',
        name: 'Coding Task',
        type: 'coding',
        description: '实现代码任务',
        governance: 'standard',
        stage_count: 4,
      },
    ]);
    vi.mocked(api.getTemplate).mockResolvedValue({
      type: 'coding',
      name: 'Coding Task',
      description: '实现代码任务',
      governance: 'standard',
      defaultTeam: {
        architect: {
          suggested: ['opus'],
        },
      },
      stages: [{ id: 'develop', name: '开发', mode: 'execute' }],
    });

    await useTemplateStore.getState().fetchTemplates();
    await useTemplateStore.getState().selectTemplate('coding');
    const state = useTemplateStore.getState();

    expect(state.templates[0]?.id).toBe('coding');
    expect(state.selectedTemplate?.stageCount).toBe(1);
  });
});
