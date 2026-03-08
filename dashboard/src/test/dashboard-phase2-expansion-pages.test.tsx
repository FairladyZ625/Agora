import { MemoryRouter } from 'react-router';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from '@/App';

const agentStoreState = {
  summary: { activeTasks: 1, activeAgents: 1, totalAgents: 2, onlineAgents: 1, staleAgents: 1, disconnectedAgents: 0, busyCraftsmen: 1 },
  agents: [
    {
      id: 'sonnet',
      role: 'developer',
      status: 'busy',
      presence: 'online',
      presenceReason: 'live_session',
      source: 'openclaw',
      primaryModel: 'gac/claude-sonnet-4-6',
      workspaceDir: '/tmp/sonnet',
      provider: 'discord',
      accountId: 'sonnet',
      taskCount: 1,
      subtaskCount: 1,
      load: 1,
      activeTaskIds: ['OC-101'],
      activeSubtaskIds: ['dev-api'],
      lastActiveAt: null,
      lastSeenAt: '2026-03-08T10:00:00.000Z',
    },
  ],
  craftsmen: [],
  loading: false,
  error: null,
  fetchStatus: vi.fn(async () => 'live'),
  clearError: vi.fn(),
};

const archiveStoreState = {
  jobs: [
    {
      id: 7,
      taskId: 'OC-301',
      taskTitle: '归档日报',
      taskType: 'document',
      status: 'failed',
      targetPath: 'ZeYu-AI-Brain/docs/',
      writerAgent: 'writer-agent',
      commitHash: null,
      requestedAt: '2026-03-07T08:00:00.000Z',
      completedAt: null,
      payload: { error_message: 'timeout' },
      payloadSummary: 'timeout',
      canRetry: true,
    },
  ],
  selectedJobId: 7,
  selectedJob: {
    id: 7,
    taskId: 'OC-301',
    taskTitle: '归档日报',
    taskType: 'document',
    status: 'failed',
    targetPath: 'ZeYu-AI-Brain/docs/',
    writerAgent: 'writer-agent',
    commitHash: null,
    requestedAt: '2026-03-07T08:00:00.000Z',
    completedAt: null,
    payload: { error_message: 'timeout' },
    payloadSummary: 'timeout',
    canRetry: true,
  },
  loading: false,
  detailLoading: false,
  error: null,
  filters: { status: null, taskId: '' },
  fetchJobs: vi.fn(async () => 'live'),
  selectJob: vi.fn(async () => undefined),
  retryJob: vi.fn(async () => undefined),
  setFilters: vi.fn(),
  clearError: vi.fn(),
};

const todoStoreState = {
  todos: [
    {
      id: 4,
      text: '补前端页面',
      status: 'pending',
      due: null,
      createdAt: '2026-03-07T10:00:00.000Z',
      completedAt: null,
      tags: ['dashboard'],
      tagLabel: 'dashboard',
      promotedTo: null,
    },
  ],
  loading: false,
  error: null,
  filter: 'all' as const,
  fetchTodos: vi.fn(async () => 'live'),
  createTodo: vi.fn(async () => undefined),
  updateTodo: vi.fn(async () => undefined),
  deleteTodo: vi.fn(async () => undefined),
  promoteTodo: vi.fn(async () => ({ task: { id: 'OC-401' } })),
  setFilter: vi.fn(),
  clearError: vi.fn(),
};

const templateStoreState = {
  templates: [
    {
      id: 'coding',
      name: 'Coding Task',
      type: 'coding',
      description: '实现代码任务',
      governance: 'archon',
      stageCount: 4,
      stageCountLabel: '4 stages',
    },
  ],
  selectedTemplateId: 'coding',
  selectedTemplate: {
    id: 'coding',
    name: 'Coding Task',
    type: 'coding',
    description: '实现代码任务',
    governance: 'archon',
    stageCount: 2,
    stages: [
      { id: 'discuss', name: '讨论', mode: 'discuss', gateType: null },
      { id: 'develop', name: '开发', mode: 'execute', gateType: null },
    ],
    defaultTeamRoles: ['architect'],
    raw: {},
  },
  loading: false,
  detailLoading: false,
  error: null,
  fetchTemplates: vi.fn(async () => 'live'),
  selectTemplate: vi.fn(async () => undefined),
  clearError: vi.fn(),
};

const taskStoreState = {
  tasks: [],
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
  cleanupTasks: vi.fn(async () => 0),
  setFilters: vi.fn(),
  clearError: vi.fn(),
};

vi.mock('@/stores/agentStore', () => ({
  useAgentStore: (selector?: (state: typeof agentStoreState) => unknown) =>
    selector ? selector(agentStoreState) : agentStoreState,
}));

vi.mock('@/stores/archiveStore', () => ({
  useArchiveStore: (selector?: (state: typeof archiveStoreState) => unknown) =>
    selector ? selector(archiveStoreState) : archiveStoreState,
}));

vi.mock('@/stores/todoStore', () => ({
  useTodoStore: (selector?: (state: typeof todoStoreState) => unknown) =>
    selector ? selector(todoStoreState) : todoStoreState,
}));

vi.mock('@/stores/templateStore', () => ({
  useTemplateStore: (selector?: (state: typeof templateStoreState) => unknown) =>
    selector ? selector(templateStoreState) : templateStoreState,
}));

vi.mock('@/stores/taskStore', () => ({
  useTaskStore: (selector?: (state: typeof taskStoreState) => unknown) =>
    selector ? selector(taskStoreState) : taskStoreState,
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

describe('dashboard expansion routes', () => {
  it('renders the agent status page on the dedicated route', () => {
    render(
      <MemoryRouter initialEntries={['/agents']}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Agent 状态' })).toBeInTheDocument();
    expect(screen.getByText('sonnet')).toBeInTheDocument();
    expect(screen.getByText(/Agent 总数/i)).toBeInTheDocument();
    expect(screen.getAllByText('online').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/在线 Agent/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Provider 摘要/i)).toBeInTheDocument();
  });

  it('filters the agent list by presence view', () => {
    agentStoreState.agents.push({
      id: 'review',
      role: 'reviewer',
      status: 'idle',
      presence: 'stale',
      presenceReason: 'stale_gateway_log',
      source: 'discord',
      primaryModel: 'n/a',
      workspaceDir: 'n/a',
      provider: 'discord',
      accountId: 'review',
      taskCount: 0,
      subtaskCount: 0,
      load: 0,
      activeTaskIds: [],
      activeSubtaskIds: [],
      lastActiveAt: null,
      lastSeenAt: '2026-03-08T09:30:00.000Z',
    });

    render(
      <MemoryRouter initialEntries={['/agents']}>
        <App />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'stale' }));

    expect(screen.getByText('review')).toBeInTheDocument();
    expect(screen.queryByText('sonnet')).not.toBeInTheDocument();
  });

  it('renders the todo workspace on the dedicated route', () => {
    render(
      <MemoryRouter initialEntries={['/todos']}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Todo 工作区' })).toBeInTheDocument();
    expect(screen.getByText('补前端页面')).toBeInTheDocument();
  });

  it('renders the archive workspace on the dedicated route', () => {
    render(
      <MemoryRouter initialEntries={['/archive']}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Archive Jobs' })).toBeInTheDocument();
    expect(screen.getByText('归档日报')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重试归档' })).toBeInTheDocument();
  });

  it('renders the templates explorer on the dedicated route', () => {
    render(
      <MemoryRouter initialEntries={['/templates']}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: '模板管理' })).toBeInTheDocument();
    expect(screen.getAllByText('Coding Task').length).toBeGreaterThan(0);
    expect(screen.getByText('architect')).toBeInTheDocument();
  });
});
