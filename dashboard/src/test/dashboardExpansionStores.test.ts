import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgentStore } from '@/stores/agentStore';
import { useArchiveStore } from '@/stores/archiveStore';
import { useTemplateStore } from '@/stores/templateStore';
import { useTodoStore } from '@/stores/todoStore';
import * as api from '@/lib/api';

vi.mock('@/lib/api', () => ({
  getAgentsStatus: vi.fn(),
  getAgentChannelDetail: vi.fn(),
  getCraftsmanRuntimeTail: vi.fn(),
  listArchiveJobs: vi.fn(),
  getArchiveJob: vi.fn(),
  approveArchiveJob: vi.fn(),
  notifyArchiveJob: vi.fn(),
  retryArchiveJob: vi.fn(),
  listTodos: vi.fn(),
  createTodo: vi.fn(),
  updateTodo: vi.fn(),
  deleteTodo: vi.fn(),
  promoteTodo: vi.fn(),
  listTemplates: vi.fn(),
  getTemplate: vi.fn(),
  updateTemplate: vi.fn(),
  duplicateTemplate: vi.fn(),
  validateWorkflow: vi.fn(),
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
      runtimeTailByAgent: {},
      presenceFilter: 'all',
      craftsmenFilter: 'all',
      channelFilter: null,
      hostFilter: null,
      loading: false,
      channelDetailLoading: false,
      runtimeTailLoadingByAgent: {},
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
      projectFilter: null,
    });
    useTemplateStore.setState({
      templates: [],
      selectedTemplateId: null,
      selectedTemplate: null,
      loading: false,
      detailLoading: false,
      saving: false,
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
          selectability: 'selectable',
          selectability_reason: 'live_session',
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
      craftsman_runtime: {
        providers: [{ provider: 'tmux', session: 'agora-craftsmen', slot_count: 1, ready_slots: 1, active_slots: 1 }],
        slots: [{
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
        }],
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
    expect(state.runtimeTailByAgent.codex).toBeNull();
    expect(state.craftsmanRuntime?.providers[0]?.session).toBe('agora-craftsmen');
    expect(state.craftsmanRuntime?.slots[0]?.sessionReference).toBe('codex-session-123');
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

  it('loads runtime tail on demand per agent', async () => {
    vi.mocked(api.getCraftsmanRuntimeTail).mockResolvedValue({ output: 'tail:codex' });

    const result = await useAgentStore.getState().fetchRuntimeTail('codex', 20);
    const state = useAgentStore.getState();

    expect(result).toBe('live');
    expect(state.runtimeTailByAgent.codex).toBe('tail:codex');
    expect(state.runtimeTailLoadingByAgent.codex).toBe(false);
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

  it('confirms a pending archive job through the store layer', async () => {
    useArchiveStore.setState({
      jobs: [{
        id: 9,
        taskId: 'OC-302',
        taskTitle: '待归档任务',
        taskType: 'document',
        status: 'pending',
        targetPath: 'ZeYu-AI-Brain/docs/',
        writerAgent: 'writer-agent',
        commitHash: null,
        requestedAt: '2026-03-07T08:00:00.000Z',
        completedAt: null,
        payload: { state: 'cancelled' },
        payloadSummary: '{"state":"cancelled"}',
        canApprove: false,
        canConfirm: true,
        canRetry: false,
      }],
      selectedJobId: 9,
      selectedJob: {
        id: 9,
        taskId: 'OC-302',
        taskTitle: '待归档任务',
        taskType: 'document',
        status: 'pending',
        targetPath: 'ZeYu-AI-Brain/docs/',
        writerAgent: 'writer-agent',
        commitHash: null,
        requestedAt: '2026-03-07T08:00:00.000Z',
        completedAt: null,
        payload: { state: 'cancelled' },
        payloadSummary: '{"state":"cancelled"}',
        canApprove: false,
        canConfirm: true,
        canRetry: false,
      },
    });
    vi.mocked(api.notifyArchiveJob).mockResolvedValue({
      id: 9,
      task_id: 'OC-302',
      task_title: '待归档任务',
      task_type: 'document',
      status: 'notified',
      target_path: 'ZeYu-AI-Brain/docs/',
      writer_agent: 'writer-agent',
      commit_hash: null,
      requested_at: '2026-03-07T08:00:00.000Z',
      completed_at: null,
      payload: {
        notified_at: '2026-03-07T08:01:00.000Z',
      },
    });

    await useArchiveStore.getState().confirmJob(9);

    expect(api.notifyArchiveJob).toHaveBeenCalledWith(9);
    expect(useArchiveStore.getState().selectedJob).toMatchObject({
      id: 9,
      status: 'notified',
      canApprove: false,
      canConfirm: false,
      canRetry: false,
    });
  });

  it('approves a review-pending archive job through the store layer', async () => {
    useArchiveStore.setState({
      jobs: [{
        id: 11,
        taskId: 'OC-304',
        taskTitle: '待审核归档任务',
        taskType: 'document',
        status: 'review_pending',
        targetPath: 'ZeYu-AI-Brain/docs/',
        writerAgent: 'writer-agent',
        commitHash: null,
        requestedAt: '2026-03-07T08:00:00.000Z',
        completedAt: null,
        payload: { closeout_review: { state: 'review_pending' } },
        payloadSummary: '{"closeout_review":{"state":"review_pending"}}',
        canApprove: true,
        canConfirm: false,
        canRetry: false,
      }],
      selectedJobId: 11,
      selectedJob: {
        id: 11,
        taskId: 'OC-304',
        taskTitle: '待审核归档任务',
        taskType: 'document',
        status: 'review_pending',
        targetPath: 'ZeYu-AI-Brain/docs/',
        writerAgent: 'writer-agent',
        commitHash: null,
        requestedAt: '2026-03-07T08:00:00.000Z',
        completedAt: null,
        payload: { closeout_review: { state: 'review_pending' } },
        payloadSummary: '{"closeout_review":{"state":"review_pending"}}',
        canApprove: true,
        canConfirm: false,
        canRetry: false,
      },
    });
    vi.mocked(api.approveArchiveJob).mockResolvedValue({
      id: 11,
      task_id: 'OC-304',
      task_title: '待审核归档任务',
      task_type: 'document',
      status: 'pending',
      target_path: 'ZeYu-AI-Brain/docs/',
      writer_agent: 'writer-agent',
      commit_hash: null,
      requested_at: '2026-03-07T08:00:00.000Z',
      completed_at: null,
      payload: {
        closeout_review: {
          state: 'approved',
          approver_id: 'dashboard',
        },
      },
    });

    await useArchiveStore.getState().approveJob(11);

    expect(api.approveArchiveJob).toHaveBeenCalledWith(11, 'dashboard', '');
    expect(useArchiveStore.getState().selectedJob).toMatchObject({
      id: 11,
      status: 'pending',
      canApprove: false,
      canConfirm: true,
      canRetry: false,
    });
  });

  it('maps the completed archive filter to synced jobs for the API query', async () => {
    vi.mocked(api.listArchiveJobs).mockResolvedValue([]);

    useArchiveStore.getState().setFilters({ status: 'completed' });
    await useArchiveStore.getState().fetchJobs();

    expect(api.listArchiveJobs).toHaveBeenCalledWith({
      status: 'synced',
      taskId: undefined,
    });
  });

  it('surfaces archive confirm failures without dropping the current selection', async () => {
    useArchiveStore.setState({
      jobs: [{
        id: 9,
        taskId: 'OC-302',
        taskTitle: '待归档任务',
        taskType: 'document',
        status: 'pending',
        targetPath: 'ZeYu-AI-Brain/docs/',
        writerAgent: 'writer-agent',
        commitHash: null,
        requestedAt: '2026-03-07T08:00:00.000Z',
        completedAt: null,
        payload: { state: 'cancelled' },
        payloadSummary: '{"state":"cancelled"}',
        canApprove: false,
        canConfirm: true,
        canRetry: false,
      }],
      selectedJobId: 9,
      selectedJob: {
        id: 9,
        taskId: 'OC-302',
        taskTitle: '待归档任务',
        taskType: 'document',
        status: 'pending',
        targetPath: 'ZeYu-AI-Brain/docs/',
        writerAgent: 'writer-agent',
        commitHash: null,
        requestedAt: '2026-03-07T08:00:00.000Z',
        completedAt: null,
        payload: { state: 'cancelled' },
        payloadSummary: '{"state":"cancelled"}',
        canApprove: false,
        canConfirm: true,
        canRetry: false,
      },
      error: null,
    });
    vi.mocked(api.notifyArchiveJob).mockRejectedValue(new Error('writer notify failed'));

    await expect(useArchiveStore.getState().confirmJob(9)).resolves.toBeUndefined();

    expect(useArchiveStore.getState().selectedJob).toMatchObject({
      id: 9,
      status: 'pending',
      canConfirm: true,
    });
    expect(useArchiveStore.getState().error).toContain('writer notify failed');
  });

  it('supports todo CRUD and promote refreshes through the store layer', async () => {
    vi.mocked(api.listTodos).mockResolvedValue([
      {
        id: 3,
        text: '补前端',
        project_id: 'proj-alpha',
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
      project_id: 'proj-alpha',
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
        project_id: 'proj-alpha',
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
    useTodoStore.getState().setProjectFilter('proj-alpha');
    await useTodoStore.getState().fetchTodos();
    await useTodoStore.getState().createTodo({ text: '补前端 v2', project_id: 'proj-alpha' });
    const promoted = await useTodoStore.getState().promoteTodo(4, {
      type: 'quick',
      creator: 'archon',
      priority: 'high',
    });

    expect(useTodoStore.getState().todos[0]?.id).toBe(4);
    expect(api.listTodos).toHaveBeenCalledWith(undefined, 'proj-alpha');
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

  it('saves an edited template and refreshes selected detail', async () => {
    vi.mocked(api.updateTemplate).mockResolvedValue({
      id: 'coding',
      saved: true,
      template: {
        type: 'coding',
        name: 'Coding Task v2',
        description: '更新后的模板',
        governance: 'standard',
        defaultWorkflow: 'linear',
        defaultTeam: {
          architect: {
            member_kind: 'controller',
            model_preference: 'strong_reasoning',
            suggested: ['opus', 'codex'],
          },
        },
        stages: [{ id: 'develop', name: '实现', mode: 'execute' }],
      },
    });

    await useTemplateStore.getState().saveSelectedTemplate({
      id: 'coding',
      name: 'Coding Task v2',
      type: 'coding',
      description: '更新后的模板',
      governance: 'standard',
      stageCount: 1,
      stages: [{ id: 'develop', name: '实现', mode: 'execute', gateType: null }],
      defaultTeamRoles: ['architect'],
      defaultTeam: [{ role: 'architect', memberKind: 'controller', modelPreference: 'strong_reasoning', suggested: ['opus', 'codex'] }],
      raw: {},
    });

    expect(api.updateTemplate).toHaveBeenCalledWith('coding', {
      type: 'coding',
      name: 'Coding Task v2',
      description: '更新后的模板',
      governance: 'standard',
      defaultTeam: {
        architect: {
          member_kind: 'controller',
          model_preference: 'strong_reasoning',
          suggested: ['opus', 'codex'],
        },
      },
      stages: [{ id: 'develop', name: '实现', mode: 'execute' }],
      graph: expect.any(Object),
    });
    expect(useTemplateStore.getState().selectedTemplate?.name).toBe('Coding Task v2');
  });

  it('validates selected template workflow and stores the validation result', async () => {
    vi.mocked(api.validateWorkflow).mockResolvedValue({
      valid: true,
      errors: [],
      normalized: {
        type: 'coding',
        name: 'Coding Task',
        description: '实现代码任务',
        defaultWorkflow: 'linear',
        stages: [{ id: 'develop', name: '实现', mode: 'execute' }],
      },
    });

    const result = await useTemplateStore.getState().validateSelectedTemplate({
      id: 'coding',
      name: 'Coding Task',
      type: 'coding',
      description: '实现代码任务',
      governance: 'standard',
      stageCount: 1,
      stages: [{ id: 'develop', name: '实现', mode: 'execute', gateType: null }],
      defaultTeamRoles: [],
      defaultTeam: [{ role: 'architect', memberKind: 'controller', modelPreference: null, suggested: ['opus'] }],
      raw: {},
    });

    expect(result).toBe('live');
    expect(api.validateWorkflow).toHaveBeenCalledWith({
      defaultWorkflow: undefined,
      stages: [{ id: 'develop', name: '实现', mode: 'execute' }],
    });
    expect(useTemplateStore.getState().validationResult).toMatchObject({ valid: true, errors: [] });
  });

  it('duplicates the selected template and switches focus to the duplicated detail', async () => {
    vi.mocked(api.duplicateTemplate).mockResolvedValue({
      id: 'coding_copy',
      template: {
        type: 'coding_copy',
        name: 'Coding Task Copy',
        description: 'copy',
        governance: 'standard',
        defaultWorkflow: 'linear',
        defaultTeam: {
          architect: {
            suggested: ['opus'],
          },
        },
        stages: [{ id: 'develop', name: '开发', mode: 'execute' }],
      },
    });

    await useTemplateStore.getState().duplicateSelectedTemplate({
      templateId: 'coding',
      newId: 'coding_copy',
      name: 'Coding Task Copy',
    });

    expect(api.duplicateTemplate).toHaveBeenCalledWith('coding', {
      new_id: 'coding_copy',
      name: 'Coding Task Copy',
    });
    expect(useTemplateStore.getState().selectedTemplateId).toBe('coding_copy');
    expect(useTemplateStore.getState().selectedTemplate?.name).toBe('Coding Task Copy');
  });
});
