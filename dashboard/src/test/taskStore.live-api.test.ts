import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiTaskDto, ApiTaskStatusDto } from '@/types/api';
import { useTaskStore } from '@/stores/taskStore';
import * as api from '@/lib/api';

vi.mock('@/lib/api', () => ({
  listTasks: vi.fn(),
  getTaskStatus: vi.fn(),
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

    await useTaskStore.getState().selectTask('OC-001');
    const state = useTaskStore.getState();

    expect(state.selectedTaskId).toBe('OC-001');
    expect(state.selectedTaskStatus).toBeNull();
    expect(state.error).toContain('status unavailable');
  });

  it('refreshes the selected task after a successful approval', async () => {
    vi.mocked(api.archonApprove).mockResolvedValue(buildTaskDto({ current_stage: 'review' }));
    vi.mocked(api.listTasks).mockResolvedValue([buildTaskDto({ current_stage: 'review' })]);
    vi.mocked(api.getTaskStatus).mockResolvedValue(
      buildTaskStatusDto({
        task: buildTaskDto({ current_stage: 'review' }),
      }),
    );

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
