import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '@/App';
import { setLocale } from '@/lib/i18n';

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
  cleanupTasks: vi.fn(async () => 0),
  setFilters: vi.fn(),
  clearError: vi.fn(),
};

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
});
