import { create } from 'zustand';
import * as api from '@/lib/api';
import {
  mapProjectDto,
  mapProjectNomosStateDto,
  mapProjectTaskSummaryDto,
  mapProjectTodoSummaryDto,
  mapProjectWorkbenchDto,
} from '@/lib/projectMappers';
import type { ProjectSummary, ProjectWorkbench } from '@/types/project';

interface ProjectStore {
  projects: ProjectSummary[];
  selectedProjectId: string | null;
  selectedProject: ProjectWorkbench | null;
  loading: boolean;
  detailLoading: boolean;
  creating: boolean;
  error: string | null;
  fetchProjects: () => Promise<'live' | 'error'>;
  createProject: (input: { id?: string; name: string; owner: string; summary?: string | null }) => Promise<ProjectSummary>;
  selectProject: (projectId: string | null) => Promise<void>;
  clearError: () => void;
}

export const useProjectStore = create<ProjectStore>()((set) => ({
  projects: [],
  selectedProjectId: null,
  selectedProject: null,
  loading: false,
  detailLoading: false,
  creating: false,
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

  createProject: async (input) => {
    set({ creating: true, error: null });
    try {
      const project = mapProjectDto(await api.createProject(input));
      set((state) => ({
        projects: [project, ...state.projects.filter((item) => item.id !== project.id)],
        creating: false,
      }));
      return project;
    } catch (error) {
      set({
        creating: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },

  selectProject: async (projectId) => {
    if (!projectId) {
      set({ selectedProjectId: null, selectedProject: null });
      return;
    }
    set({ selectedProjectId: projectId, detailLoading: true, error: null });
    try {
      const [nomosDto, workbenchDto, tasksDto, todosDto] = await Promise.all([
        api.getProjectNomosState(projectId),
        api.getProjectWorkbench(projectId),
        api.listTasks(undefined, projectId),
        api.listTodos(undefined, projectId),
      ]);
      const detail = mapProjectWorkbenchDto(workbenchDto);
      set({
        selectedProject: {
          ...detail,
          nomos: mapProjectNomosStateDto(nomosDto),
          tasks: tasksDto.map(mapProjectTaskSummaryDto),
          todos: todosDto.map(mapProjectTodoSummaryDto),
        },
        detailLoading: false,
      });
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
