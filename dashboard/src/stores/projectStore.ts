import { create } from 'zustand';
import * as api from '@/lib/api';
import { mapProjectDto, mapProjectWorkbenchDto } from '@/lib/projectMappers';
import type { ProjectSummary, ProjectWorkbench } from '@/types/project';

interface ProjectStore {
  projects: ProjectSummary[];
  selectedProjectId: string | null;
  selectedProject: ProjectWorkbench | null;
  loading: boolean;
  detailLoading: boolean;
  error: string | null;
  fetchProjects: () => Promise<'live' | 'error'>;
  selectProject: (projectId: string | null) => Promise<void>;
  clearError: () => void;
}

export const useProjectStore = create<ProjectStore>()((set) => ({
  projects: [],
  selectedProjectId: null,
  selectedProject: null,
  loading: false,
  detailLoading: false,
  error: null,

  fetchProjects: async () => {
    set({ loading: true, error: null });
    try {
      const projects = (await api.listProjects()).map(mapProjectDto);
      set({ projects, loading: false });
      return 'live';
    } catch (error) {
      set({
        projects: [],
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return 'error';
    }
  },

  selectProject: async (projectId) => {
    if (!projectId) {
      set({ selectedProjectId: null, selectedProject: null });
      return;
    }
    set({ selectedProjectId: projectId, detailLoading: true, error: null });
    try {
      const detail = mapProjectWorkbenchDto(await api.getProjectWorkbench(projectId));
      set({ selectedProject: detail, detailLoading: false });
    } catch (error) {
      set({
        selectedProject: null,
        detailLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  clearError: () => set({ error: null }),
}));
