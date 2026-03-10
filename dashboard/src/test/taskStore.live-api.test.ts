import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiTaskConversationSummaryDto, ApiTaskDto, ApiTaskStatusDto } from '@/types/api';
import { useTaskStore } from '@/stores/taskStore';
import * as api from '@/lib/api';

vi.mock('@/lib/api', () => ({
  listTasks: vi.fn(),
  getTask: vi.fn(),
  getTaskStatus: vi.fn(),
  getTaskConversationSummary: vi.fn(),
  getTaskConversation: vi.fn(),
  markTaskConversationRead: vi.fn(),
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
    state: 'active',
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

describe('task store live API mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTaskStore.setState({
      tasks: [],
      selectedTaskId: null,
      selectedTaskStatus: null,
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

    await useTaskStore.getState().selectTask('OC-001');
    const state = useTaskStore.getState();

    expect(api.getTask).toHaveBeenCalledWith('OC-001');
    expect(api.getTaskStatus).toHaveBeenCalledWith('OC-001');
    expect(api.getTaskConversationSummary).toHaveBeenCalledWith('OC-001');
    expect(api.getTaskConversation).toHaveBeenCalledWith('OC-001');
    expect(api.markTaskConversationRead).toHaveBeenCalledWith('OC-001', {});
    expect(state.selectedTaskStatus?.task.title).toBe('来自 getTask 的标题');
    expect(state.selectedTaskStatus?.task.current_stage).toBe('review');
    expect(state.selectedTaskStatus?.conversation?.[0]?.body).toBe('来自会话的消息');
    expect(state.selectedTaskStatus?.conversationSummary?.unread_count).toBe(0);
  });

  it('refreshes the selected task after a successful approval', async () => {
    vi.mocked(api.archonApprove).mockResolvedValue(buildTaskDto({ current_stage: 'review' }));
    vi.mocked(api.listTasks).mockResolvedValue([buildTaskDto({ current_stage: 'review' })]);
    vi.mocked(api.getTaskStatus).mockResolvedValue(
      buildTaskStatusDto({
        task: buildTaskDto({ current_stage: 'review' }),
      }),
    );
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
});
