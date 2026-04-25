import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { SystemPage } from '@/pages/SystemPage';

const apiMocks = vi.hoisted(() => ({
  listRuntimeTargets: vi.fn(async () => ([
    {
      runtimeTargetRef: 'cc-connect:agora-claude',
      inventoryKind: 'runtime_target',
      runtimeProvider: 'cc-connect',
      runtimeFlavor: 'coding',
      hostFramework: 'cc-connect',
      primaryModel: 'claude-sonnet',
      workspaceDir: '/tmp/agora',
      channelProviders: ['discord'],
      inventorySources: ['config'],
      discordBotUserIds: [],
      enabled: true,
      displayName: 'Claude Dispatch',
      tags: ['coding'],
      allowedProjects: [],
      defaultRoles: ['developer'],
      presentationMode: 'im_presented',
      presentationProvider: 'discord',
      presentationIdentityRef: 'bot-1',
      metadata: null,
      discovered: true,
    },
    {
      runtimeTargetRef: 'local:codex-headless',
      inventoryKind: 'runtime_target',
      runtimeProvider: 'local',
      runtimeFlavor: 'review',
      hostFramework: 'codex',
      primaryModel: 'gpt',
      workspaceDir: '/tmp/agora',
      channelProviders: [],
      inventorySources: ['overlay'],
      discordBotUserIds: [],
      enabled: false,
      displayName: 'Codex Headless',
      tags: ['review'],
      allowedProjects: ['proj-agora'],
      defaultRoles: ['reviewer'],
      presentationMode: 'headless',
      presentationProvider: null,
      presentationIdentityRef: null,
      metadata: null,
      discovered: false,
    },
  ])),
  listCcConnectBridges: vi.fn(async () => ([
    {
      platform: 'discord',
      project: 'proj-agora',
      capabilities: ['send', 'thread'],
      connected_at: '2026-04-24T06:00:00.000Z',
    },
  ])),
  listTemplates: vi.fn(async () => ([
    {
      id: 'flow_editor',
      name: 'Flow Editor',
      type: 'workflow',
      description: 'Graph authoring workflow',
      governance: null,
      stage_count: 3,
    },
  ])),
}));

const taskStoreState = {
  healthSnapshot: {
    tasks: { status: 'healthy', totalTasks: 12 },
    runtime: { status: 'healthy', activeSessions: 2 },
    craftsman: { status: 'healthy' },
    im: { status: 'healthy', activeBindings: 1 },
    host: { status: 'healthy' },
  },
  governanceSnapshot: {
    hostPressureStatus: 'healthy',
  },
  fetchTasks: vi.fn(async () => 'live'),
};

const agentStoreState = {
  summary: {
    activeTasks: 2,
    activeAgents: 2,
    totalAgents: 3,
    onlineAgents: 2,
    staleAgents: 1,
    disconnectedAgents: 0,
    busyCraftsmen: 1,
  },
  channelSummaries: [
    {
      channel: 'discord:proj-agora',
      totalAgents: 2,
      busyAgents: 1,
      onlineAgents: 2,
      staleAgents: 0,
      disconnectedAgents: 0,
      offlineAgents: 0,
      overallPresence: 'online',
      lastSeenAt: null,
      presenceReason: null,
      affectedAgents: [],
      history: [],
      signalStatus: 'healthy',
      lastSignalAt: null,
      signalCounts: {
        readyEvents: 1,
        restartEvents: 0,
        transportErrors: 0,
      },
      signals: [],
    },
  ],
  craftsmanRuntime: {
    slots: [
      { agent: 'codex', status: 'running' },
      { agent: 'claude', status: 'idle' },
    ],
  },
  error: null,
  fetchStatus: vi.fn(async () => 'live'),
};

vi.mock('@/lib/api', () => ({
  listRuntimeTargets: apiMocks.listRuntimeTargets,
  listCcConnectBridges: apiMocks.listCcConnectBridges,
  listTemplates: apiMocks.listTemplates,
}));

vi.mock('@/stores/taskStore', () => ({
  useTaskStore: (selector?: (state: typeof taskStoreState) => unknown) =>
    selector ? selector(taskStoreState) : taskStoreState,
}));

vi.mock('@/stores/agentStore', () => ({
  useAgentStore: (selector?: (state: typeof agentStoreState) => unknown) =>
    selector ? selector(agentStoreState) : agentStoreState,
}));

describe('system capability surface', () => {
  beforeEach(() => {
    apiMocks.listRuntimeTargets.mockClear();
    apiMocks.listCcConnectBridges.mockClear();
    apiMocks.listTemplates.mockClear();
    taskStoreState.fetchTasks.mockClear();
    agentStoreState.fetchStatus.mockClear();
  });

  it('renders the system capability control surface from live system sources', async () => {
    render(
      <MemoryRouter>
        <SystemPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /系统能力面|System capabilities/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /派发优先级|Dispatch precedence/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /系统健康|System health/i })).toBeInTheDocument();

    expect(await screen.findByText('Claude Dispatch')).toBeInTheDocument();
    expect(screen.getAllByText('Codex Headless').length).toBeGreaterThan(0);
    expect(screen.getByText(/proj-agora \/ discord/i)).toBeInTheDocument();
    expect(screen.getByText('Flow Editor')).toBeInTheDocument();
    expect(screen.getAllByText(/Runtime overrides|运行目标覆盖/i).length).toBeGreaterThan(0);

    const nav = screen.getByRole('navigation', { name: /系统能力导航|System capability navigation/i });
    expect(within(nav).getAllByRole('link')).toHaveLength(7);

    expect(screen.getByRole('link', { name: /查看全部目标|View all targets/i })).toHaveAttribute('href', '/runtime-targets');
    expect(screen.getByRole('link', { name: /查看全部桥接|View all bridges/i })).toHaveAttribute('href', '/bridges');
    expect(screen.getByRole('link', { name: /查看全部模板|View all templates/i })).toHaveAttribute('href', '/templates');
    expect(screen.getByRole('link', { name: /Flow Editor/i })).toHaveAttribute('href', '/templates/flow_editor/graph');
    expect(apiMocks.listRuntimeTargets).toHaveBeenCalledTimes(1);
    expect(apiMocks.listCcConnectBridges).toHaveBeenCalledTimes(1);
    expect(apiMocks.listTemplates).toHaveBeenCalledTimes(1);
    expect(taskStoreState.fetchTasks).toHaveBeenCalledTimes(1);
    expect(agentStoreState.fetchStatus).toHaveBeenCalledTimes(1);
  });
});
