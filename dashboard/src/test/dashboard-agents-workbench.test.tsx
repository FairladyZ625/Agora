import { MemoryRouter } from 'react-router';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentsPage } from '@/pages/AgentsPage';

const fetchStatus = vi.fn(async () => 'live');
const fetchChannelDetail = vi.fn(async () => 'live');
const fetchRuntimeTail = vi.fn(async () => 'live');

const agentStoreState = {
  summary: {
    activeTasks: 1,
    activeAgents: 1,
    totalAgents: 2,
    onlineAgents: 1,
    staleAgents: 1,
    disconnectedAgents: 0,
    busyCraftsmen: 1,
  },
  agents: [
    {
      id: 'sonnet',
      role: 'developer',
      status: 'busy',
      presence: 'online',
      presenceReason: 'live_session',
      channelProviders: ['discord'],
      hostFramework: 'openclaw',
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
    {
      id: 'chronicle',
      role: 'writer',
      status: 'idle',
      presence: 'stale',
      presenceReason: 'stale_gateway_log',
      channelProviders: ['discord'],
      hostFramework: 'openclaw',
      inventorySources: ['openclaw'],
      primaryModel: 'gac/claude-haiku-4-5',
      workspaceDir: '/tmp/chronicle',
      accountId: 'chronicle',
      taskCount: 0,
      subtaskCount: 0,
      load: 0,
      activeTaskIds: [],
      activeSubtaskIds: [],
      lastActiveAt: null,
      lastSeenAt: '2026-03-08T09:30:00.000Z',
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
  craftsmanRuntime: {
    providers: [{ provider: 'tmux' as const, session: 'agora-craftsmen', slotCount: 1, readySlots: 1, activeSlots: 1 }],
    slots: [
      {
        provider: 'tmux' as const,
        agent: 'codex',
        sessionId: 'tmux:agora-craftsmen:codex',
        runtimeMode: 'tmux',
        transport: 'tmux-pane',
        status: 'running',
        ready: true,
        active: true,
        currentCommand: 'bash',
        tailPreview: 'tail:codex',
        sessionReference: 'codex-session-123',
        executionId: null,
        taskId: null,
        subtaskId: null,
        title: null,
      },
    ],
  },
  runtimeTailByAgent: {
    codex: 'tail:codex',
  },
  presenceFilter: 'all' as const,
  craftsmenFilter: 'all' as const,
  channelFilter: null as string | null,
  hostFilter: null as string | null,
  error: null,
  fetchStatus,
  fetchChannelDetail,
  fetchRuntimeTail,
  channelDetailLoading: false,
  channelDetailError: null,
  runtimeTailLoadingByAgent: {},
  setPresenceFilter: vi.fn(),
  setCraftsmenFilter: vi.fn(),
  setChannelFilter: vi.fn(),
  setHostFilter: vi.fn(),
};

vi.mock('@/stores/agentStore', () => ({
  useAgentStore: (selector?: (state: typeof agentStoreState) => unknown) =>
    selector ? selector(agentStoreState) : agentStoreState,
}));

vi.mock('@/stores/settingsStore', () => ({
  useSettingsStore: (selector?: (state: {
    refreshInterval: number;
    pauseOnHidden: boolean;
  }) => unknown) => {
    const state = {
      refreshInterval: 5,
      pauseOnHidden: true,
    };
    return selector ? selector(state) : state;
  },
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <AgentsPage />
    </MemoryRouter>,
  );
}

describe('agents workbench layout', () => {
  beforeEach(() => {
    fetchStatus.mockClear();
    fetchChannelDetail.mockClear();
    fetchRuntimeTail.mockClear();
  });

  it('uses grouped anomaly queue rows and drawer-based detail axes', { timeout: 10_000 }, () => {
    renderPage();

    expect(screen.getByTestId('agents-global-status')).toBeInTheDocument();
    expect(screen.getByTestId('agents-issue-queue')).toBeInTheDocument();
    expect(screen.getByTestId('agents-axis-entry')).toBeInTheDocument();
    expect(screen.getByTestId('agents-issue-queue-scroll')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /channel 健康异常/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /agent 状态异常/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /agent 状态异常/i }));
    expect(screen.getByRole('dialog', { name: /agent 明细工作区/i })).toBeInTheDocument();
    expect(screen.getByText('sonnet')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /close|关闭/i }).at(-1)!);
    fireEvent.click(screen.getByRole('button', { name: /channel 健康异常/i }));
    expect(screen.getByRole('dialog', { name: /channel 明细工作区/i })).toBeInTheDocument();
    expect(screen.getAllByText('discord').length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole('button', { name: /close|关闭/i }).at(-1)!);
    fireEvent.click(screen.getByRole('button', { name: /执行运行态/i }));
    expect(screen.getByRole('dialog', { name: /执行明细工作区/i })).toBeInTheDocument();
    expect(screen.getByText(/tail:codex/i)).toBeInTheDocument();
  });
});
