import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardHome } from '@/pages/DashboardHome';
import { AgentsPage } from '@/pages/AgentsPage';
import type { Task } from '@/types/task';

const fetchTasks = vi.fn(async () => undefined);
const resolveReview = vi.fn(async () => 'live');
const showMessage = vi.fn();
const fetchStatus = vi.fn(async () => 'live');
const fetchChannelDetail = vi.fn(async () => 'live');
const fetchTmuxTail = vi.fn(async () => 'live');

const liveTasks: Task[] = [
  {
    id: 'OC-101',
    version: 1,
    title: '实现首页真实统计',
    description: '把首页假统计切到真实数据。',
    type: 'coding',
    priority: 'high',
    creator: 'archon',
    state: 'in_progress',
    archiveStatus: null,
    current_stage: 'develop',
    teamLabel: 'opus / sonnet',
    workflowLabel: 'discuss-execute-review',
    memberCount: 2,
    isReviewStage: false,
    sourceState: 'active',
    stageName: 'Develop',
    gateType: null,
    teamMembers: [
      { role: 'architect', agentId: 'opus', model_preference: 'strong_reasoning' },
      { role: 'developer', agentId: 'sonnet', model_preference: 'balanced' },
    ],
    scheduler: null,
    scheduler_snapshot: null,
    discord: null,
    metrics: null,
    error_detail: null,
    created_at: '2026-03-07T10:00:00.000Z',
    updated_at: '2026-03-07T11:50:00.000Z',
  },
  {
    id: 'OC-102',
    version: 1,
    title: '等待裁决',
    description: '进入 gate 等待批准。',
    type: 'review',
    priority: 'high',
    creator: 'archon',
    state: 'gate_waiting',
    archiveStatus: null,
    current_stage: 'review',
    teamLabel: 'opus / glm5',
    workflowLabel: 'review-first',
    memberCount: 2,
    isReviewStage: true,
    sourceState: 'active',
    stageName: 'Review',
    gateType: 'approval',
    teamMembers: [
      { role: 'architect', agentId: 'opus', model_preference: 'strong_reasoning' },
      { role: 'reviewer', agentId: 'glm5', model_preference: 'chinese_strong' },
    ],
    scheduler: null,
    scheduler_snapshot: null,
    discord: null,
    metrics: null,
    error_detail: null,
    created_at: '2026-03-07T09:00:00.000Z',
    updated_at: '2026-03-07T11:40:00.000Z',
  },
];

const taskStoreState = {
  tasks: liveTasks,
  loading: false,
  detailLoading: false,
  error: null,
  selectedTaskId: null,
  selectedTaskStatus: {
    task: liveTasks[1],
    subtasks: [
      {
        id: 'subtask-1',
        title: '等待审批',
        assignee: 'glm5',
        status: 'waiting',
        stage_id: 'review',
      },
    ],
    flow_log: [
      {
        id: 'flow-1',
        event: 'gate_entered',
        stage_id: 'review',
        detail: '等待人工审批',
        created_at: '2026-03-07T11:45:00.000Z',
      },
    ],
    progress_log: [
      {
        id: 'progress-1',
        actor: 'glm5',
        stage_id: 'review',
        content: '已进入审批门',
        created_at: '2026-03-07T11:46:00.000Z',
      },
    ],
  },
  filters: { state: null, search: '' },
  fetchTasks,
  selectTask: vi.fn(async () => undefined),
  resolveReview,
  createTask: vi.fn(async () => liveTasks[0]),
  runTaskAction: vi.fn(async () => 'live'),
  cleanupTasks: vi.fn(async () => 0),
  setFilters: vi.fn(),
  clearError: vi.fn(),
};

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
  tmuxRuntime: {
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
  tmuxTailByAgent: {
    codex: 'tail:codex',
  },
  presenceFilter: 'all' as const,
  craftsmenFilter: 'all' as const,
  channelFilter: null as string | null,
  hostFilter: null as string | null,
  error: null,
  fetchStatus,
  fetchChannelDetail,
  fetchTmuxTail,
  channelDetailLoading: false,
  channelDetailError: null,
  tmuxTailLoadingByAgent: {},
  setPresenceFilter: vi.fn(),
  setCraftsmenFilter: vi.fn(),
  setChannelFilter: vi.fn(),
  setHostFilter: vi.fn(),
};

vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: () => true,
}));

vi.mock('@/stores/taskStore', () => ({
  useTaskStore: (selector?: (state: typeof taskStoreState) => unknown) =>
    selector ? selector(taskStoreState) : taskStoreState,
}));

vi.mock('@/stores/feedbackStore', () => ({
  useFeedbackStore: () => ({
    showMessage,
  }),
}));

vi.mock('@/stores/agentStore', () => ({
  useAgentStore: (selector?: (state: typeof agentStoreState) => unknown) =>
    selector ? selector(agentStoreState) : agentStoreState,
}));

vi.mock('@/stores/settingsStore', () => ({
  useSettingsStore: (selector?: (state: { refreshInterval: number; pauseOnHidden: boolean }) => unknown) => {
    const state = {
      refreshInterval: 5,
      pauseOnHidden: true,
    };
    return selector ? selector(state) : state;
  },
}));

describe('dashboard mobile page density', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-08T12:00:00.000Z'));
    taskStoreState.selectTask.mockClear();
    fetchTasks.mockClear();
    fetchStatus.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps the home rail on a compact mobile summary instead of expanding execution detail inline', () => {
    const { container } = render(
      <MemoryRouter>
        <DashboardHome />
      </MemoryRouter>,
    );

    act(() => {
      vi.advanceTimersByTime(500);
    });

    fireEvent.click(screen.getByRole('button', { name: /等待裁决/i }));

    expect(container.querySelector('.home-os__dag-board')).toBeNull();
    expect(container.querySelector('.home-os__terminal')).toBeNull();
    expect(container.querySelector('.home-os__rail-summary')).not.toBeNull();
  });

  it('drops the secondary agents focus panel from the mobile first paint', () => {
    render(
      <MemoryRouter>
        <AgentsPage />
      </MemoryRouter>,
    );

    expect(screen.queryByText('最值得先看的运行面')).not.toBeInTheDocument();
    expect(screen.getByText('进入三条主轴查看细节')).toBeInTheDocument();
  });
});
