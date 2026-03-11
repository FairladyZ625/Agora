import { MemoryRouter } from 'react-router';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TodosPage } from '@/pages/TodosPage';

const fetchTodos = vi.fn(async () => 'live');
const createTodo = vi.fn(async () => undefined);
const updateTodo = vi.fn(async () => undefined);
const deleteTodo = vi.fn(async () => undefined);
const promoteTodo = vi.fn(async () => ({ task: { id: 'OC-401' } }));
const setFilter = vi.fn();

const todoStoreState = {
  todos: [
    {
      id: 4,
      text: '补前端页面',
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
  error: null,
  fetchTodos,
  createTodo,
  updateTodo,
  deleteTodo,
  promoteTodo,
  setFilter,
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

function renderPage() {
  return render(
    <MemoryRouter>
      <TodosPage />
    </MemoryRouter>,
  );
}

describe('todos workbench layout', () => {
  beforeEach(() => {
    fetchTodos.mockClear();
    createTodo.mockClear();
    updateTodo.mockClear();
    deleteTodo.mockClear();
    promoteTodo.mockClear();
    setFilter.mockClear();
  });

  it('keeps the todo composer and queue as separate workbench modules', () => {
    renderPage();

    expect(screen.getByTestId('todos-composer-panel')).toBeInTheDocument();
    expect(screen.getByTestId('todos-queue-panel')).toBeInTheDocument();
    expect(screen.getByText('补前端页面')).toBeInTheDocument();
  });
});
