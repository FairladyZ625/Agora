import { create } from 'zustand';
import * as api from '@/lib/api';
import { mapArchiveJobDto } from '@/lib/dashboardExpansionMappers';
import type { ArchiveJob } from '@/types/dashboard';

interface ArchiveFilters {
  status: string | null;
  taskId: string;
}

interface ArchiveStore {
  jobs: ArchiveJob[];
  selectedJobId: number | null;
  selectedJob: ArchiveJob | null;
  loading: boolean;
  detailLoading: boolean;
  error: string | null;
  filters: ArchiveFilters;
  fetchJobs: () => Promise<'live' | 'error'>;
  selectJob: (id: number | null) => Promise<void>;
  retryJob: (id: number, reason?: string) => Promise<void>;
  setFilters: (filters: Partial<ArchiveFilters>) => void;
  clearError: () => void;
}

export const useArchiveStore = create<ArchiveStore>()((set, get) => ({
  jobs: [],
  selectedJobId: null,
  selectedJob: null,
  loading: false,
  detailLoading: false,
  error: null,
  filters: { status: null, taskId: '' },

  fetchJobs: async () => {
    set({ loading: true, error: null });
    try {
      const { filters, selectedJobId } = get();
      const jobs = (await api.listArchiveJobs({
        status: filters.status ?? undefined,
        taskId: filters.taskId.trim() || undefined,
      })).map(mapArchiveJobDto);
      const selectedJob = selectedJobId ? jobs.find((job) => job.id === selectedJobId) ?? get().selectedJob : get().selectedJob;
      set({ jobs, selectedJob, loading: false });
      return 'live';
    } catch (error) {
      set({
        jobs: [],
        selectedJob: null,
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return 'error';
    }
  },

  selectJob: async (id) => {
    if (id === null) {
      set({ selectedJobId: null, selectedJob: null });
      return;
    }
    set({ selectedJobId: id, detailLoading: true, error: null });
    try {
      const selectedJob = mapArchiveJobDto(await api.getArchiveJob(id));
      set({ selectedJob, detailLoading: false });
    } catch (error) {
      set({
        selectedJob: null,
        detailLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  retryJob: async (id, reason = '') => {
    set({ error: null });
    const updated = mapArchiveJobDto(await api.retryArchiveJob(id, reason));
    const jobs = get().jobs.map((job) => (job.id === id ? updated : job));
    set({
      jobs,
      selectedJobId: id,
      selectedJob: get().selectedJobId === id ? updated : get().selectedJob,
    });
  },

  setFilters: (partial) => {
    set({ filters: { ...get().filters, ...partial } });
  },

  clearError: () => set({ error: null }),
}));
