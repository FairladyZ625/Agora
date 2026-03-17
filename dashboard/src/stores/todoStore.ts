import { create } from 'zustand';
import * as api from '@/lib/api';
import { mapPromoteTodoResultDto, mapTodoDto } from '@/lib/dashboardExpansionMappers';
import type { PromoteTodoResult, Todo, TodoFilter } from '@/types/dashboard';

interface TodoStore {
  todos: Todo[];
  loading: boolean;
  error: string | null;
  filter: TodoFilter;
  projectFilter: string | null;
  fetchTodos: () => Promise<'live' | 'error'>;
  createTodo: (input: { text: string; project_id?: string | null; due?: string | null; tags?: string[] }) => Promise<Todo>;
  updateTodo: (id: number, input: { text?: string; project_id?: string | null; due?: string | null; tags?: string[]; status?: 'pending' | 'done' }) => Promise<Todo>;
  deleteTodo: (id: number) => Promise<void>;
  promoteTodo: (id: number, input: { type?: string; creator?: string; priority?: string }) => Promise<PromoteTodoResult>;
  setFilter: (filter: TodoFilter) => void;
  setProjectFilter: (projectId: string | null) => void;
  clearError: () => void;
}

function matchesFilter(todo: Todo, filter: TodoFilter) {
  return filter === 'all' || todo.status === filter;
}

export const useTodoStore = create<TodoStore>()((set, get) => ({
  todos: [],
  loading: false,
  error: null,
  filter: 'all',
  projectFilter: null,

  fetchTodos: async () => {
    set({ loading: true, error: null });
    try {
      const currentFilter = get().filter;
      const filter = currentFilter === 'all' ? undefined : currentFilter;
      const todos = (await api.listTodos(filter, get().projectFilter ?? undefined)).map(mapTodoDto);
      set({ todos, loading: false });
      return 'live';
    } catch (error) {
      set({
        todos: [],
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return 'error';
    }
  },

  createTodo: async (input) => {
    set({ error: null });
    const created = mapTodoDto(await api.createTodo(input));
    set((state) => ({
      todos: matchesFilter(created, state.filter) ? [created, ...state.todos.filter((item) => item.id !== created.id)] : state.todos,
    }));
    return created;
  },

  updateTodo: async (id, input) => {
    set({ error: null });
    const updated = mapTodoDto(await api.updateTodo(id, input));
    set((state) => {
      const nextTodos = state.todos.filter((item) => item.id !== id);
      return {
        todos: matchesFilter(updated, state.filter) ? [updated, ...nextTodos] : nextTodos,
      };
    });
    return updated;
  },

  deleteTodo: async (id) => {
    set({ error: null });
    await api.deleteTodo(id);
    set((state) => ({
      todos: state.todos.filter((item) => item.id !== id),
    }));
  },

  promoteTodo: async (id, input) => {
    set({ error: null });
    const result = mapPromoteTodoResultDto(await api.promoteTodo(id, input));
    set((state) => ({
      todos: state.todos.map((item) => (item.id === id ? result.todo : item)),
    }));
    return result;
  },

  setFilter: (filter) => set({ filter }),
  setProjectFilter: (projectFilter) => set({ projectFilter }),

  clearError: () => set({ error: null }),
}));
