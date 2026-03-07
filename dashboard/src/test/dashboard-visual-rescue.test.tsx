import { MemoryRouter } from 'react-router';
import { render, screen } from '@testing-library/react';
import { AppShell } from '@/components/layouts/AppShell';
import { DashboardHome } from '@/pages/DashboardHome';
import { TasksPage } from '@/pages/TasksPage';
import { ReviewsPage } from '@/pages/ReviewsPage';
import { SettingsPage } from '@/pages/SettingsPage';

const fetchTasks = vi.fn(async () => undefined);
const setMode = vi.fn();
const setApiConfig = vi.fn();
const setRefreshInterval = vi.fn();
const setPauseOnHidden = vi.fn();

vi.mock('@/stores/taskStore', () => ({
  useTaskStore: () => ({
    tasks: [],
    loading: false,
    detailLoading: false,
    error: null,
    selectedTaskId: null,
    selectedTaskStatus: null,
    filters: { state: null, search: '' },
    fetchTasks,
    selectTask: vi.fn(async () => undefined),
    setFilters: vi.fn(),
    clearError: vi.fn(),
  }),
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
    setApiConfig,
    setRefreshInterval,
    setPauseOnHidden,
  }),
}));

vi.mock('@/lib/api', () => ({
  healthCheck: vi.fn(async () => ({ status: 'ok' })),
}));

function renderWithRouter(node: React.ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

describe('dashboard visual rescue target structure', () => {
  beforeEach(() => {
    fetchTasks.mockClear();
    setMode.mockClear();
    setApiConfig.mockClear();
    setRefreshInterval.mockClear();
    setPauseOnHidden.mockClear();
  });

  it('adds a branded home hero that explains the Agora operating model', () => {
    renderWithRouter(<DashboardHome />);

    expect(
      screen.getByText('Agents debate. Humans decide. Machines execute.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /查看任务流/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /进入裁决中心/i })).toBeInTheDocument();
  });

  it('turns the app shell into a contextual operational rail', () => {
    renderWithRouter(
      <AppShell>
        <div>test-content</div>
      </AppShell>,
    );

    expect(screen.getByText('Agora 指挥广场')).toBeInTheDocument();
    expect(screen.getByText('辩论，裁决，执行')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重播 Agora 入场动效' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '打开导航' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '关闭侧边栏' })).not.toBeInTheDocument();
  });

  it('rebuilds the tasks page into a dense list and detail workspace', () => {
    renderWithRouter(<TasksPage />);

    expect(screen.getByRole('heading', { name: '任务详情' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '执行时间线' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('按任务标题、ID、创建者搜索')).toBeInTheDocument();
  });

  it('rebuilds the reviews page as a decision queue workspace', () => {
    renderWithRouter(<ReviewsPage />);

    expect(screen.getByText('裁决中心')).toBeInTheDocument();
    expect(screen.getByText('待裁决任务')).toBeInTheDocument();
    expect(screen.getByText('裁决说明')).toBeInTheDocument();
    expect(screen.getByText('当前为 mock 可交互模式，所有裁决都会立即反馈到演示态势。')).toBeInTheDocument();
  });

  it('restructures settings into grouped operational preferences', () => {
    renderWithRouter(<SettingsPage />);

    expect(screen.getByRole('heading', { name: '连接与身份' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '同步策略' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '外观偏好' })).toBeInTheDocument();
  });

  it('uses formalized product copy on the home page', () => {
    renderWithRouter(<DashboardHome />);

    expect(screen.getByText('Agora / 多 Agent 指挥广场')).toBeInTheDocument();
    expect(screen.getByText('系统脉冲')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /进入裁决中心/i })).toBeInTheDocument();
  });
});
