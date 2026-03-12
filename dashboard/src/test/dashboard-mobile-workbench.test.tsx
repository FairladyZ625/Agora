import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { TasksPage } from '@/pages/TasksPage';
import { ReviewsPage } from '@/pages/ReviewsPage';
import { createMockTasks, getMockTaskStatus } from '@/lib/mockDashboard';

const fetchTasks = vi.fn(async () => undefined);
const resolveReview = vi.fn(async () => 'live');

const mockTasks = createMockTasks();

const taskStoreState = {
  tasks: mockTasks,
  loading: false,
  detailLoading: false,
  error: null,
  selectedTaskId: 'TSK-001',
  selectedTaskStatus: getMockTaskStatus('TSK-001'),
  filters: { state: null, search: '' },
  fetchTasks,
  selectTask: vi.fn(async () => undefined),
  resolveReview,
  createTask: vi.fn(async () => mockTasks[0]),
  runTaskAction: vi.fn(async () => 'live'),
  cleanupTasks: vi.fn(async () => 0),
  setFilters: vi.fn(),
  clearError: vi.fn(),
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
    showMessage: vi.fn(),
  }),
}));

function renderWithRoutes(initialEntries: string[], element: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>{element}</Routes>
    </MemoryRouter>,
  );
}

describe('dashboard mobile workbench routes', () => {
  beforeEach(() => {
    fetchTasks.mockClear();
    resolveReview.mockClear();
    taskStoreState.tasks = createMockTasks();
    taskStoreState.selectedTaskId = 'TSK-001';
    taskStoreState.selectedTaskStatus = getMockTaskStatus('TSK-001');
  });

  it('opens task detail as a sheet on mobile instead of keeping the inspector mounted inline', async () => {
    renderWithRoutes(
      ['/tasks'],
      <>
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/tasks/:taskId" element={<TasksPage />} />
      </>,
    );

    expect(screen.queryByRole('heading', { name: '详情' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /TSK-001/i }));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: '任务详情面板' })).toBeInTheDocument();
    });
  });

  it('opens review detail as a sheet on mobile instead of keeping the inspector mounted inline', async () => {
    taskStoreState.selectedTaskId = 'TSK-002';
    taskStoreState.selectedTaskStatus = getMockTaskStatus('TSK-002');

    renderWithRoutes(
      ['/reviews'],
      <>
        <Route path="/reviews" element={<ReviewsPage />} />
        <Route path="/reviews/:reviewId" element={<ReviewsPage />} />
      </>,
    );

    expect(screen.queryByRole('heading', { name: '裁决工作区' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /TSK-002/i }));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: '裁决详情面板' })).toBeInTheDocument();
    });
  });
});
