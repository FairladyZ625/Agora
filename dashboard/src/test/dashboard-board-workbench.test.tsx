import { MemoryRouter } from 'react-router';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockTasks } from '@/lib/mockDashboard';
import { BoardPage } from '@/pages/BoardPage';

const fetchTasks = vi.fn(async () => 'live');

const tasks = createMockTasks();
tasks.push(
  {
    ...tasks[0],
    id: 'TSK-901',
    title: '审批退回后的清理任务',
    state: 'cancelled',
    updated_at: new Date(Date.now() - 30 * 60_000).toISOString(),
  },
  {
    ...tasks[1],
    id: 'TSK-902',
    title: '等待人工恢复的执行链路',
    state: 'paused',
    updated_at: new Date(Date.now() - 12 * 60_000).toISOString(),
  },
);

const taskStoreState = {
  tasks,
  error: null,
  fetchTasks,
};

vi.mock('@/stores/taskStore', () => ({
  useTaskStore: (selector?: (state: typeof taskStoreState) => unknown) =>
    selector ? selector(taskStoreState) : taskStoreState,
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <BoardPage />
    </MemoryRouter>,
  );
}

describe('board workbench layout', () => {
  beforeEach(() => {
    fetchTasks.mockClear();
  });

  it('splits the board into summary, state grid, and interrupted focus modules', () => {
    renderPage();

    expect(screen.getByTestId('board-state-summary')).toBeInTheDocument();
    expect(screen.getByTestId('board-state-grid')).toBeInTheDocument();
    expect(screen.getByTestId('board-interrupted-focus')).toBeInTheDocument();
    expect(screen.getAllByText('等待人工恢复的执行链路').length).toBeGreaterThan(0);
    expect(screen.getAllByText('审批退回后的清理任务').length).toBeGreaterThan(0);
  });
});
