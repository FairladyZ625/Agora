import { MemoryRouter } from 'react-router';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from '@/App';

const sessionState = {
  status: 'ready' as const,
  authenticated: false,
  username: null as string | null,
  role: null as 'admin' | 'member' | null,
  login: vi.fn(),
  logout: vi.fn(),
  refresh: vi.fn(),
};

const taskStoreState = {
  tasks: [],
  loading: false,
  detailLoading: false,
  error: null,
  selectedTaskId: null,
  selectedTaskStatus: null,
  filters: { state: null, search: '' },
  fetchTasks: vi.fn(async () => 'live'),
  selectTask: vi.fn(async () => undefined),
  resolveReview: vi.fn(async () => 'live'),
  createTask: vi.fn(async () => ({ id: 'OC-001' })),
  runTaskAction: vi.fn(async () => 'live'),
  cleanupTasks: vi.fn(async () => 0),
  setFilters: vi.fn(),
  clearError: vi.fn(),
};

vi.mock('@/stores/sessionStore', () => ({
  useSessionStore: (selector?: (state: typeof sessionState) => unknown) =>
    selector ? selector(sessionState) : sessionState,
}));

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

vi.mock('@/components/auth/LoginAsciiCanvas', () => ({
  LoginAsciiCanvas: () => <div data-testid="login-ascii-canvas" />,
}));

vi.mock('@/components/settings/HumanAccountsPanel', () => ({
  HumanAccountsPanel: () => <div data-testid="human-accounts-panel" />,
}));

describe('dashboard auth routing', () => {
  it('redirects unauthenticated routes to the AGORA login page', () => {
    render(
      <MemoryRouter initialEntries={['/reviews']}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'AGORA' })).toBeInTheDocument();
    expect(screen.getByText('Agents debate freely, humans decide, craftsmen execute.')).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
    expect(screen.getByTestId('login-copy-frame')).toBeInTheDocument();
    expect(screen.getByTestId('login-card')).toBeInTheDocument();
  });

  it('renders the dashboard shell when authenticated', () => {
    sessionState.authenticated = true;
    sessionState.username = 'lizeyu';
    sessionState.role = 'admin';

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: '设置' })).toBeInTheDocument();
  });
});
