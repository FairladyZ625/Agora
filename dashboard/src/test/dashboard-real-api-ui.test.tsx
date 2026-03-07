import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TasksPage } from '@/pages/TasksPage';
import { ReviewsPage } from '@/pages/ReviewsPage';
import { SettingsPage } from '@/pages/SettingsPage';

const fetchTasks = vi.fn(async () => 'live');
const selectTask = vi.fn(async () => undefined);
const resolveReview = vi.fn(async () => 'live');
const showMessage = vi.fn();
const healthCheck = vi.fn(async () => ({ status: 'ok' }));

const taskStoreState = {
  tasks: [],
  selectedTaskId: null,
  selectedTaskStatus: null,
  filters: { state: null, search: '' },
  loading: false,
  detailLoading: false,
  error: '真实 API 当前不可用',
  fetchTasks,
  selectTask,
  resolveReview,
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

vi.mock('@/stores/themeStore', () => ({
  useThemeStore: () => ({
    mode: 'system',
    resolved: 'light',
    setMode: vi.fn(),
  }),
}));

vi.mock('@/lib/api', () => ({
  healthCheck: () => healthCheck(),
}));

function renderWithRouter(node: React.ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

describe('dashboard real API UI states', () => {
  beforeEach(() => {
    fetchTasks.mockClear();
    selectTask.mockClear();
    resolveReview.mockClear();
    showMessage.mockClear();
    healthCheck.mockReset();
    healthCheck.mockResolvedValue({ status: 'ok' });
    taskStoreState.tasks = [];
    taskStoreState.selectedTaskId = null;
    taskStoreState.selectedTaskStatus = null;
    taskStoreState.error = '真实 API 当前不可用';
  });

  it('shows an explicit live API error on the tasks page instead of mock content', () => {
    renderWithRouter(<TasksPage />);

    expect(screen.getByText('真实 API 当前不可用')).toBeInTheDocument();
    expect(screen.queryByText('TSK-001')).not.toBeInTheDocument();
  });

  it('removes the mock interactive banner from the reviews page', () => {
    renderWithRouter(<ReviewsPage />);

    expect(screen.queryByText('当前为 mock 可交互模式，所有裁决都会立即反馈到演示态势。')).not.toBeInTheDocument();
    expect(screen.getByText('真实 API 当前不可用')).toBeInTheDocument();
  });

  it('reports real health check failures without promising mock fallback', async () => {
    healthCheck.mockRejectedValue(new Error('401 unauthorized'));

    renderWithRouter(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: '检测连通性' }));

    await waitFor(() => {
      expect(showMessage).toHaveBeenCalledWith('网关未连通', '401 unauthorized', 'warning');
    });
    expect(screen.queryByText(/mock 阶段/i)).not.toBeInTheDocument();
  });
});
