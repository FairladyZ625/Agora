import { MemoryRouter, Route, Routes } from 'react-router';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { AppShell } from '@/components/layouts/AppShell';
import { DashboardHome } from '@/pages/DashboardHome';
import { TasksPage } from '@/pages/TasksPage';
import { ReviewsPage } from '@/pages/ReviewsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { createMockTasks, getMockTaskStatus } from '@/lib/mockDashboard';

const fetchTasks = vi.fn(async () => undefined);
const setMode = vi.fn();
const setApiConfig = vi.fn();
const setRefreshInterval = vi.fn();
const setPauseOnHidden = vi.fn();
const resolveReview = vi.fn(async () => 'live');

const mockTasks = createMockTasks();

const taskStoreState = {
  tasks: mockTasks,
  loading: false,
  detailLoading: false,
  error: null,
  selectedTaskId: 'TSK-001',
  selectedTaskStatus: getMockTaskStatus('TSK-001'),
  executionTailById: {},
  executionTailLoadingById: {},
  filters: { state: null, search: '' },
  fetchTasks,
  selectTask: vi.fn(async () => undefined),
  resolveReview,
  createTask: vi.fn(async () => mockTasks[0]),
  runTaskAction: vi.fn(async () => 'live'),
  observeCraftsmen: vi.fn(async () => 'live'),
  probeCraftsmanExecution: vi.fn(async () => 'live'),
  fetchCraftsmanExecutionTail: vi.fn(async () => 'live'),
  sendCraftsmanInputText: vi.fn(async () => 'live'),
  sendCraftsmanInputKeys: vi.fn(async () => 'live'),
  submitCraftsmanChoice: vi.fn(async () => 'live'),
  closeSubtask: vi.fn(async () => 'live'),
  archiveSubtask: vi.fn(async () => 'live'),
  cancelSubtask: vi.fn(async () => 'live'),
  cleanupTasks: vi.fn(async () => 0),
  setFilters: vi.fn(),
  clearError: vi.fn(),
};

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
    setApiConfig,
    setRefreshInterval,
    setPauseOnHidden,
  }),
}));

vi.mock('@/lib/api', () => ({
  healthCheck: vi.fn(async () => ({ status: 'ok' })),
}));

function renderWithRouter(node: React.ReactNode, initialEntries: string[] = ['/']) {
  return render(<MemoryRouter initialEntries={initialEntries}>{node}</MemoryRouter>);
}

describe('dashboard visual rescue target structure', () => {
  beforeEach(() => {
    fetchTasks.mockClear();
    resolveReview.mockClear();
    setMode.mockClear();
    setApiConfig.mockClear();
    setRefreshInterval.mockClear();
    setPauseOnHidden.mockClear();
    taskStoreState.tasks = createMockTasks();
    taskStoreState.selectedTaskId = 'TSK-001';
    taskStoreState.selectedTaskStatus = getMockTaskStatus('TSK-001');
  });

  it('adds a branded home hero that explains the Agora operating model', () => {
    renderWithRouter(<DashboardHome />);

    expect(screen.getByText('Agora')).toBeInTheDocument();
    expect(screen.getByText('Agora 中枢')).toBeInTheDocument();
    expect(screen.getByText('裁决中枢')).toBeInTheDocument();
    expect(screen.getByText('任务总线')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /打开任务总线/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /进入裁决台/i })).toBeInTheDocument();
  });

  it('turns the app shell into a contextual operational rail', () => {
    renderWithRouter(
      <AppShell>
        <div>test-content</div>
      </AppShell>,
    );

    expect(screen.getByRole('img', { name: 'Agora 指挥广场' })).toBeInTheDocument();
    expect(screen.getAllByText('Agora').length).toBeGreaterThan(0);
    expect(screen.getByText('系统时钟')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '重播 Agora 入场动效' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '打开导航' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '关闭侧边栏' })).not.toBeInTheDocument();
  });

  it('rebuilds the tasks page into a dense list and detail workspace', () => {
    taskStoreState.selectedTaskStatus = {
      ...getMockTaskStatus('TSK-001')!,
      task: {
        ...getMockTaskStatus('TSK-001')!.task,
        controllerRef: 'archon',
      },
      taskBlueprint: {
        graphVersion: 1,
        entryNodes: ['proposal'],
        controllerRef: 'archon',
        nodes: [
          { id: 'proposal', name: '提案', mode: 'discuss', gateType: 'archon_review' },
          { id: 'policy-guard', name: '策略护栏', mode: 'execute', gateType: 'all_subtasks_done' },
          { id: 'review', name: '合并审查', mode: 'discuss', gateType: 'approval' },
        ],
        edges: [
          { from: 'proposal', to: 'policy-guard', kind: 'advance' },
          { from: 'policy-guard', to: 'review', kind: 'advance' },
          { from: 'review', to: 'policy-guard', kind: 'reject' },
        ],
        artifactContracts: [{ nodeId: 'policy-guard', artifactType: 'stage_output' }],
        roleBindings: [
          { role: 'architect', agentId: 'archon', model_preference: 'strong_reasoning' },
          { role: 'developer', agentId: 'craftsman-2', model_preference: 'fast_coding' },
        ],
      },
    };
    renderWithRouter(<TasksPage />);

    expect(screen.getByRole('button', { name: /筛选与分类/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /打开任务详情/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('按任务标题、ID、创建者搜索')).toBeInTheDocument();
    expect(screen.getByText('编排图')).toBeInTheDocument();
    expect(screen.getAllByText('主控 Agent').length).toBeGreaterThan(0);
    expect(screen.getAllByText('archon').length).toBeGreaterThan(0);
    expect(screen.getByText('策略护栏')).toBeInTheDocument();
    expect(screen.getByTestId('task-blueprint-graph')).toBeInTheDocument();
  });

  it('rebuilds the reviews page as a decision queue workspace', () => {
    taskStoreState.selectedTaskId = 'TSK-002';
    taskStoreState.selectedTaskStatus = getMockTaskStatus('TSK-002');
    renderWithRouter(<ReviewsPage />);

    expect(screen.getByRole('button', { name: /筛选与分类/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /打开裁决详情/i })).toBeInTheDocument();
    expect(screen.getByText('裁决说明')).toBeInTheDocument();
    expect(screen.getByText('当前正在操作真实裁决接口。')).toBeInTheDocument();
  });

  it('routes review approval through the live resolveReview action', async () => {
    taskStoreState.selectedTaskId = 'TSK-002';
    taskStoreState.selectedTaskStatus = getMockTaskStatus('TSK-002');
    renderWithRouter(<ReviewsPage />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '批准执行' }));
      await Promise.resolve();
    });
    expect(resolveReview).toHaveBeenCalledWith('TSK-002', 'approve', '');
  });

  it('hides review decision controls when the selected task is no longer gate_waiting', () => {
    taskStoreState.selectedTaskId = 'TSK-002';
    taskStoreState.selectedTaskStatus = {
      ...getMockTaskStatus('TSK-002')!,
      task: {
        ...getMockTaskStatus('TSK-002')!.task,
        state: 'completed',
        sourceState: 'done',
      },
    };
    renderWithRouter(
      <Routes>
        <Route path="/reviews/:reviewId" element={<ReviewsPage />} />
      </Routes>,
      ['/reviews/TSK-002'],
    );

    expect(screen.queryByRole('button', { name: '批准执行' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '驳回' })).not.toBeInTheDocument();
  });

  it('opens a secondary task detail sheet on nested task routes', () => {
    renderWithRouter(
      <Routes>
        <Route path="/tasks/:taskId" element={<TasksPage />} />
      </Routes>,
      ['/tasks/TSK-001'],
    );

    expect(screen.getByRole('dialog', { name: '任务详情面板' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '执行全过程' })).toBeInTheDocument();
  });

  it('opens a secondary review detail sheet on nested review routes', () => {
    taskStoreState.selectedTaskId = 'TSK-002';
    taskStoreState.selectedTaskStatus = getMockTaskStatus('TSK-002');
    renderWithRouter(
      <Routes>
        <Route path="/reviews/:reviewId" element={<ReviewsPage />} />
      </Routes>,
      ['/reviews/TSK-002'],
    );

    expect(screen.getByRole('dialog', { name: '裁决详情面板' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '裁决上下文' })).toBeInTheDocument();
  });

  it('restructures settings into grouped operational preferences', () => {
    renderWithRouter(<SettingsPage />);

    expect(screen.getByRole('heading', { name: '连接与身份' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '同步策略' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '外观偏好' })).toBeInTheDocument();
  });

  it('uses formalized product copy on the home page', () => {
    renderWithRouter(<DashboardHome />);

    expect(screen.getByText('AGORA / 指挥广场')).toBeInTheDocument();
    expect(screen.getByText('实时编排总览')).toBeInTheDocument();
    expect(screen.getByText('当前裁决')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /查看 Agent 监测/i })).toBeInTheDocument();
  });

  it('removes duplicate shell signature copy from the sidebar header', () => {
    renderWithRouter(
      <AppShell>
        <div>test-content</div>
      </AppShell>,
    );

    expect(screen.queryByText('多 Agent 协作编排中枢')).not.toBeInTheDocument();
  });
});
