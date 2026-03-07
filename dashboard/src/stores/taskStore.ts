import { create } from 'zustand';
import type { Task, TaskStatus } from '@/types/task';
import * as api from '@/lib/api';

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

  fetchTasks: () => Promise<void>;
  selectTask: (id: string | null) => Promise<void>;
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
      const tasks = await api.listTasks(filters.state ?? undefined);
      set({ tasks, loading: false });

      // Refresh detail if a task is selected
      const { selectedTaskId } = get();
      if (selectedTaskId) {
        const taskStatus = await api.getTaskStatus(selectedTaskId);
        set({ selectedTaskStatus: taskStatus });
      }
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  selectTask: async (id: string | null) => {
    if (!id) {
      set({ selectedTaskId: null, selectedTaskStatus: null });
      return;
    }
    set({ selectedTaskId: id, detailLoading: true });
    try {
      const taskStatus = await api.getTaskStatus(id);
      set({ selectedTaskStatus: taskStatus, detailLoading: false });
    } catch (err) {
      set({
        detailLoading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  setFilters: (partial) => {
    const { filters } = get();
    set({ filters: { ...filters, ...partial } });
  },

  clearError: () => set({ error: null }),
}));
