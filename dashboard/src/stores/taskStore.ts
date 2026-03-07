import { create } from 'zustand';
import type { Task, TaskStatus } from '@/types/task';
import * as api from '@/lib/api';
import { createMockTasks, getMockTaskStatus } from '@/lib/mockDashboard';

interface TaskFilters {
  state: string | null;
  search: string;
}

interface TaskStore {
  tasks: Task[];
  selectedTaskId: string | null;
  selectedTaskStatus: TaskStatus | null;
  filters: TaskFilters;
  dataSource: 'live' | 'mock';
  loading: boolean;
  detailLoading: boolean;
  error: string | null;

  fetchTasks: () => Promise<'live' | 'mock'>;
  selectTask: (id: string | null) => Promise<void>;
  resolveReview: (id: string, decision: 'approve' | 'reject', note: string) => Promise<'live' | 'mock'>;
  setFilters: (filters: Partial<TaskFilters>) => void;
  clearError: () => void;
}

function nowIso(): string {
  return new Date().toISOString();
}

function applyMockDecision(
  current: TaskStatus | null,
  decision: 'approve' | 'reject',
  note: string,
): TaskStatus | null {
  if (!current) return null;

  const updatedAt = nowIso();
  const nextState = decision === 'approve' ? 'in_progress' : 'pending';
  const nextStage = decision === 'approve' ? 'dispatch-approved' : 'rework-requested';
  const nextEvent = decision === 'approve' ? 'archon-approved' : 'archon-rejected';
  const nextDetail = decision === 'approve'
    ? 'Mock 阶段裁决通过，任务重新回到执行主线。'
    : 'Mock 阶段裁决驳回，任务回退到待修订状态。';

  return {
    ...current,
    task: {
      ...current.task,
      state: nextState,
      current_stage: nextStage,
      updated_at: updatedAt,
      error_detail: decision === 'reject' ? note || '需要补充修改后重新提交。' : null,
    },
    flow_log: [
      {
        id: current.flow_log.length + 1000,
        task_id: current.task.id,
        kind: 'state',
        event: nextEvent,
        stage_id: nextStage,
        from_state: current.task.state,
        to_state: nextState,
        detail: note ? `${nextDetail} ${note}` : nextDetail,
        actor: 'archon',
        created_at: updatedAt,
      },
      ...current.flow_log,
    ],
    progress_log: [
      {
        id: current.progress_log.length + 1000,
        task_id: current.task.id,
        kind: 'note',
        stage_id: nextStage,
        subtask_id: null,
        content: note || (decision === 'approve' ? '已批准继续执行。' : '已驳回，等待修订。'),
        artifacts: null,
        actor: 'archon',
        created_at: updatedAt,
      },
      ...current.progress_log,
    ],
  };
}

export const useTaskStore = create<TaskStore>()((set, get) => ({
  tasks: [],
  selectedTaskId: null,
  selectedTaskStatus: null,
  filters: { state: null, search: '' },
  dataSource: 'mock',
  loading: false,
  detailLoading: false,
  error: null,

  fetchTasks: async () => {
    set({ loading: true, error: null });
    try {
      const { filters } = get();
      const tasks = await api.listTasks(filters.state ?? undefined);
      set({ tasks, loading: false, dataSource: 'live' });

      // Refresh detail if a task is selected
      const { selectedTaskId } = get();
      if (selectedTaskId) {
        const taskStatus = await api.getTaskStatus(selectedTaskId);
        set({ selectedTaskStatus: taskStatus });
      }
      return 'live';
    } catch (err) {
      const { selectedTaskId } = get();
      set({
        tasks: createMockTasks(),
        selectedTaskStatus: selectedTaskId ? getMockTaskStatus(selectedTaskId) : null,
        dataSource: 'mock',
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      });
      return 'mock';
    }
  },

  selectTask: async (id: string | null) => {
    if (!id) {
      set({ selectedTaskId: null, selectedTaskStatus: null });
      return;
    }
    set({ selectedTaskId: id, detailLoading: true });
    try {
      if (get().dataSource === 'mock') {
        set({
          selectedTaskStatus: getMockTaskStatus(id),
          detailLoading: false,
        });
        return;
      }
      const taskStatus = await api.getTaskStatus(id);
      set({ selectedTaskStatus: taskStatus, detailLoading: false });
    } catch (err) {
      set({
        selectedTaskStatus: getMockTaskStatus(id),
        dataSource: 'mock',
        detailLoading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  resolveReview: async (id, decision, note) => {
    if (get().dataSource === 'live') {
      if (decision === 'approve') {
        await api.archonApprove(id, note);
      } else {
        await api.archonReject(id, note || '需要补充修改后重新提交。');
      }
      await get().fetchTasks();
      await get().selectTask(id);
      return 'live';
    }

    const updatedAt = nowIso();
    const currentTasks = get().tasks;
    const taskStatus = get().selectedTaskStatus?.task.id === id
      ? get().selectedTaskStatus
      : getMockTaskStatus(id);
    const nextStatus = applyMockDecision(taskStatus, decision, note);

    set({
      tasks: currentTasks.map((task) => {
        if (task.id !== id) return task;
        return nextStatus?.task ?? {
          ...task,
          state: decision === 'approve' ? 'in_progress' : 'pending',
          current_stage: decision === 'approve' ? 'dispatch-approved' : 'rework-requested',
          updated_at: updatedAt,
        };
      }),
      selectedTaskStatus: nextStatus,
      error: null,
    });

    return 'mock';
  },

  setFilters: (partial) => {
    const { filters } = get();
    set({ filters: { ...filters, ...partial } });
  },

  clearError: () => set({ error: null }),
}));
