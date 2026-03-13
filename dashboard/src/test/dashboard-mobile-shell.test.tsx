import { MemoryRouter } from 'react-router';
import { fireEvent, render, screen } from '@testing-library/react';
import { AppShell } from '@/components/layouts/AppShell';
import { Sidebar } from '@/components/layouts/Sidebar';

const fetchTasks = vi.fn(async () => 'live');
const setMode = vi.fn();
const resolveReview = vi.fn(async () => 'live');
const showMessage = vi.fn();
const logout = vi.fn(async () => undefined);

const taskStoreState = {
  tasks: [],
  selectedTaskId: null,
  selectedTaskStatus: null,
  filters: { state: null, search: '' },
  loading: false,
  detailLoading: false,
  error: null,
  fetchTasks,
  selectTask: vi.fn(async () => undefined),
  resolveReview,
  createTask: vi.fn(async () => ({ id: 'OC-009' })),
  runTaskAction: vi.fn(async () => 'live'),
  observeCraftsmen: vi.fn(async () => 'live'),
  probeCraftsmanExecution: vi.fn(async () => 'live'),
  sendCraftsmanInputText: vi.fn(async () => 'live'),
  sendCraftsmanInputKeys: vi.fn(async () => 'live'),
  submitCraftsmanChoice: vi.fn(async () => 'live'),
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

vi.mock('@/stores/themeStore', () => ({
  useThemeStore: () => ({
    mode: 'system',
    resolved: 'light',
    setMode,
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

vi.mock('@/stores/motionStore', () => ({
  useMotionStore: (selector?: (state: { mode: 'full'; setMode: typeof vi.fn }) => unknown) => {
    const state = { mode: 'full' as const, setMode: vi.fn() };
    return selector ? selector(state) : state;
  },
}));

vi.mock('@/stores/feedbackStore', () => ({
  useFeedbackStore: () => ({
    showMessage,
    message: null,
    clearMessage: vi.fn(),
  }),
}));

vi.mock('@/stores/sessionStore', () => ({
  useSessionStore: (selector?: (state: { username: string; role: string; logout: typeof logout }) => unknown) => {
    const state = { username: 'mobile-user', role: 'admin', logout };
    return selector ? selector(state) : state;
  },
}));

vi.mock('@/lib/api', () => ({
  healthCheck: vi.fn(async () => ({ status: 'ok' })),
}));

function renderWithRouter(node: React.ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

describe('dashboard mobile shell', () => {
  beforeEach(() => {
    fetchTasks.mockClear();
    setMode.mockClear();
    showMessage.mockClear();
    logout.mockClear();
  });

  it('uses a compact top bar on mobile instead of the desktop command strip', () => {
    renderWithRouter(
      <AppShell>
        <div>mobile-content</div>
      </AppShell>,
    );

    expect(screen.getByRole('button', { name: '打开导航' })).toBeInTheDocument();
    expect(screen.queryByText('系统时钟')).not.toBeInTheDocument();
    expect(screen.getByLabelText('退出登录')).toBeInTheDocument();
  });

  it('keeps mobile navigation links out of the accessibility tree until the drawer opens', () => {
    renderWithRouter(
      <AppShell>
        <div>mobile-content</div>
      </AppShell>,
    );

    expect(screen.queryByRole('link', { name: /概览/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '打开导航' }));

    expect(screen.getByRole('link', { name: /概览/i })).toBeInTheDocument();
  });

  it('treats mobile navigation as a drawer, not a collapsible desktop rail', () => {
    renderWithRouter(
      <Sidebar
        collapsed={false}
        onToggle={vi.fn()}
        mobileOpen
        onCloseMobile={vi.fn()}
        isMobile
      />,
    );

    expect(screen.getByRole('button', { name: '关闭侧边栏' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '折叠侧边栏' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '展开侧边栏' })).not.toBeInTheDocument();
  });
});
