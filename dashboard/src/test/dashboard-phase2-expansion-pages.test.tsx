import { useSyncExternalStore } from 'react';
import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '@/App';

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

const agentStoreState = {
  summary: { activeTasks: 1, activeAgents: 1, totalAgents: 2, onlineAgents: 1, staleAgents: 1, disconnectedAgents: 0, busyCraftsmen: 1 },
  channelSummaries: [
    {
      channel: 'discord',
      totalAgents: 2,
      busyAgents: 1,
      onlineAgents: 1,
      staleAgents: 1,
      disconnectedAgents: 0,
      offlineAgents: 0,
      overallPresence: 'stale',
      lastSeenAt: '2026-03-08T10:00:00.000Z',
      presenceReason: 'stale_gateway_log',
      affectedAgents: [
        {
          id: 'review',
          status: 'idle',
          presence: 'stale',
          presenceReason: 'stale_gateway_log',
          lastSeenAt: '2026-03-08T09:30:00.000Z',
          accountId: 'review',
        },
      ],
      history: [
        {
          occurredAt: '2026-03-08T09:30:00.000Z',
          agentId: 'review',
          accountId: 'review',
          presence: 'stale',
          reason: 'stale_gateway_log',
        },
      ],
      signalStatus: 'degraded',
      lastSignalAt: '2026-03-08T09:35:00.000Z',
      signalCounts: {
        readyEvents: 1,
        restartEvents: 1,
        transportErrors: 1,
      },
      signals: [
        {
          occurredAt: '2026-03-08T09:35:00.000Z',
          channel: 'discord',
          agentId: 'review',
          accountId: 'review',
          kind: 'transport_error',
          severity: 'error',
          detail: 'code 1005',
        },
      ],
    },
  ],
  channelDetails: {
    discord: {
      channel: 'discord',
      totalAgents: 2,
      busyAgents: 1,
      onlineAgents: 1,
      staleAgents: 1,
      disconnectedAgents: 0,
      offlineAgents: 0,
      overallPresence: 'stale',
      lastSeenAt: '2026-03-08T10:00:00.000Z',
      presenceReason: 'stale_gateway_log',
      affectedAgents: [
        {
          id: 'review',
          status: 'idle',
          presence: 'stale',
          presenceReason: 'stale_gateway_log',
          lastSeenAt: '2026-03-08T09:30:00.000Z',
          accountId: 'review',
        },
      ],
      history: [
        {
          occurredAt: '2026-03-08T09:30:00.000Z',
          agentId: 'review',
          accountId: 'review',
          presence: 'stale',
          reason: 'stale_gateway_log',
        },
      ],
      signalStatus: 'degraded',
      lastSignalAt: '2026-03-08T09:35:00.000Z',
      signalCounts: {
        readyEvents: 1,
        restartEvents: 1,
        transportErrors: 1,
      },
      signals: [
        {
          occurredAt: '2026-03-08T09:35:00.000Z',
          channel: 'discord',
          agentId: 'review',
          accountId: 'review',
          kind: 'transport_error',
          severity: 'error',
          detail: 'code 1005',
        },
      ],
    },
  },
  channelDetailFetchedAt: {
    discord: Date.parse('2026-03-08T10:00:00.000Z'),
  },
  hostSummaries: [
    {
      host: 'openclaw',
      totalAgents: 1,
      busyAgents: 1,
      onlineAgents: 1,
      staleAgents: 0,
      disconnectedAgents: 0,
      offlineAgents: 0,
      overallPresence: 'online',
      lastSeenAt: '2026-03-08T10:00:00.000Z',
      presenceReason: 'live_session',
      affectedAgents: [
        {
          id: 'sonnet',
          status: 'busy',
          presence: 'online',
          presenceReason: 'live_session',
          lastSeenAt: '2026-03-08T10:00:00.000Z',
          accountId: 'sonnet',
        },
      ],
    },
  ],
  legacyRuntime: {
    session: 'agora-craftsmen',
    panes: [
      {
        agent: 'codex',
        paneId: '%0',
        currentCommand: 'bash',
        active: true,
        ready: true,
        tailPreview: 'tail:codex',
        continuityBackend: 'codex_session_file',
        resumeCapability: 'native_resume',
        sessionReference: 'codex-session-123',
        identitySource: 'session_file',
        identityPath: '/tmp/codex/session.json',
        sessionObservedAt: '2026-03-08T23:01:00.000Z',
        lastRecoveryMode: 'resume_exact',
        transportSessionId: 'tmux:agora-craftsmen:codex',
      },
    ],
  },
  runtimeTailByAgent: {
    codex: 'tail:codex',
  },
  agents: [
    {
      id: 'sonnet',
      role: 'developer',
      status: 'busy',
      presence: 'online',
      presenceReason: 'live_session',
      channelProviders: ['discord'],
      hostFramework: 'openclaw' as string | null,
      inventorySources: ['openclaw'],
      primaryModel: 'gac/claude-sonnet-4-6',
      workspaceDir: '/tmp/sonnet',
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
  craftsmen: [
    {
      id: 'codex',
      status: 'busy',
      taskId: 'OC-101',
      subtaskId: 'dev-api',
      title: '实现 API',
      runningSince: '2026-03-08T10:00:00.000Z',
      recentExecutions: [
        {
          executionId: 'exec-dashboard-1',
          status: 'running',
          sessionId: 'tmux:agora-craftsmen:codex',
          transport: 'tmux-pane',
          runtimeMode: 'tmux',
          startedAt: '2026-03-08T10:00:00.000Z',
        },
      ],
    },
  ],
  loading: false,
  channelDetailLoading: false,
  runtimeTailLoadingByAgent: {},
  error: null,
  channelDetailError: null,
  presenceFilter: 'all' as const,
  craftsmenFilter: 'all' as const,
  channelFilter: null as string | null,
  hostFilter: null as string | null,
  fetchStatus: vi.fn(async () => 'live'),
  fetchChannelDetail: vi.fn(async () => 'live'),
  fetchRuntimeTail: vi.fn(async () => 'live'),
  setPresenceFilter: vi.fn((filter) => {
    agentStoreState.presenceFilter = filter;
  }),
  setChannelFilter: vi.fn((channel) => {
    agentStoreState.channelFilter = channel;
  }),
  setHostFilter: vi.fn((host) => {
    agentStoreState.hostFilter = host;
  }),
  setCraftsmenFilter: vi.fn((filter) => {
    agentStoreState.craftsmenFilter = filter;
  }),
  clearError: vi.fn(),
};

const agentStoreListeners = new Set<() => void>();

function makeAgentStoreSnapshot() {
  return {
    ...agentStoreState,
    channelSummaries: [...agentStoreState.channelSummaries],
    channelDetails: { ...agentStoreState.channelDetails },
    channelDetailFetchedAt: { ...agentStoreState.channelDetailFetchedAt },
    hostSummaries: [...agentStoreState.hostSummaries],
    runtimeTailByAgent: { ...agentStoreState.runtimeTailByAgent },
    runtimeTailLoadingByAgent: { ...agentStoreState.runtimeTailLoadingByAgent },
    agents: [...agentStoreState.agents],
    craftsmen: [...agentStoreState.craftsmen],
  };
}

let agentStoreSnapshot = makeAgentStoreSnapshot();

function notifyAgentStore() {
  agentStoreSnapshot = makeAgentStoreSnapshot();
  for (const listener of agentStoreListeners) {
    listener();
  }
}

agentStoreState.setPresenceFilter.mockImplementation((filter) => {
  agentStoreState.presenceFilter = filter;
  notifyAgentStore();
});

agentStoreState.setChannelFilter.mockImplementation((channel) => {
  agentStoreState.channelFilter = channel;
  notifyAgentStore();
});

agentStoreState.setHostFilter.mockImplementation((host) => {
  agentStoreState.hostFilter = host;
  notifyAgentStore();
});

agentStoreState.setCraftsmenFilter.mockImplementation((filter) => {
  agentStoreState.craftsmenFilter = filter;
  notifyAgentStore();
});

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
      canConfirm: false,
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
    canConfirm: false,
    canRetry: true,
  },
  loading: false,
  detailLoading: false,
  error: null,
  filters: { status: null, taskId: '' },
  fetchJobs: vi.fn(async () => 'live'),
  selectJob: vi.fn(async () => undefined),
  confirmJob: vi.fn(async () => undefined),
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
      governance: 'standard',
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
    governance: 'standard',
    stageCount: 2,
    stages: [
      { id: 'discuss', name: '讨论', mode: 'discuss', gateType: null },
      { id: 'develop', name: '开发', mode: 'execute', gateType: null },
    ],
    defaultTeamRoles: ['architect'],
    defaultTeam: [{ role: 'architect', modelPreference: null, suggested: ['opus'] }],
    raw: {},
  },
  loading: false,
  detailLoading: false,
  saving: false,
  error: null,
  fetchTemplates: vi.fn(async () => 'live'),
  selectTemplate: vi.fn(async () => undefined),
  saveSelectedTemplate: vi.fn(async () => 'live'),
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

vi.mock('@/stores/agentStore', () => ({
  useAgentStore: (selector?: (state: typeof agentStoreState) => unknown) => {
    const snapshot = useSyncExternalStore(
      (listener) => {
        agentStoreListeners.add(listener);
        return () => agentStoreListeners.delete(listener);
      },
      () => agentStoreSnapshot,
      () => agentStoreSnapshot,
    );
    return selector ? selector(snapshot) : snapshot;
  },
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
  useSettingsStore: (selector?: (state: {
    apiBase: string;
    apiToken: string;
    refreshInterval: number;
    pauseOnHidden: boolean;
    setApiConfig: ReturnType<typeof vi.fn>;
    setRefreshInterval: ReturnType<typeof vi.fn>;
    setPauseOnHidden: ReturnType<typeof vi.fn>;
  }) => unknown) => {
    const state = {
      apiBase: '/api',
      apiToken: '',
      refreshInterval: 5,
      pauseOnHidden: true,
      setApiConfig: vi.fn(),
      setRefreshInterval: vi.fn(),
      setPauseOnHidden: vi.fn(),
    };
    return selector ? selector(state) : state;
  },
}));

vi.mock('@/stores/feedbackStore', () => ({
  useFeedbackStore: () => ({
    showMessage: vi.fn(),
  }),
}));

describe('dashboard expansion routes', () => {
  beforeEach(() => {
    agentStoreState.fetchStatus.mockClear();
    agentStoreState.fetchChannelDetail.mockClear();
    agentStoreState.fetchRuntimeTail.mockClear();
    agentStoreState.presenceFilter = 'all';
    agentStoreState.craftsmenFilter = 'all';
    agentStoreState.channelFilter = null;
    agentStoreState.hostFilter = null;
    agentStoreState.channelDetailFetchedAt.discord = Date.parse('2026-03-08T10:00:00.000Z');
    agentStoreState.agents.splice(1);
    agentStoreState.craftsmen.splice(1);
    agentStoreSnapshot = makeAgentStoreSnapshot();
  });

  afterEach(() => {
    try {
      vi.getTimerCount();
      act(() => {
        vi.runOnlyPendingTimers();
      });
    } catch {
      // Some cases in this suite use real timers; only flush when fake timers are active.
    }
    vi.useRealTimers();
  });

  it('renders the agent status page on the dedicated route', () => {
    render(
      <MemoryRouter initialEntries={['/agents']}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: '运行态' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Agent Agent 列表/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Channel Channel 健康/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Execution 执行运行态/i })).toBeInTheDocument();
    expect(screen.getAllByText(/agora-craftsmen/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/discord/i).length).toBeGreaterThan(0);
  });

  it('filters craftsmen cards by failure-focused view', () => {
    agentStoreState.craftsmen.push({
      id: 'gemini',
      status: 'failed',
      taskId: 'OC-102',
      subtaskId: 'qa-review',
      title: 'QA Review',
      runningSince: '2026-03-08T10:10:00.000Z',
      recentExecutions: [
        {
          executionId: 'exec-failed-1',
          status: 'failed',
          sessionId: 'watcher:123',
          transport: 'process-callback-runner',
          runtimeMode: 'watched',
          startedAt: '2026-03-08T10:10:00.000Z',
        },
      ],
    });
    notifyAgentStore();

    render(
      <MemoryRouter initialEntries={['/agents']}>
        <App />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Execution 执行运行态/i }));
    fireEvent.click(screen.getByRole('button', { name: 'failures' }));

    expect(screen.getByText(/exec-failed-1/i)).toBeInTheDocument();
    expect(screen.queryByText(/exec-dashboard-1/i)).not.toBeInTheDocument();
  });

  it('orders craftsmen cards with failures first in the default view', () => {
    agentStoreState.craftsmen.push({
      id: 'gemini',
      status: 'failed',
      taskId: 'OC-102',
      subtaskId: 'qa-review',
      title: 'QA Review',
      runningSince: '2026-03-08T10:10:00.000Z',
      recentExecutions: [
        {
          executionId: 'exec-failed-1',
          status: 'failed',
          sessionId: 'watcher:123',
          transport: 'process-callback-runner',
          runtimeMode: 'watched',
          startedAt: '2026-03-08T10:10:00.000Z',
        },
      ],
    });
    notifyAgentStore();

    render(
      <MemoryRouter initialEntries={['/agents']}>
        <App />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Execution 执行运行态/i }));
    const executionRows = screen.getAllByText(/exec-(dashboard|failed)-1/i);
    expect(executionRows[0]).toHaveTextContent('exec-failed-1');
    expect(executionRows[1]).toHaveTextContent('exec-dashboard-1');
  });

  it('orders recent executions inside a craftsmen card with failures first', () => {
    agentStoreState.craftsmen[0] = {
      ...agentStoreState.craftsmen[0],
      recentExecutions: [
        {
          executionId: 'exec-running-2',
          status: 'running',
          sessionId: 'tmux:agora-craftsmen:codex',
          transport: 'tmux-pane',
          runtimeMode: 'tmux',
          startedAt: '2026-03-08T10:05:00.000Z',
        },
        {
          executionId: 'exec-failed-2',
          status: 'failed',
          sessionId: 'watcher:456',
          transport: 'process-callback-runner',
          runtimeMode: 'watched',
          startedAt: '2026-03-08T10:07:00.000Z',
        },
      ],
    };
    notifyAgentStore();

    render(
      <MemoryRouter initialEntries={['/agents']}>
        <App />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Execution 执行运行态/i }));
    const executionRows = screen.getAllByText(/exec-(running|failed)-2/i);
    expect(executionRows[0]).toHaveTextContent('exec-failed-2');
    expect(executionRows[1]).toHaveTextContent('exec-running-2');
  });

  it('filters the agent list by presence view', () => {
    agentStoreState.agents.push({
      id: 'review',
      role: 'reviewer',
      status: 'idle',
      presence: 'stale',
      presenceReason: 'stale_gateway_log',
      channelProviders: ['discord'],
      hostFramework: null,
      inventorySources: ['discord'],
      primaryModel: 'n/a',
      workspaceDir: 'n/a',
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

    fireEvent.click(screen.getByRole('button', { name: /Agent Agent 列表/i }));
    fireEvent.click(screen.getByRole('button', { name: 'stale' }));

    expect(screen.getAllByText('review').length).toBeGreaterThan(0);
    expect(screen.queryByText('sonnet')).not.toBeInTheDocument();
  });

  it('shows channel drill-down details for the selected channel', () => {
    render(
      <MemoryRouter initialEntries={['/agents']}>
        <App />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Channel Channel 健康/i }));
    fireEvent.click(screen.getAllByRole('button', { name: /discord/i })[1]);

    expect(screen.getByRole('heading', { name: 'Channel 健康' })).toBeInTheDocument();
    expect(screen.getAllByText(/stale_gateway_log/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/review/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/摘要/i).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: '信号' }));
    expect(screen.getAllByText(/transport_error/i).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: '历史' }));
    expect(screen.getAllByText(/stale_gateway_log/i).length).toBeGreaterThan(0);
  });

  it('loads tmux tail on demand from the pane card', () => {
    render(
      <MemoryRouter initialEntries={['/agents']}>
        <App />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Execution 执行运行态/i }));
    fireEvent.click(screen.getByRole('button', { name: /加载输出/i }));

    expect(agentStoreState.fetchRuntimeTail).toHaveBeenCalledWith('codex');
  });

  it('polls summary refresh on the configured interval and pauses while hidden', () => {
    vi.useFakeTimers();
    render(
      <MemoryRouter initialEntries={['/agents']}>
        <App />
      </MemoryRouter>,
    );

    const initialCalls = agentStoreState.fetchStatus.mock.calls.length;
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(agentStoreState.fetchStatus.mock.calls.length).toBeGreaterThan(initialCalls);

    const hiddenDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    const beforeHiddenTick = agentStoreState.fetchStatus.mock.calls.length;
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(agentStoreState.fetchStatus.mock.calls.length).toBe(beforeHiddenTick);

    if (hiddenDescriptor) {
      Object.defineProperty(document, 'hidden', hiddenDescriptor);
    }
  });

  it('does not refetch channel detail on summary polling while cached detail is still fresh', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-08T10:00:05.000Z'));
    agentStoreState.channelFilter = 'discord';
    agentStoreState.channelDetailFetchedAt.discord = Date.parse('2026-03-08T10:00:00.000Z');
    notifyAgentStore();

    render(
      <MemoryRouter initialEntries={['/agents']}>
        <App />
      </MemoryRouter>,
    );

    const initialDetailCalls = agentStoreState.fetchChannelDetail.mock.calls.length;
    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    expect(agentStoreState.fetchStatus.mock.calls.length).toBeGreaterThan(0);
    expect(agentStoreState.fetchChannelDetail.mock.calls.length).toBe(initialDetailCalls);
  });

  it('refetches channel detail when the selected cached detail is stale', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-08T10:01:00.000Z'));
    agentStoreState.channelFilter = 'discord';
    agentStoreState.channelDetailFetchedAt.discord = Date.parse('2026-03-08T10:00:00.000Z');
    notifyAgentStore();

    render(
      <MemoryRouter initialEntries={['/agents']}>
        <App />
      </MemoryRouter>,
    );

    expect(agentStoreState.fetchChannelDetail).toHaveBeenCalledWith('discord');
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
