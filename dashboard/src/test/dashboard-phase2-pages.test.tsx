import { MemoryRouter } from 'react-router';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from '@/App';
import type { Task, TaskStatus } from '@/types/task';

const createTask = vi.fn(async () => ({ id: 'OC-009' }));

interface TaskStoreMockState {
  tasks: Task[];
  loading: boolean;
  detailLoading: boolean;
  error: string | null;
  selectedTaskId: string | null;
  selectedTaskStatus: TaskStatus | null;
  filters: { state: string | null; search: string };
  fetchTasks: ReturnType<typeof vi.fn>;
  selectTask: ReturnType<typeof vi.fn>;
  resolveReview: ReturnType<typeof vi.fn>;
  createTask: typeof createTask;
  runTaskAction: ReturnType<typeof vi.fn>;
  cleanupTasks: ReturnType<typeof vi.fn>;
  setFilters: ReturnType<typeof vi.fn>;
  clearError: ReturnType<typeof vi.fn>;
}

const taskStoreState: TaskStoreMockState = {
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
  createTask,
  runTaskAction: vi.fn(async () => 'live'),
  cleanupTasks: vi.fn(async () => 0),
  setFilters: vi.fn(),
  clearError: vi.fn(),
};

vi.mock('@/stores/taskStore', () => ({
  useTaskStore: (selector?: (state: TaskStoreMockState) => unknown) =>
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

describe('dashboard phase 2 routes', () => {
  it('adds board and create-task routes to the main app shell', () => {
    render(
      <MemoryRouter initialEntries={['/board']}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: '任务看板' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /创建 任务入口/i })).toBeInTheDocument();
  });

  it('renders the create task workspace on the dedicated route', () => {
    render(
      <MemoryRouter initialEntries={['/tasks/new']}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: '创建任务' })).toBeInTheDocument();
    expect(screen.getByLabelText('任务标题')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '创建任务' })).toBeInTheDocument();
  });

  it('shows task action controls for actionable live task details', () => {
    taskStoreState.selectedTaskId = 'OC-001';
    taskStoreState.selectedTaskStatus = {
      task: {
        ...taskStoreState.tasks[0],
        gateType: 'approval',
        sourceState: 'active',
        teamMembers: [
          { role: 'architect', agentId: 'opus', model_preference: 'strong_reasoning' },
          { role: 'reviewer', agentId: 'glm5', model_preference: 'chinese_strong' },
        ],
      },
      flow_log: [],
      progress_log: [],
      subtasks: [
        {
          id: 'dev-api',
          task_id: 'OC-001',
          stage_id: 'develop',
          title: '后端 API',
          assignee: 'sonnet',
          status: 'running',
          output: null,
          craftsman_type: 'backend',
          dispatch_status: 'running',
          dispatched_at: '2026-03-07T00:10:00.000Z',
          done_at: null,
        },
      ],
    };

    render(
      <MemoryRouter initialEntries={['/tasks']}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: 'Reviewer 通过' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reviewer 打回' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '暂停任务' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '标记 dev-api 完成' })).toBeInTheDocument();
  });

  it('exposes orphan cleanup from the settings surface', () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: '清理 orphaned' })).toBeInTheDocument();
  });
});
