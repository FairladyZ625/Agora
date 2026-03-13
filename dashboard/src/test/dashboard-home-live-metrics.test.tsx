import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardHome } from '@/pages/DashboardHome';
import type { Task } from '@/types/task';

const fetchTasks = vi.fn(async () => undefined);
const resolveReview = vi.fn(async () => 'live');
const showMessage = vi.fn();

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
  tasks: liveTasks,
  loading: false,
  detailLoading: false,
  error: null,
  selectedTaskId: null,
  selectedTaskStatus: null,
  filters: { state: null, search: '' },
  fetchTasks,
  selectTask: vi.fn(async () => undefined),
  resolveReview,
  createTask: vi.fn(async () => liveTasks[0]),
  runTaskAction: vi.fn(async () => 'live'),
  observeCraftsmen: vi.fn(async () => 'live'),
  probeCraftsmanExecution: vi.fn(async () => 'live'),
  sendCraftsmanInputText: vi.fn(async () => 'live'),
  sendCraftsmanInputKeys: vi.fn(async () => 'live'),
  submitCraftsmanChoice: vi.fn(async () => 'live'),
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
