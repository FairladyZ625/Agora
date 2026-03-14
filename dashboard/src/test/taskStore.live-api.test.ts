import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ApiCraftsmanExecutionDto,
  ApiCraftsmanGovernanceSnapshotDto,
  ApiTaskConversationSummaryDto,
  ApiTaskDto,
  ApiTaskStatusDto,
  ApiUnifiedHealthSnapshotDto,
} from '@/types/api';
import { useTaskStore } from '@/stores/taskStore';
import * as api from '@/lib/api';

vi.mock('@/lib/api', () => ({
  listTasks: vi.fn(),
  getTask: vi.fn(),
  getTaskStatus: vi.fn(),
  getTaskConversationSummary: vi.fn(),
  getTaskConversation: vi.fn(),
  markTaskConversationRead: vi.fn(),
  listSubtaskExecutions: vi.fn(),
  getCraftsmanGovernance: vi.fn(),
  getHealthSnapshot: vi.fn(),
  closeSubtask: vi.fn(),
  archiveSubtask: vi.fn(),
  cancelSubtask: vi.fn(),
  archonApprove: vi.fn(),
  archonReject: vi.fn(),
}));

function buildTaskDto(overrides: Partial<ApiTaskDto> = {}): ApiTaskDto {
  return {
    id: 'OC-001',
    version: 3,
    title: '真实 API 任务',
    description: '把 dashboard 收到真实后端上。',
    type: 'coding',
    priority: 'normal',
    creator: 'archon',
    locale: 'zh-CN',
    state: 'active',
    archive_status: null,
    current_stage: 'develop',
    team: {
      members: [
        { role: 'architect', agentId: 'opus', model_preference: 'strong_reasoning' },
        { role: 'developer', agentId: 'sonnet', model_preference: 'fast_coding' },
      ],
    },
    workflow: {
      type: 'discuss-execute-review',
      stages: [
        { id: 'discuss', name: '方案讨论', mode: 'discuss', gate: { type: 'archon_review' } },
        { id: 'develop', name: '并行开发', mode: 'execute', gate: { type: 'all_subtasks_done' } },
        { id: 'review', name: '合并审查', mode: 'discuss', gate: { type: 'archon_review' } },
      ],
    },
    scheduler: null,
    scheduler_snapshot: null,
    discord: null,
    metrics: null,
    error_detail: null,
    created_at: '2026-03-07T00:00:00.000Z',
    updated_at: '2026-03-07T01:00:00.000Z',
    ...overrides,
  };
}

function buildTaskStatusDto(overrides: Partial<ApiTaskStatusDto> = {}): ApiTaskStatusDto {
  return {
    task: buildTaskDto(),
    flow_log: [],
    progress_log: [],
    subtasks: [],
    ...overrides,
  };
}

function buildConversationSummaryDto(overrides: Partial<ApiTaskConversationSummaryDto> = {}): ApiTaskConversationSummaryDto {
  return {
    task_id: 'OC-001',
    total_entries: 1,
    latest_entry_id: 'entry-1',
    latest_provider: 'discord',
    latest_direction: 'inbound',
    latest_author_kind: 'human',
    latest_display_name: 'Lizeyu',
    latest_occurred_at: '2026-03-07T02:00:00.000Z',
    latest_body_excerpt: '来自会话的消息',
    last_read_at: null,
    unread_count: 1,
    has_unread: true,
    ...overrides,
  };
}

function buildCraftsmanExecutionDto(overrides: Partial<ApiCraftsmanExecutionDto> = {}): ApiCraftsmanExecutionDto {
  return {
    execution_id: 'exec-1',
    task_id: 'OC-001',
    subtask_id: 'subtask-1',
    adapter: 'codex',
    mode: 'one_shot',
    session_id: 'tmux:1',
    status: 'running',
    brief_path: null,
    workdir: '/tmp/agora',
    callback_payload: null,
    error: null,
    started_at: '2026-03-07T02:00:00.000Z',
    finished_at: null,
    created_at: '2026-03-07T02:00:00.000Z',
    updated_at: '2026-03-07T02:00:00.000Z',
    ...overrides,
  };
}

function buildGovernanceSnapshotDto(
  overrides: Partial<ApiCraftsmanGovernanceSnapshotDto> = {},
): ApiCraftsmanGovernanceSnapshotDto {
  return {
    limits: {
      max_concurrent_running: 4,
      max_concurrent_per_agent: 2,
      host_memory_warning_utilization_limit: 0.7,
      host_memory_utilization_limit: 0.8,
      host_swap_warning_utilization_limit: 0.1,
      host_swap_utilization_limit: 0.2,
      host_load_per_cpu_warning_limit: 1.2,
      host_load_per_cpu_limit: 1.5,
    },
    active_executions: 1,
    active_by_assignee: [{ assignee: 'opus', count: 1 }],
    active_execution_details: [],
    host_pressure_status: 'healthy',
    warnings: [],
    host: {
      observed_at: '2026-03-07T02:00:00.000Z',
      cpu_count: 8,
      load_1m: 0.72,
      memory_total_bytes: 1000,
      memory_used_bytes: 250,
      memory_utilization: 0.25,
      swap_total_bytes: 1000,
      swap_used_bytes: 0,
      swap_utilization: 0,
    },
    ...overrides,
  };
}

function buildHealthSnapshotDto(
  overrides: Partial<ApiUnifiedHealthSnapshotDto> = {},
): ApiUnifiedHealthSnapshotDto {
  return {
    generated_at: '2026-03-07T02:00:00.000Z',
    tasks: {
      status: 'healthy',
      total_tasks: 1,
      active_tasks: 1,
      paused_tasks: 0,
      blocked_tasks: 0,
      done_tasks: 0,
    },
    im: {
      status: 'healthy',
      active_bindings: 1,
      active_threads: 1,
      bindings_by_provider: [{ label: 'discord', count: 1 }],
    },
    runtime: {
      status: 'healthy',
      available: true,
      stale_after_ms: 300000,
      active_sessions: 1,
      idle_sessions: 0,
      closed_sessions: 0,
      agents: [],
    },
    craftsman: {
      status: 'healthy',
      active_executions: 1,
      queued_executions: 0,
      running_executions: 1,
      waiting_input_executions: 0,
      awaiting_choice_executions: 0,
      active_by_assignee: [{ label: 'opus', count: 1 }],
    },
    host: {
      status: 'healthy',
      snapshot: null,
    },
    escalation: {
      status: 'healthy',
      policy: {
        controller_after_ms: 600000,
        roster_after_ms: 1200000,
        inbox_after_ms: 1800000,
      },
      controller_pinged_tasks: 0,
      roster_pinged_tasks: 0,
      inbox_escalated_tasks: 0,
      unhealthy_runtime_agents: 0,
      runtime_unhealthy: false,
    },
    ...overrides,
  };
}

describe('task store live API mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listSubtaskExecutions).mockResolvedValue([]);
    vi.mocked(api.getCraftsmanGovernance).mockResolvedValue(buildGovernanceSnapshotDto());
    vi.mocked(api.getHealthSnapshot).mockResolvedValue(buildHealthSnapshotDto());
    useTaskStore.setState({
      tasks: [],
      selectedTaskId: null,
      selectedTaskStatus: null,
      governanceSnapshot: null,
      healthSnapshot: null,
      filters: { state: null, search: '' },
      loading: false,
      detailLoading: false,
      error: null,
    });
  });

  it('maps list results into live workbench tasks', async () => {
    vi.mocked(api.listTasks).mockResolvedValue([buildTaskDto()]);

    const result = await useTaskStore.getState().fetchTasks();
    const state = useTaskStore.getState();

    expect(result).toBe('live');
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0]?.state).toBe('in_progress');
    expect(state.tasks[0]?.teamLabel).toContain('opus');
    expect(state.error).toBeNull();
  });

  it('drops synced archived tasks from the workbench list and clears stale selection', async () => {
    useTaskStore.setState({
      tasks: [],
      selectedTaskId: 'OC-001',
      selectedTaskStatus: null,
      filters: { state: null, search: '' },
      loading: false,
      detailLoading: false,
      error: null,
    });
    vi.mocked(api.getTask).mockResolvedValue(buildTaskDto({ id: 'OC-001', state: 'done', archive_status: 'synced' }));
    vi.mocked(api.getTaskStatus).mockResolvedValue(
      buildTaskStatusDto({
        task: buildTaskDto({ id: 'OC-001', state: 'done', archive_status: 'synced' }),
      }),
    );
    vi.mocked(api.getTaskConversationSummary).mockResolvedValue(buildConversationSummaryDto());
    vi.mocked(api.getTaskConversation).mockResolvedValue({ entries: [] });
    vi.mocked(api.markTaskConversationRead).mockResolvedValue(buildConversationSummaryDto({
      unread_count: 0,
      has_unread: false,
    }));
    vi.mocked(api.listTasks).mockResolvedValue([
      buildTaskDto({ id: 'OC-001', state: 'done', archive_status: 'synced' }),
      buildTaskDto({ id: 'OC-002', state: 'cancelled', archive_status: 'pending' }),
    ]);

    const result = await useTaskStore.getState().fetchTasks();
    const state = useTaskStore.getState();

    expect(result).toBe('live');
    expect(state.tasks.map((task) => task.id)).toEqual(['OC-002']);
    expect(state.selectedTaskId).toBeNull();
    expect(state.selectedTaskStatus).toBeNull();
  });

  it('drops confirmed archive jobs from the workbench list as soon as they are notified', async () => {
    vi.mocked(api.listTasks).mockResolvedValue([
      buildTaskDto({ id: 'OC-010', state: 'cancelled', archive_status: 'notified' }),
      buildTaskDto({ id: 'OC-011', state: 'cancelled', archive_status: 'pending' }),
    ]);

    const result = await useTaskStore.getState().fetchTasks();
    const state = useTaskStore.getState();

    expect(result).toBe('live');
    expect(state.tasks.map((task) => task.id)).toEqual(['OC-011']);
  });

  it('records API failures instead of silently switching to mock data', async () => {
    vi.mocked(api.listTasks).mockRejectedValue(new Error('API 500: boom'));

    const result = await useTaskStore.getState().fetchTasks();
    const state = useTaskStore.getState();

    expect(result).toBe('error');
    expect(state.tasks).toEqual([]);
    expect(state.selectedTaskStatus).toBeNull();
    expect(state.error).toContain('API 500');
  });

  it('keeps detail state empty when status loading fails', async () => {
    useTaskStore.setState({
      tasks: [],
      selectedTaskId: null,
      selectedTaskStatus: null,
      filters: { state: null, search: '' },
      loading: false,
      detailLoading: false,
      error: null,
    });
    vi.mocked(api.getTaskStatus).mockRejectedValue(new Error('status unavailable'));
    vi.mocked(api.getTaskConversationSummary).mockResolvedValue(buildConversationSummaryDto());
    vi.mocked(api.getTaskConversation).mockResolvedValue({ entries: [] });
    vi.mocked(api.markTaskConversationRead).mockResolvedValue(buildConversationSummaryDto({
      unread_count: 0,
      has_unread: false,
    }));

    await useTaskStore.getState().selectTask('OC-001');
    const state = useTaskStore.getState();

    expect(state.selectedTaskId).toBe('OC-001');
    expect(state.selectedTaskStatus).toBeNull();
    expect(state.error).toContain('status unavailable');
  });

  it('loads task summary and status together when selecting a task', async () => {
    vi.mocked(api.getTask).mockResolvedValue(
      buildTaskDto({
        title: '来自 getTask 的标题',
        current_stage: 'review',
      }),
    );
    vi.mocked(api.getTaskStatus).mockResolvedValue(
      buildTaskStatusDto({
        task: buildTaskDto({
          title: '来自 status 的标题',
          current_stage: 'develop',
        }),
      }),
    );
    vi.mocked(api.getTaskConversationSummary).mockResolvedValue(buildConversationSummaryDto());
    vi.mocked(api.getTaskConversation).mockResolvedValue({
      entries: [{
        id: 'entry-1',
        task_id: 'OC-001',
        binding_id: 'binding-1',
        provider: 'discord',
        provider_message_ref: 'msg-1',
        parent_message_ref: null,
        direction: 'inbound',
        author_kind: 'human',
        author_ref: 'user-1',
        display_name: 'Lizeyu',
        body: '来自会话的消息',
        body_format: 'plain_text',
        occurred_at: '2026-03-07T02:00:00.000Z',
        ingested_at: '2026-03-07T02:00:01.000Z',
        metadata: null,
      }],
    });
    vi.mocked(api.markTaskConversationRead).mockResolvedValue(
      buildConversationSummaryDto({
        unread_count: 0,
        has_unread: false,
        last_read_at: '2026-03-07T02:10:00.000Z',
      }),
    );
    vi.mocked(api.listSubtaskExecutions).mockResolvedValue([buildCraftsmanExecutionDto()]);

    await useTaskStore.getState().selectTask('OC-001');
    const state = useTaskStore.getState();

    expect(api.getTask).toHaveBeenCalledWith('OC-001');
    expect(api.getTaskStatus).toHaveBeenCalledWith('OC-001');
    expect(api.getTaskConversationSummary).toHaveBeenCalledWith('OC-001');
    expect(api.getTaskConversation).toHaveBeenCalledWith('OC-001');
    expect(api.markTaskConversationRead).toHaveBeenCalledWith('OC-001', {});
    expect(api.getCraftsmanGovernance).toHaveBeenCalled();
    expect(state.selectedTaskStatus?.task.title).toBe('来自 getTask 的标题');
    expect(state.selectedTaskStatus?.task.current_stage).toBe('review');
    expect(state.selectedTaskStatus?.conversation?.[0]?.body).toBe('来自会话的消息');
    expect(state.selectedTaskStatus?.conversationSummary?.unread_count).toBe(0);
    expect(state.selectedTaskStatus?.governanceSnapshot?.activeExecutions).toBe(1);
    expect(state.selectedTaskStatus?.subtaskExecutions).toEqual({});
  });

  it('surfaces conversation read sync failures without dropping loaded task detail', async () => {
    vi.mocked(api.getTask).mockResolvedValue(buildTaskDto());
    vi.mocked(api.getTaskStatus).mockResolvedValue(buildTaskStatusDto());
    vi.mocked(api.getTaskConversationSummary).mockResolvedValue(buildConversationSummaryDto());
    vi.mocked(api.getTaskConversation).mockResolvedValue({ entries: [] });
    vi.mocked(api.markTaskConversationRead).mockRejectedValue(new Error('conversation read unavailable'));

    await useTaskStore.getState().selectTask('OC-001');
    const state = useTaskStore.getState();

    expect(state.selectedTaskStatus?.task.id).toBe('OC-001');
    expect(state.selectedTaskStatus?.conversationSummary?.unread_count).toBe(1);
    expect(state.error).toContain('conversation read unavailable');
  });

  it('refreshes the selected task after a successful approval', async () => {
    vi.mocked(api.archonApprove).mockResolvedValue(buildTaskDto({ current_stage: 'review' }));
    vi.mocked(api.listTasks).mockResolvedValue([buildTaskDto({ current_stage: 'review' })]);
    vi.mocked(api.getTaskStatus).mockResolvedValue(
      buildTaskStatusDto({
        task: buildTaskDto({ current_stage: 'review' }),
      }),
    );
    vi.mocked(api.getTask).mockResolvedValue(buildTaskDto({ current_stage: 'review' }));
    vi.mocked(api.getTaskConversationSummary).mockResolvedValue(buildConversationSummaryDto({
      unread_count: 0,
      has_unread: false,
    }));
    vi.mocked(api.getTaskConversation).mockResolvedValue({ entries: [] });
    vi.mocked(api.markTaskConversationRead).mockResolvedValue(buildConversationSummaryDto({
      unread_count: 0,
      has_unread: false,
    }));

    useTaskStore.setState({
      tasks: [],
      selectedTaskId: 'OC-001',
      selectedTaskStatus: null,
      filters: { state: null, search: '' },
      loading: false,
      detailLoading: false,
      error: null,
    });

    const result = await useTaskStore.getState().resolveReview('OC-001', 'approve', 'looks good');
    const state = useTaskStore.getState();

    expect(result).toBe('live');
    expect(api.archonApprove).toHaveBeenCalledWith('OC-001', 'looks good');
    expect(state.selectedTaskStatus?.task.state).toBe('gate_waiting');
  });

  it('runs subtask lifecycle actions and refreshes the selected detail', async () => {
    vi.mocked(api.closeSubtask).mockResolvedValue(buildTaskDto());
    vi.mocked(api.archiveSubtask).mockResolvedValue(buildTaskDto());
    vi.mocked(api.cancelSubtask).mockResolvedValue(buildTaskDto());
    vi.mocked(api.listTasks).mockResolvedValue([buildTaskDto()]);
    vi.mocked(api.getTask).mockResolvedValue(buildTaskDto());
    vi.mocked(api.getTaskStatus).mockResolvedValue(buildTaskStatusDto({
      subtasks: [{
        id: 'dev-api',
        task_id: 'OC-001',
        stage_id: 'develop',
        title: '后端 API',
        assignee: 'opus',
        status: 'cancelled',
        output: 'drop',
        craftsman_type: 'codex',
        dispatch_status: 'failed',
        dispatched_at: '2026-03-07T00:10:00.000Z',
        done_at: '2026-03-07T00:30:00.000Z',
      }],
    }));
    vi.mocked(api.getTaskConversationSummary).mockResolvedValue(buildConversationSummaryDto({
      unread_count: 0,
      has_unread: false,
    }));
    vi.mocked(api.getTaskConversation).mockResolvedValue({ entries: [] });
    vi.mocked(api.markTaskConversationRead).mockResolvedValue(buildConversationSummaryDto({
      unread_count: 0,
      has_unread: false,
    }));

    useTaskStore.setState({
      tasks: [],
      selectedTaskId: 'OC-001',
      selectedTaskStatus: buildTaskStatusDto({
        subtasks: [{
          id: 'dev-api',
          task_id: 'OC-001',
          stage_id: 'develop',
          title: '后端 API',
          assignee: 'opus',
          status: 'in_progress',
          output: null,
          craftsman_type: 'codex',
          dispatch_status: 'running',
          dispatched_at: '2026-03-07T00:10:00.000Z',
          done_at: null,
        }],
      }) as never,
      filters: { state: null, search: '' },
      loading: false,
      detailLoading: false,
      error: null,
    });

    await useTaskStore.getState().closeSubtask('OC-001', 'dev-api', 'opus', 'done');
    await useTaskStore.getState().archiveSubtask('OC-001', 'dev-api', 'opus', 'hold');
    await useTaskStore.getState().cancelSubtask('OC-001', 'dev-api', 'opus', 'drop');

    expect(api.closeSubtask).toHaveBeenCalledWith('OC-001', 'dev-api', 'opus', 'done');
    expect(api.archiveSubtask).toHaveBeenCalledWith('OC-001', 'dev-api', 'opus', 'hold');
    expect(api.cancelSubtask).toHaveBeenCalledWith('OC-001', 'dev-api', 'opus', 'drop');
    expect(useTaskStore.getState().selectedTaskStatus?.subtasks[0]?.status).toBe('cancelled');
  });
});
