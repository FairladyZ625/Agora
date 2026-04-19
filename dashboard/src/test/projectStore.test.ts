import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/lib/api';
import { useProjectStore } from '@/stores/projectStore';
import type { ApiProjectDto, ApiProjectWorkbenchDto, ApiTaskDto, ApiTodoDto } from '@/types/api';

function resetProjectStore() {
  useProjectStore.setState({
    projects: [],
    selectedProjectId: null,
    selectedProject: null,
    loading: false,
    detailLoading: false,
    creating: false,
    error: null,
  });
}

function buildProjectDto(overrides: Partial<ApiProjectDto> = {}): ApiProjectDto {
  return {
    id: 'proj-alpha',
    name: 'Project Alpha',
    summary: 'Alpha summary',
    owner: 'archon',
    status: 'active',
    metadata: {
      repo_path: '/tmp/proj-alpha',
      agora: {
        nomos: {
          id: 'agora/default',
        },
      },
    },
    created_at: '2026-03-23T00:00:00.000Z',
    updated_at: '2026-03-23T01:00:00.000Z',
    ...overrides,
  } as ApiProjectDto;
}

function buildProjectWorkbenchDto(): ApiProjectWorkbenchDto {
  return {
    project: buildProjectDto(),
    overview: {
      status: 'active',
      owner: 'archon',
      updated_at: '2026-03-23T01:00:00.000Z',
      counts: {
        knowledge: 0,
        citizens: 0,
        recaps: 0,
        tasks_total: 1,
        active_tasks: 1,
        review_tasks: 0,
        todos_total: 1,
        pending_todos: 1,
      },
    },
    surfaces: {
      index: {
        project_id: 'proj-alpha',
        kind: 'index',
        slug: 'index',
        title: 'Project Index',
        path: 'docs/index.md',
        content: '# Index',
        created_at: '2026-03-23T00:00:00.000Z',
        updated_at: '2026-03-23T02:00:00.000Z',
        source_task_ids: [],
      },
      timeline: {
        project_id: 'proj-alpha',
        kind: 'timeline',
        slug: 'timeline',
        title: 'Timeline',
        path: 'docs/timeline.md',
        content: '# Timeline',
        created_at: '2026-03-23T00:00:00.000Z',
        source_task_ids: ['OC-123'],
        updated_at: '2026-03-23T03:00:00.000Z',
      },
    },
    work: {
      tasks: [buildTaskDto()],
      todos: [buildTodoDto()],
      recaps: [],
      knowledge: [],
    },
    operator: {
      nomos_id: 'agora/default',
      repo_path: '/tmp/proj-alpha',
      citizens: [],
    },
  } as unknown as ApiProjectWorkbenchDto;
}

function buildTaskDto(): ApiTaskDto {
  return {
    id: 'OC-123',
    title: 'Implement feature',
    state: 'active',
    project_id: 'proj-alpha',
  } as ApiTaskDto;
}

function buildTodoDto(): ApiTodoDto {
  return {
    id: 1,
    text: 'Review mapper coverage',
    status: 'open',
    project_id: 'proj-alpha',
    due: null,
    created_at: '2026-03-23T00:00:00.000Z',
    completed_at: null,
    tags: [],
    promoted_to: null,
  } as ApiTodoDto;
}

describe('project store', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetProjectStore();
  });

  it('fetches live projects and maps them into summaries', async () => {
    vi.spyOn(api, 'listProjects').mockResolvedValue([buildProjectDto()]);

    const source = await useProjectStore.getState().fetchProjects();

    expect(source).toBe('live');
    expect(useProjectStore.getState().projects).toEqual([
      expect.objectContaining({
        id: 'proj-alpha',
        nomosId: 'agora/default',
        repoPath: '/tmp/proj-alpha',
      }),
    ]);
    expect(useProjectStore.getState().loading).toBe(false);
    expect(useProjectStore.getState().error).toBeNull();
  });

  it('records fetch errors and clears stale project lists', async () => {
    useProjectStore.setState({
      projects: [{ id: 'stale', name: 'Stale', summary: '', owner: 'archon', status: 'active', nomosId: null, repoPath: null, createdAt: '', updatedAt: '' }],
    });
    vi.spyOn(api, 'listProjects').mockRejectedValue(new Error('projects offline'));

    const source = await useProjectStore.getState().fetchProjects();

    expect(source).toBe('error');
    expect(useProjectStore.getState().projects).toEqual([]);
    expect(useProjectStore.getState().error).toContain('projects offline');
  });

  it('creates a project and keeps the newest mapped item at the front', async () => {
    useProjectStore.setState({
      projects: [{ id: 'proj-alpha', name: 'Old Alpha', summary: '', owner: 'archon', status: 'active', nomosId: null, repoPath: null, createdAt: '', updatedAt: '' }],
    });
    vi.spyOn(api, 'createProject').mockResolvedValue(buildProjectDto({ name: 'Project Alpha Fresh' }));

    const created = await useProjectStore.getState().createProject({
      name: 'Project Alpha Fresh',
      owner: 'archon',
      summary: 'Fresh',
      nomos_id: 'agora/default',
    });

    expect(created.name).toBe('Project Alpha Fresh');
    expect(useProjectStore.getState().projects).toHaveLength(1);
    expect(useProjectStore.getState().projects[0]?.name).toBe('Project Alpha Fresh');
    expect(api.createProject).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Project Alpha Fresh',
      nomos_id: 'agora/default',
    }));
    expect(useProjectStore.getState().creating).toBe(false);
  });

  it('selects a project and hydrates nomos plus the grouped workbench bundle', async () => {
    vi.spyOn(api, 'getProjectNomosState').mockResolvedValue({
      project_id: 'proj-alpha',
      project_name: 'Project Alpha',
      nomos_id: 'agora/default',
      activation_status: 'active_builtin',
      project_state_root: '/tmp/state',
      profile_path: '/tmp/state/profile.toml',
      profile_installed: true,
      repo_path: '/tmp/proj-alpha',
      repo_shim_installed: false,
      bootstrap_prompts_dir: '/tmp/state/prompts',
      lifecycle_modules: ['bootstrap'],
      draft_root: '/tmp/state/nomos/project-nomos',
      draft_profile_path: '/tmp/state/nomos/project-nomos/profile.toml',
      draft_profile_installed: true,
      active_root: '/tmp/state',
      active_profile_path: '/tmp/state/profile.toml',
      active_profile_installed: true,
    });
    vi.spyOn(api, 'getProjectWorkbench').mockResolvedValue(buildProjectWorkbenchDto());
    const listTasksSpy = vi.spyOn(api, 'listTasks').mockResolvedValue([buildTaskDto()]);
    const listTodosSpy = vi.spyOn(api, 'listTodos').mockResolvedValue([buildTodoDto()]);

    await useProjectStore.getState().selectProject('proj-alpha');

    expect(useProjectStore.getState().selectedProjectId).toBe('proj-alpha');
    expect(useProjectStore.getState().selectedProject).toEqual(expect.objectContaining({
      project: expect.objectContaining({ id: 'proj-alpha' }),
      nomos: expect.objectContaining({ nomosId: 'agora/default' }),
      overview: expect.objectContaining({
        stats: expect.objectContaining({
          taskCount: 1,
          todoCount: 1,
        }),
      }),
      tasks: [expect.objectContaining({ id: 'OC-123' })],
      todos: [expect.objectContaining({ id: 1 })],
    }));
    expect(listTasksSpy).not.toHaveBeenCalled();
    expect(listTodosSpy).not.toHaveBeenCalled();
    expect(useProjectStore.getState().detailLoading).toBe(false);
  });

  it('clears selected project state when selection is reset or detail loading fails', async () => {
    useProjectStore.setState({
      selectedProjectId: 'proj-alpha',
      selectedProject: {
        project: { id: 'proj-alpha', name: 'Project Alpha', summary: '', owner: 'archon', status: 'active', nomosId: null, repoPath: null, createdAt: '', updatedAt: '' },
        nomos: null,
        overview: {
          status: 'active',
          owner: 'archon',
          updatedAt: '',
          stats: {
            knowledgeCount: 0,
            citizenCount: 0,
            recapCount: 0,
            taskCount: 0,
            activeTaskCount: 0,
            reviewTaskCount: 0,
            todoCount: 0,
            pendingTodoCount: 0,
          },
        },
        surfaces: {
          index: null,
          timeline: null,
        },
        work: {
          tasks: [],
          todos: [],
          recaps: [],
          knowledge: [],
        },
        operator: {
          nomosId: null,
          repoPath: null,
          citizens: [],
        },
        index: null,
        timeline: null,
        recaps: [],
        knowledge: [],
        citizens: [],
        tasks: [],
        todos: [],
      },
    });

    await useProjectStore.getState().selectProject(null);
    expect(useProjectStore.getState().selectedProjectId).toBeNull();
    expect(useProjectStore.getState().selectedProject).toBeNull();

    vi.spyOn(api, 'getProjectNomosState').mockRejectedValue(new Error('detail failed'));
    vi.spyOn(api, 'getProjectWorkbench').mockResolvedValue(buildProjectWorkbenchDto());

    await useProjectStore.getState().selectProject('proj-alpha');

    expect(useProjectStore.getState().selectedProject).toBeNull();
    expect(useProjectStore.getState().error).toContain('detail failed');
    expect(useProjectStore.getState().detailLoading).toBe(false);
  });

  it('clears surfaced errors on demand', () => {
    useProjectStore.setState({ error: 'stale error' });

    useProjectStore.getState().clearError();

    expect(useProjectStore.getState().error).toBeNull();
  });
});
