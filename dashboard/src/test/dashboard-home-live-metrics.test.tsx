import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardHome } from '@/pages/DashboardHome';
import type { Task } from '@/types/task';

const fetchTasks = vi.fn(async () => undefined);
const resolveReview = vi.fn(async () => 'live');
const showMessage = vi.fn();

const sessionStoreState = {
  authenticated: true,
  status: 'ready',
  username: 'approver',
  accountId: 7,
  role: 'member',
  refresh: vi.fn(async () => 'live'),
  logout: vi.fn(async () => undefined),
  error: null as string | null,
};

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
    authority: {
      approverAccountId: 7,
    },
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
  {
    id: 'OC-103',
    version: 1,
    title: '已完成任务',
    description: '最近刚完成。',
    type: 'coding',
    priority: 'normal',
    creator: 'archon',
    state: 'completed',
    archiveStatus: null,
    current_stage: 'done',
    teamLabel: 'claude_code',
    workflowLabel: 'ship',
    memberCount: 1,
    isReviewStage: false,
    sourceState: 'done',
    stageName: 'Done',
    gateType: null,
    teamMembers: [{ role: 'developer', agentId: 'claude_code', model_preference: 'balanced' }],
    scheduler: null,
    scheduler_snapshot: null,
    discord: null,
    metrics: null,
    error_detail: null,
    created_at: '2026-03-07T08:00:00.000Z',
    updated_at: '2026-03-07T11:30:00.000Z',
  },
];

const taskStoreState = {
  tasks: [...liveTasks],
  loading: false,
  detailLoading: false,
  error: null,
  selectedTaskId: null,
  selectedTaskStatus: null,
  governanceSnapshot: {
    limits: {
      maxConcurrentRunning: 6,
      maxConcurrentPerAgent: 2,
      hostMemoryWarningUtilizationLimit: 0.7,
      hostMemoryUtilizationLimit: 0.85,
      hostSwapWarningUtilizationLimit: 0.1,
      hostSwapUtilizationLimit: 0.25,
      hostLoadPerCpuWarningLimit: 1.2,
      hostLoadPerCpuLimit: 1.5,
    },
    activeExecutions: 4,
    activeByAssignee: [{ assignee: 'opus', count: 2 }],
    activeExecutionDetails: [],
    hostPressureStatus: 'healthy',
    warnings: [],
    host: {
      observedAt: '2026-03-07T11:58:00.000Z',
      cpuCount: 8,
      load1m: 1.25,
      memoryTotalBytes: 10,
      memoryUsedBytes: 5,
      memoryUtilization: 0.5,
      swapTotalBytes: 10,
      swapUsedBytes: 0,
      swapUtilization: 0,
    },
  },
  healthSnapshot: {
    generatedAt: '2026-03-07T11:58:00.000Z',
    tasks: { status: 'healthy', totalTasks: 3, activeTasks: 2, pausedTasks: 0, blockedTasks: 0, doneTasks: 1 },
    im: { status: 'healthy', activeBindings: 1, activeThreads: 1, bindingsByProvider: [{ label: 'discord', count: 1 }] },
    runtime: { status: 'healthy', available: true, staleAfterMs: 300000, activeSessions: 2, idleSessions: 0, closedSessions: 0, agents: [] },
    craftsman: { status: 'healthy', activeExecutions: 4, queuedExecutions: 0, runningExecutions: 4, waitingInputExecutions: 0, awaitingChoiceExecutions: 0, activeByAssignee: [{ label: 'opus', count: 2 }] },
    host: { status: 'healthy', snapshot: null },
    escalation: {
      status: 'healthy',
      policy: { controllerAfterMs: 600000, rosterAfterMs: 1200000, inboxAfterMs: 1800000 },
      controllerPingedTasks: 0,
      rosterPingedTasks: 0,
      inboxEscalatedTasks: 0,
      unhealthyRuntimeAgents: 0,
      runtimeUnhealthy: false,
    },
  },
  filters: { state: null, search: '' },
  fetchTasks,
  selectTask: vi.fn(async () => undefined),
  resolveReview,
  createTask: vi.fn(async () => liveTasks[0]),
  runTaskAction: vi.fn(async () => 'live'),
  observeCraftsmen: vi.fn(async () => 'live'),
  refreshHealthSnapshot: vi.fn(async () => 'live'),
  probeCraftsmanExecution: vi.fn(async () => 'live'),
  diagnoseRuntime: vi.fn(async () => ({ summary: 'ok', detail: null, status: 'accepted' })),
  restartRuntime: vi.fn(async () => ({ summary: 'ok', detail: null, status: 'accepted' })),
  stopCraftsmanExecution: vi.fn(async () => ({ summary: 'ok', detail: null, status: 'accepted' })),
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

vi.mock('@/stores/feedbackStore', () => ({
  useFeedbackStore: () => ({
    showMessage,
  }),
}));

vi.mock('@/stores/sessionStore', () => ({
  useSessionStore: (selector?: (state: typeof sessionStoreState) => unknown) =>
    selector ? selector(sessionStoreState) : sessionStoreState,
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

describe('dashboard home live metrics', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-07T12:00:00.000Z'));
    taskStoreState.tasks = [...liveTasks];
    fetchTasks.mockClear();
    resolveReview.mockClear();
    showMessage.mockClear();
    taskStoreState.selectTask.mockClear();
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

  function LocationProbe() {
    const location = useLocation();
    return <div data-testid="location-probe">{`${location.pathname}${location.search}`}</div>;
  }

  it('derives homepage authority stats from live task data', () => {
    render(
      <MemoryRouter>
        <DashboardHome />
      </MemoryRouter>,
    );

    act(() => {
      vi.advanceTimersByTime(500);
    });

    const participantsCard = screen.getAllByText('当前参与 Agent')[0]?.closest('.home-os__telemetry-readout');
    expect(participantsCard).not.toBeNull();
    expect(within(participantsCard as HTMLElement).getByText('3')).toBeInTheDocument();

    const cadenceCard = screen
      .getAllByText('最近完成节点')
      .map((node) => node.closest('.inline-stat'))
      .find(Boolean);
    expect(cadenceCard).not.toBeNull();
    expect(within(cadenceCard as HTMLElement).getByText('30 分钟前')).toBeInTheDocument();

    const runningPulse = screen
      .getAllByText('运行中的编排')
      .map((node) => node.closest('.inline-stat'))
      .find(Boolean);
    expect(runningPulse).not.toBeNull();
    expect(within(runningPulse as HTMLElement).getByText('1')).toBeInTheDocument();

    const waitingPulse = screen
      .getAllByText('待裁决事项')
      .map((node) => node.closest('.inline-stat'))
      .find(Boolean);
    expect(waitingPulse).not.toBeNull();
    expect(within(waitingPulse as HTMLElement).getByText('1')).toBeInTheDocument();

    const completedPulse = screen
      .getAllByText('最近完成节点')
      .map((node) => node.closest('.inline-stat'))
      .find(Boolean);
    expect(completedPulse).not.toBeNull();
    expect(within(completedPulse as HTMLElement).getByText('30 分钟前')).toBeInTheDocument();

    const executionPulse = screen
      .getAllByText('活跃执行单元')
      .map((node) => node.closest('.inline-stat'))
      .find(Boolean);
    expect(executionPulse).not.toBeNull();
    expect(within(executionPulse as HTMLElement).getByText('4')).toBeInTheDocument();

    const loadPulse = screen
      .getAllByText('主机负载')
      .map((node) => node.closest('.inline-stat'))
      .find(Boolean);
    expect(loadPulse).not.toBeNull();
    expect(within(loadPulse as HTMLElement).getByText('1.25')).toBeInTheDocument();
  });

  it('defers secondary homepage panels until after the first paint window', () => {
    const { container } = render(
      <MemoryRouter>
        <DashboardHome />
      </MemoryRouter>,
    );

    expect(container.querySelector('.home-os__load')).toBeNull();
    expect(container.querySelector('.home-os__telemetry-readout')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(160);
    });

    expect(container.querySelector('.home-os__load')).not.toBeNull();
    expect(container.querySelector('.home-os__telemetry-readout')).not.toBeNull();
  });

  it('wires the home authority card into the live review action', async () => {
    render(
      <MemoryRouter>
        <DashboardHome />
      </MemoryRouter>,
    );

    const approveButton = screen.getByRole('button', { name: '批准进入执行' });
    expect(approveButton).not.toBeDisabled();

    fireEvent.click(approveButton);

    await Promise.resolve();
    expect(resolveReview).toHaveBeenCalledWith('OC-102', 'approve', '');
  });

  it('routes synthesis into the approver-scoped review queue', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<><DashboardHome /><LocationProbe /></>} />
          <Route path="/reviews" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '进入待我审批' }));
      await Promise.resolve();
    });
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/reviews?scope=assigned&selected=OC-102');
  });

  it('shows an empty authority target when no review item is pending', () => {
    taskStoreState.tasks = liveTasks.filter((task) => task.state !== 'gate_waiting');

    render(
      <MemoryRouter>
        <DashboardHome />
      </MemoryRouter>,
    );

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.getByText('当前暂无裁决目标')).toBeInTheDocument();
    expect(screen.getAllByText('暂无')).toHaveLength(2);
    expect(screen.getByText('当前裁决 0 / 0')).toBeInTheDocument();
  });

  it('does not preload task detail context until the operator focuses a rail task', () => {
    render(
      <MemoryRouter>
        <DashboardHome />
      </MemoryRouter>,
    );

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(taskStoreState.selectTask).not.toHaveBeenCalled();
    expect(screen.getByText('选择一个任务后再展开执行回路。')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /等待裁决/i }));
    expect(taskStoreState.selectTask).toHaveBeenCalledWith('OC-102');
  });

  it('refreshes the home task feed on the configured cadence and when the page becomes visible again', () => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: false,
    });

    render(
      <MemoryRouter>
        <DashboardHome />
      </MemoryRouter>,
    );

    expect(fetchTasks).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(fetchTasks).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: true,
    });

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      vi.advanceTimersByTime(5000);
    });
    expect(fetchTasks).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: false,
    });

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(fetchTasks).toHaveBeenCalledTimes(2);
  });
});
