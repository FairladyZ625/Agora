import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '@/App';
import { setLocale } from '@/lib/i18n';
import { ProjectDetailPage } from '@/pages/ProjectDetailPage';

const taskStoreState = {
  tasks: [
    {
      id: 'OC-001',
      version: 1,
      title: 'API 收口',
      description: '任务一',
      type: 'coding',
      priority: 'high',
      creator: 'archon',
      state: 'in_progress',
      current_stage: 'develop',
      teamLabel: 'opus / sonnet',
      workflowLabel: 'discuss-execute-review',
      memberCount: 2,
      isReviewStage: false,
      sourceState: 'active',
      scheduler: null,
      scheduler_snapshot: null,
      discord: null,
      metrics: null,
      error_detail: null,
      created_at: '2026-03-07T00:00:00.000Z',
      updated_at: '2026-03-07T01:00:00.000Z',
    },
  ],
  loading: false,
  detailLoading: false,
  error: null,
  selectedTaskId: null,
  selectedTaskStatus: null,
  filters: { state: null, search: '' },
  fetchTasks: vi.fn(async () => 'live'),
  selectTask: vi.fn(async () => undefined),
  resolveReview: vi.fn(async () => 'live'),
  createTask: vi.fn(async () => ({ id: 'OC-009' })),
  runTaskAction: vi.fn(async () => 'live'),
  observeCraftsmen: vi.fn(async () => 'live'),
  probeCraftsmanExecution: vi.fn(async () => 'live'),
  sendCraftsmanInputText: vi.fn(async () => 'live'),
  sendCraftsmanInputKeys: vi.fn(async () => 'live'),
  submitCraftsmanChoice: vi.fn(async () => 'live'),
  closeSubtask: vi.fn(async () => 'live'),
  archiveSubtask: vi.fn(async () => 'live'),
  cancelSubtask: vi.fn(async () => 'live'),
  cleanupTasks: vi.fn(async () => 0),
  setFilters: vi.fn(),
  clearError: vi.fn(),
};

vi.mock('@/stores/taskStore', () => ({
  useTaskStore: (selector?: (state: typeof taskStoreState) => unknown) =>
    selector ? selector(taskStoreState) : taskStoreState,
}));

const projectStoreState = {
  projects: [],
  selectedProject: {
    project: {
      id: 'proj-alpha',
      name: 'Project Alpha',
      summary: 'Stabilize the dashboard workbench.',
      owner: 'archon',
      status: 'active',
      nomosId: 'agora/default',
      repoPath: '/repo/proj-alpha',
      createdAt: '2026-03-16T00:00:00.000Z',
      updatedAt: '2026-03-16T01:00:00.000Z',
    },
    nomos: {
      nomosId: 'agora/default',
      activationStatus: 'active_builtin',
      projectStateRoot: '/Users/example/.agora/projects/proj-alpha',
      profilePath: '/Users/example/.agora/projects/proj-alpha/profile.toml',
      profileInstalled: true,
      repoPath: '/repo/proj-alpha',
      repoShimInstalled: true,
      bootstrapPromptsDir: '/Users/example/.agora/projects/proj-alpha/bootstrap',
      lifecycleModules: ['project-bootstrap'],
      draftRoot: '/Users/example/.agora/projects/proj-alpha/nomos/project-nomos',
      draftProfilePath: '/Users/example/.agora/projects/proj-alpha/nomos/project-nomos/profile.toml',
      draftProfileInstalled: true,
      activeRoot: '/Users/example/.agora/projects/proj-alpha',
      activeProfilePath: '/Users/example/.agora/projects/proj-alpha/profile.toml',
      activeProfileInstalled: true,
    },
    overview: {
      status: 'active',
      owner: 'archon',
      updatedAt: '2026-03-16T01:00:00.000Z',
      stats: {
        knowledgeCount: 1,
        citizenCount: 1,
        recapCount: 1,
        taskCount: 1,
        activeTaskCount: 1,
        reviewTaskCount: 0,
        todoCount: 1,
        pendingTodoCount: 1,
      },
    },
    surfaces: {
      index: {
        kind: 'index',
        slug: 'index',
        title: 'Project Alpha',
        path: '/brain/projects/proj-alpha/index.md',
        content: '# Project Alpha\n\nWorkbench cleanup.',
        updatedAt: '2026-03-16T01:00:00.000Z',
      },
      timeline: {
        kind: 'timeline',
        slug: 'timeline',
        title: 'Project Alpha Timeline',
        path: '/brain/projects/proj-alpha/timeline.md',
        content: '# Timeline\n\n- 2026-03-16 | task_recap | OC-100',
        sourceTaskIds: ['OC-100'],
        updatedAt: '2026-03-16T01:30:00.000Z',
      },
    },
    work: {
      tasks: [{ id: 'OC-100', title: 'Workbench cleanup', state: 'in_progress', projectId: 'proj-alpha' }],
      todos: [{ id: 3, text: '收口 Project 页面', status: 'pending', projectId: 'proj-alpha' }],
      recaps: [{ taskId: 'OC-100', title: 'Cleanup recap', summaryPath: '/brain/projects/proj-alpha/recaps/OC-100.md', content: '# recap', updatedAt: '2026-03-16T01:00:00.000Z' }],
      knowledge: [{ kind: 'decision', slug: 'ia', title: 'Workbench IA', path: '/brain/projects/proj-alpha/knowledge/decisions/ia.md', content: 'Use four sections.', sourceTaskIds: ['OC-100'], updatedAt: '2026-03-16T01:00:00.000Z' }],
    },
    operator: {
      nomosId: 'agora/default',
      repoPath: '/repo/proj-alpha',
      citizens: [{
        citizenId: 'citizen-alpha',
        roleId: 'architect',
        displayName: 'Alpha Architect',
        status: 'active',
        persona: 'Think in systems.',
        boundaries: ['Keep adapters outside core.'],
        skillsRef: [],
        channelPolicies: {},
        brainScaffoldMode: 'role_default',
        runtimeAdapter: 'openclaw',
        runtimeMetadata: {},
      }],
    },
    index: null,
    timeline: null,
    recaps: [],
    knowledge: [],
    citizens: [],
    tasks: [],
    todos: [],
  },
  loading: false,
  detailLoading: false,
  error: null,
  fetchProjects: vi.fn(async () => 'live'),
  createProject: vi.fn(async () => ({ id: 'proj-alpha' })),
  selectProject: vi.fn(async () => undefined),
  clearError: vi.fn(),
};

vi.mock('@/stores/projectStore', () => ({
  useProjectStore: (selector?: (state: typeof projectStoreState) => unknown) =>
    selector ? selector(projectStoreState) : projectStoreState,
}));

vi.mock('@/stores/todoStore', () => ({
  useTodoStore: (selector?: (state: {
    updateTodo: () => Promise<void>;
    deleteTodo: () => Promise<void>;
    promoteTodo: () => Promise<void>;
  }) => unknown) => {
    const state = {
      updateTodo: vi.fn(async () => undefined),
      deleteTodo: vi.fn(async () => undefined),
      promoteTodo: vi.fn(async () => undefined),
    };
    return selector ? selector(state) : state;
  },
}));

vi.mock('@/stores/themeStore', () => ({
  useThemeStore: () => ({
    mode: 'system',
    resolved: 'light',
    setMode: vi.fn(),
  }),
}));

vi.mock('@/stores/settingsStore', () => ({
  useSettingsStore: () => ({
    apiBase: '/api',
    apiToken: '',
    refreshInterval: 5,
    pauseOnHidden: true,
    setApiConfig: vi.fn(),
    setRefreshInterval: vi.fn(),
    setPauseOnHidden: vi.fn(),
  }),
}));

vi.mock('@/stores/feedbackStore', () => ({
  useFeedbackStore: () => ({
    showMessage: vi.fn(),
  }),
}));

vi.mock('@/stores/sessionStore', () => ({
  useSessionStore: (selector?: (state: {
    authenticated: boolean;
    status: string;
    username: string;
    role: string;
    refresh: () => Promise<string>;
    logout: () => Promise<void>;
    error: string | null;
  }) => unknown) => {
    const state = {
      authenticated: true,
      status: 'ready',
      username: 'admin',
      role: 'admin',
      refresh: vi.fn(async () => 'live'),
      logout: vi.fn(async () => undefined),
      error: null,
    };
    return selector ? selector(state) : state;
  },
}));

describe('dashboard English UI', () => {
  beforeEach(async () => {
    await setLocale('en-US');
  });

  it('renders English shell and board copy', () => {
    render(
      <MemoryRouter initialEntries={['/board']}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /overview/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Task Board' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh workspace' })).toBeInTheDocument();
    expect(screen.getAllByText('Agora').length).toBeGreaterThan(0);
    expect(screen.getByText('System clock')).toBeInTheDocument();
  });

  it('renders English create task copy while preserving task data as-is', () => {
    render(
      <MemoryRouter initialEntries={['/tasks/new']}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Create Task' })).toBeInTheDocument();
    expect(screen.getByLabelText('Task title')).toHaveAttribute('placeholder', 'For example: implement user authentication');
    expect(screen.getByRole('button', { name: 'Create task' })).toBeInTheDocument();
  });

  it('renders English settings copy including language preferences', () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Connections, cadence, and appearance' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Language preference' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'English' })).toBeInTheDocument();
  });

  it('renders English project detail IA with operator workspace links kept out of the main work panels', () => {
    render(
      <MemoryRouter initialEntries={['/projects/proj-alpha']}>
        <Routes>
          <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Project overview' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Project surfaces' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Current work' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Operator' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Operator 1 citizens and Nomos controls moved into the operator workspace\./ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review Draft' })).not.toBeInTheDocument();
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });
});
