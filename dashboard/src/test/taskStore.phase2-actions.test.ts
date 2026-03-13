import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiTaskDto, ApiTaskStatusDto } from '@/types/api';
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
  createTask: vi.fn(),
  advanceTask: vi.fn(),
  approveTask: vi.fn(),
  rejectTask: vi.fn(),
  confirmTask: vi.fn(),
  subtaskDone: vi.fn(),
  forceAdvanceTask: vi.fn(),
  pauseTask: vi.fn(),
  resumeTask: vi.fn(),
  cancelTask: vi.fn(),
  unblockTask: vi.fn(),
  cleanupTasks: vi.fn(),
  archonApprove: vi.fn(),
  archonReject: vi.fn(),
}));

function buildTaskDto(overrides: Partial<ApiTaskDto> = {}): ApiTaskDto {
  return {
    id: 'OC-001',
    version: 3,
    title: '真实 API 任务',
    description: '扩任务动作。',
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
        { role: 'reviewer', agentId: 'glm5', model_preference: 'chinese_strong' },
      ],
    },
    workflow: {
      type: 'discuss-execute-review',
      stages: [
        { id: 'develop', name: '并行开发', mode: 'execute', gate: { type: 'all_subtasks_done' } },
        { id: 'review', name: '合并审查', mode: 'discuss', gate: { type: 'approval' } },
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
    subtasks: [
      {
        id: 'dev-api',
        task_id: 'OC-001',
        stage_id: 'develop',
        title: '后端 API',
        assignee: 'sonnet',
        status: 'in_progress',
        output: null,
        craftsman_type: 'backend',
        dispatch_status: 'running',
        dispatched_at: '2026-03-07T00:10:00.000Z',
        done_at: null,
      },
    ],
    ...overrides,
  };
}

function buildConversationSummary() {
  return {
    task_id: 'OC-001',
    total_entries: 0,
    latest_entry_id: null,
    latest_provider: null,
    latest_direction: null,
    latest_author_kind: null,
    latest_display_name: null,
    latest_occurred_at: null,
    latest_body_excerpt: null,
    last_read_at: null,
    unread_count: 0,
    has_unread: false,
  };
}

function buildConversationList() {
  return {
    task_id: 'OC-001',
    entries: [],
  };
}

describe('task store phase 2 actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getTask).mockResolvedValue(buildTaskDto());
    vi.mocked(api.getTaskConversationSummary).mockResolvedValue(buildConversationSummary());
    vi.mocked(api.getTaskConversation).mockResolvedValue(buildConversationList());
    vi.mocked(api.markTaskConversationRead).mockResolvedValue(buildConversationSummary());
    vi.mocked(api.listSubtaskExecutions).mockResolvedValue([]);
    vi.mocked(api.getCraftsmanGovernance).mockResolvedValue({
      limits: {
        max_concurrent_running: 4,
        max_concurrent_per_agent: 2,
        host_memory_utilization_limit: 0.8,
        host_swap_utilization_limit: 0.2,
        host_load_per_cpu_limit: 1.5,
      },
      active_executions: 0,
      active_by_assignee: [],
      host: null,
    });
    useTaskStore.setState({
      tasks: [],
      selectedTaskId: 'OC-001',
      selectedTaskStatus: null,
      filters: { state: null, search: '' },
      loading: false,
      detailLoading: false,
      error: null,
    });
  });

  it('creates a task and refreshes the live list', async () => {
    vi.mocked(api.createTask).mockResolvedValue(buildTaskDto({ id: 'OC-009', title: '新任务' }));
    vi.mocked(api.getTask).mockResolvedValue(buildTaskDto({ id: 'OC-009', title: '新任务' }));
    vi.mocked(api.listTasks).mockResolvedValue([buildTaskDto({ id: 'OC-009', title: '新任务' })]);
    vi.mocked(api.getTaskStatus).mockResolvedValue(buildTaskStatusDto({ task: buildTaskDto({ id: 'OC-009', title: '新任务' }) }));

    const created = await useTaskStore.getState().createTask({
      title: '新任务',
      type: 'coding',
      creator: 'archon',
      description: '创建任务',
      priority: 'normal',
    });

    expect(api.createTask).toHaveBeenCalledWith({
      title: '新任务',
      type: 'coding',
      creator: 'archon',
      description: '创建任务',
      priority: 'normal',
    });
    expect(created.id).toBe('OC-009');
    expect(useTaskStore.getState().tasks[0]?.id).toBe('OC-009');
  });

  it('passes create-task overrides through the store to the api client', async () => {
    vi.mocked(api.createTask).mockResolvedValue(buildTaskDto({ id: 'OC-010', title: '带 override 的任务' }));
    vi.mocked(api.getTask).mockResolvedValue(buildTaskDto({ id: 'OC-010', title: '带 override 的任务' }));
    vi.mocked(api.listTasks).mockResolvedValue([buildTaskDto({ id: 'OC-010', title: '带 override 的任务' })]);
    vi.mocked(api.getTaskStatus).mockResolvedValue(buildTaskStatusDto({ task: buildTaskDto({ id: 'OC-010', title: '带 override 的任务' }) }));

    await useTaskStore.getState().createTask({
      title: '带 override 的任务',
      type: 'coding',
      creator: 'archon',
      description: '创建任务',
      priority: 'high',
      team_override: {
        members: [
          { role: 'architect', agentId: 'opus', model_preference: 'strong_reasoning' },
          { role: 'developer', agentId: 'codex', model_preference: 'fast_coding' },
        ],
      },
      im_target: {
        provider: 'discord',
        visibility: 'private',
        participant_refs: ['opus', 'codex'],
      },
    });

    expect(api.createTask).toHaveBeenCalledWith({
      title: '带 override 的任务',
      type: 'coding',
      creator: 'archon',
      description: '创建任务',
      priority: 'high',
      team_override: {
        members: [
          { role: 'architect', agentId: 'opus', model_preference: 'strong_reasoning' },
          { role: 'developer', agentId: 'codex', model_preference: 'fast_coding' },
        ],
      },
      im_target: {
        provider: 'discord',
        visibility: 'private',
        participant_refs: ['opus', 'codex'],
      },
    });
  });

  it('executes an advance action and refreshes the selected task context', async () => {
    vi.mocked(api.advanceTask).mockResolvedValue(buildTaskDto({ current_stage: 'review' }));
    vi.mocked(api.getTask).mockResolvedValue(buildTaskDto({ current_stage: 'review' }));
    vi.mocked(api.listTasks).mockResolvedValue([buildTaskDto({ current_stage: 'review' })]);
    vi.mocked(api.getTaskStatus).mockResolvedValue(buildTaskStatusDto({ task: buildTaskDto({ current_stage: 'review' }) }));

    await useTaskStore.getState().runTaskAction('advance', {
      taskId: 'OC-001',
      actorId: 'opus',
    });

    expect(api.advanceTask).toHaveBeenCalledWith('OC-001', 'opus');
    expect(useTaskStore.getState().selectedTaskStatus?.task.current_stage).toBe('review');
  });

  it('reports subtask completion through the dedicated API and refreshes detail state', async () => {
    vi.mocked(api.subtaskDone).mockResolvedValue(buildTaskDto());
    vi.mocked(api.getTask).mockResolvedValue(buildTaskDto());
    vi.mocked(api.listTasks).mockResolvedValue([buildTaskDto()]);
    vi.mocked(api.getTaskStatus).mockResolvedValue(
      buildTaskStatusDto({
        subtasks: [
          {
            id: 'dev-api',
            task_id: 'OC-001',
            stage_id: 'develop',
            title: '后端 API',
            assignee: 'sonnet',
            status: 'done',
            output: '完成',
            craftsman_type: 'backend',
            dispatch_status: 'completed',
            dispatched_at: '2026-03-07T00:10:00.000Z',
            done_at: '2026-03-07T00:30:00.000Z',
          },
        ],
      }),
    );

    await useTaskStore.getState().runTaskAction('subtask_done', {
      taskId: 'OC-001',
      subtaskId: 'dev-api',
      actorId: 'sonnet',
      note: '完成',
    });

    expect(api.subtaskDone).toHaveBeenCalledWith('OC-001', 'dev-api', 'sonnet', '完成');
    expect(useTaskStore.getState().selectedTaskStatus?.subtasks[0]?.status).toBe('done');
  });
});
