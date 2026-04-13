import { create } from 'zustand';
import * as api from '@/lib/api';
import {
  mapProjectDto,
  mapProjectMembershipDto,
  mapProjectNomosStateDto,
  mapProjectWorkbenchDto,
} from '@/lib/projectMappers';
import type { ProjectMembership, ProjectSummary, ProjectWorkbench } from '@/types/project';

interface ProjectStore {
  projects: ProjectSummary[];
  projectMembershipsByProject: Record<string, ProjectMembership[]>;
  selectedProjectId: string | null;
  selectedProject: ProjectWorkbench | null;
  loading: boolean;
  detailLoading: boolean;
  creating: boolean;
  error: string | null;
  fetchProjects: () => Promise<'live' | 'error'>;
  fetchProjectMembers: (projectId: string) => Promise<ProjectMembership[]>;
  createProject: (input: {
    id?: string;
    name: string;
    owner: string;
    summary?: string | null;
    admins?: Array<{ account_id: number }>;
    members?: Array<{ account_id: number; role: 'admin' | 'member' }>;
  }) => Promise<ProjectSummary>;
  selectProject: (projectId: string | null) => Promise<void>;
  clearError: () => void;
}

let projectDetailRequestToken = 0;

export const useProjectStore = create<ProjectStore>()((set) => ({
  projects: [],
  projectMembershipsByProject: {},
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

  fetchProjectMembers: async (projectId) => {
    try {
      const memberships = (await api.listProjectMembers(projectId)).map(mapProjectMembershipDto);
      set((state) => ({
        projectMembershipsByProject: {
          ...state.projectMembershipsByProject,
          [projectId]: memberships,
        },
      }));
      return memberships;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },

  createProject: async (input) => {
    set({ creating: true, error: null });
    try {
      const project = mapProjectDto(await api.createProject(input));
      set((state) => ({
        projects: [project, ...state.projects.filter((item) => item.id !== project.id)],
        creating: false,
        projectMembershipsByProject: {
          ...state.projectMembershipsByProject,
          ...(input.admins || input.members
            ? {
                [project.id]: [
                  ...(input.admins ?? []).map((entry, index) => ({
                    id: `${project.id}-admin-${entry.account_id}-${index}`,
                    projectId: project.id,
                    accountId: entry.account_id,
                    role: 'admin' as const,
                    status: 'active' as const,
                    addedByAccountId: null,
                    createdAt: project.createdAt,
                    updatedAt: project.updatedAt,
                  })),
                  ...((input.members ?? [])
                    .filter((entry) => !((input.admins ?? []).some((admin) => admin.account_id === entry.account_id && entry.role === 'admin')))
                    .map((entry, index) => ({
                      id: `${project.id}-member-${entry.account_id}-${index}`,
                      projectId: project.id,
                      accountId: entry.account_id,
                      role: entry.role,
                      status: 'active' as const,
                      addedByAccountId: null,
                      createdAt: project.createdAt,
                      updatedAt: project.updatedAt,
                    }))),
                ],
              }
            : {}),
        },
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
    const requestToken = ++projectDetailRequestToken;
    set({ selectedProjectId: projectId, detailLoading: true, error: null });
    try {
      const [nomosDto, workbenchDto] = await Promise.all([
        api.getProjectNomosState(projectId),
        api.getProjectWorkbench(projectId),
      ]);
      if (requestToken !== projectDetailRequestToken) {
        return;
      }
      const detail = mapProjectWorkbenchDto(workbenchDto);
      set({
        selectedProject: {
          ...detail,
          nomos: mapProjectNomosStateDto(nomosDto),
        },
        detailLoading: false,
      });
    } catch (error) {
      if (requestToken !== projectDetailRequestToken) {
        return;
      }
      set({
        selectedProject: null,
        detailLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  clearError: () => set({ error: null }),
}));
