import { MemoryRouter } from 'react-router';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TodosPage } from '@/pages/TodosPage';

const fetchTodos = vi.fn(async () => 'live');
const createTodo = vi.fn(async () => undefined);
const updateTodo = vi.fn(async () => undefined);
const deleteTodo = vi.fn(async () => undefined);
const promoteTodo = vi.fn(async () => ({ task: { id: 'OC-401' } }));
const setFilter = vi.fn();
const setProjectFilter = vi.fn();
const fetchProjects = vi.fn(async () => 'live');

const todoStoreState = {
  todos: [
    {
      id: 4,
      text: '补前端页面',
      projectId: 'proj-alpha',
      status: 'pending',
      due: null,
      createdAt: '2026-03-07T10:00:00.000Z',
      completedAt: null,
      tags: ['dashboard'],
      tagLabel: 'dashboard',
      promotedTo: null,
    },
  ],
  filter: 'all' as const,
  projectFilter: null,
  error: null,
  fetchTodos,
  createTodo,
  updateTodo,
  deleteTodo,
  promoteTodo,
  setFilter,
  setProjectFilter,
};

vi.mock('@/stores/todoStore', () => ({
  useTodoStore: (selector?: (state: typeof todoStoreState) => unknown) =>
    selector ? selector(todoStoreState) : todoStoreState,
}));

vi.mock('@/stores/feedbackStore', () => ({
  useFeedbackStore: () => ({
    showMessage: vi.fn(),
  }),
}));

vi.mock('@/stores/projectStore', () => ({
  useProjectStore: (selector?: (state: {
    projects: Array<{ id: string; name: string }>;
    fetchProjects: typeof fetchProjects;
  }) => unknown) => (
    selector ? selector({
      projects: [{ id: 'proj-alpha', name: 'Project Alpha' }],
      fetchProjects,
    }) : {
      projects: [{ id: 'proj-alpha', name: 'Project Alpha' }],
      fetchProjects,
    }
  ),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/todos?project=proj-alpha']}>
      <TodosPage />
    </MemoryRouter>,
  );
}

describe('todos workbench layout', () => {
  beforeEach(() => {
    fetchTodos.mockClear();
    fetchProjects.mockClear();
    createTodo.mockClear();
    updateTodo.mockClear();
    deleteTodo.mockClear();
    promoteTodo.mockClear();
    setFilter.mockClear();
    setProjectFilter.mockClear();
  });

  it('keeps the todo composer and queue as separate workbench modules', () => {
    renderPage();

    expect(screen.getByTestId('todos-composer-panel')).toBeInTheDocument();
    const queuePanel = screen.getByTestId('todos-queue-panel');
    expect(queuePanel).toBeInTheDocument();
    expect(within(queuePanel).getByText('补前端页面')).toBeInTheDocument();
    expect(within(queuePanel).getAllByText('Project Alpha').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('所属 Project')).toHaveValue('proj-alpha');
  });
});
