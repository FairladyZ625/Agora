import { create } from 'zustand';
import * as api from '@/lib/api';

export type SessionRole = 'admin' | 'member';
type SessionStatus = 'idle' | 'loading' | 'ready' | 'error';

interface SessionStore {
  status: SessionStatus;
  authenticated: boolean;
  username: string | null;
  role: SessionRole | null;
  method: string | null;
  error: string | null;
  refresh: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const anonymousState = {
  authenticated: false,
  username: null,
  role: null,
  method: null,
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export const useSessionStore = create<SessionStore>()((set, get) => ({
  status: 'idle',
  ...anonymousState,
  error: null,
  refresh: async () => {
    if (get().status === 'loading') {
      return;
    }

    set({ status: 'loading', error: null });

    try {
      const session = await api.getDashboardSessionStatus();
      set({
        status: 'ready',
        authenticated: session.authenticated,
        username: session.username ?? null,
        role: session.role ?? null,
        method: session.method ?? null,
        error: null,
      });
    } catch (error) {
      set({
        status: 'error',
        ...anonymousState,
        error: getErrorMessage(error),
      });
    }
  },
  login: async (username: string, password: string) => {
    set({ status: 'loading', error: null });

    try {
      await api.loginDashboardSession(username, password);
      const session = await api.getDashboardSessionStatus();
      set({
        status: 'ready',
        authenticated: session.authenticated,
        username: session.username ?? null,
        role: session.role ?? null,
        method: session.method ?? null,
        error: null,
      });
    } catch (error) {
      set({
        status: 'error',
        ...anonymousState,
        error: getErrorMessage(error),
      });
      throw error;
    }
  },
  logout: async () => {
    try {
      await api.logoutDashboardSession();
    } finally {
      set({
        status: 'ready',
        ...anonymousState,
        error: null,
      });
    }
  },
  clearError: () => set({ error: null, status: get().authenticated ? 'ready' : 'idle' }),
}));
