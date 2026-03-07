import { create } from 'zustand';
import type { Task, TaskStatus } from '@/types/task';
import * as api from '@/lib/api';
import { isTaskVisibleInWorkbench, mapTaskDto, mapTaskStatusDto } from '@/lib/taskMappers';

interface TaskFilters {
  state: string | null;
  search: string;
}

interface TaskStore {
  tasks: Task[];
  selectedTaskId: string | null;
  selectedTaskStatus: TaskStatus | null;
  filters: TaskFilters;
  loading: boolean;
  detailLoading: boolean;
  error: string | null;

  fetchTasks: () => Promise<'live' | 'error'>;
  selectTask: (id: string | null) => Promise<void>;
  resolveReview: (id: string, decision: 'approve' | 'reject', note: string) => Promise<'live'>;
  setFilters: (filters: Partial<TaskFilters>) => void;
  clearError: () => void;
}

export const useTaskStore = create<TaskStore>()((set, get) => ({
  tasks: [],
  selectedTaskId: null,
  selectedTaskStatus: null,
  filters: { state: null, search: '' },
  loading: false,
  detailLoading: false,
  error: null,

  fetchTasks: async () => {
    set({ loading: true, error: null });
    try {
      const { filters } = get();
      const tasks = (await api.listTasks(filters.state ?? undefined))
        .filter(isTaskVisibleInWorkbench)
        .map(mapTaskDto);
      set({ tasks, loading: false });

      // Refresh detail if a task is selected
      const { selectedTaskId } = get();
      if (selectedTaskId) {
        const taskStatus = mapTaskStatusDto(await api.getTaskStatus(selectedTaskId));
        set({ selectedTaskStatus: taskStatus });
      }
      return 'live';
    } catch (err) {
      set({
        tasks: [],
        selectedTaskStatus: null,
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      });
      return 'error';
    }
  },

  selectTask: async (id: string | null) => {
    if (!id) {
      set({ selectedTaskId: null, selectedTaskStatus: null });
      return;
    }
    set({ selectedTaskId: id, detailLoading: true, error: null });
    try {
      const taskStatus = mapTaskStatusDto(await api.getTaskStatus(id));
      set({ selectedTaskStatus: taskStatus, detailLoading: false });
    } catch (err) {
      set({
        selectedTaskStatus: null,
        detailLoading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  resolveReview: async (id, decision, note) => {
    set({ error: null });
    if (decision === 'approve') {
      await api.archonApprove(id, note);
    } else {
      await api.archonReject(id, note || '需要补充修改后重新提交。');
    }
    await get().fetchTasks();
    if (get().selectedTaskId === id) {
      await get().selectTask(id);
    }
    return 'live';
  },

  setFilters: (partial) => {
    const { filters } = get();
    set({ filters: { ...filters, ...partial } });
  },

  clearError: () => set({ error: null }),
}));
