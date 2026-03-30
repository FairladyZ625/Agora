import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BoardPage } from '@/pages/BoardPage';
import { TasksPage } from '@/pages/TasksPage';
import type { Task } from '@/types/task';

const fetchTasks = vi.fn(async () => 'live');
const fetchProjects = vi.fn(async () => 'live');

const baseTasks: Task[] = [
  {
    id: 'TSK-PROJ-1',
    version: 1,
    projectId: 'proj-alpha',
    title: 'Alpha API hardening',
    description: 'Strengthen alpha API retries.',
    type: 'coding',
    priority: 'high',
    creator: 'archon',
    state: 'in_progress',
    archiveStatus: null,
    controllerRef: 'opus',
    current_stage: 'develop',
    teamLabel: 'core',
    workflowLabel: 'execute',
    memberCount: 2,
    isReviewStage: false,
    sourceState: 'active',
    stageName: 'Develop',
    gateType: null,
    teamMembers: [],
    scheduler: null,
    scheduler_snapshot: null,
    discord: null,
    metrics: null,
    error_detail: null,
    created_at: '2026-03-27T08:00:00.000Z',
    updated_at: '2026-03-27T09:00:00.000Z',
  },
  {
    id: 'TSK-PROJ-2',
    version: 1,
    projectId: 'proj-beta',
    title: 'Beta review gate',
    description: 'Review beta rollout.',
    type: 'review',
    priority: 'normal',
    creator: 'lizeyu',
    state: 'gate_waiting',
    archiveStatus: null,
    controllerRef: 'sonnet',
    current_stage: 'review',
    teamLabel: 'ops',
    workflowLabel: 'review-first',
    memberCount: 2,
    isReviewStage: true,
    sourceState: 'active',
    stageName: 'Review',
    gateType: 'approval',
    teamMembers: [],
    scheduler: null,
    scheduler_snapshot: null,
    discord: null,
    metrics: null,
    error_detail: null,
    created_at: '2026-03-27T07:00:00.000Z',
    updated_at: '2026-03-27T10:00:00.000Z',
  },
  {
    id: 'TSK-UNBOUND-1',
    version: 1,
    projectId: null,
    title: 'Unbound cleanup',
    description: 'Handle uncategorized work.',
    type: 'ops',
    priority: 'low',
    creator: 'archon',
    state: 'in_progress',
    archiveStatus: null,
    controllerRef: 'opus',
    current_stage: 'triage',
    teamLabel: 'ops',
    workflowLabel: 'triage',
    memberCount: 1,
    isReviewStage: false,
    sourceState: 'active',
    stageName: 'Triage',
    gateType: null,
    teamMembers: [],
    scheduler: null,
    scheduler_snapshot: null,
    discord: null,
    metrics: null,
    error_detail: null,
    created_at: '2026-03-27T06:00:00.000Z',
    updated_at: '2026-03-27T11:00:00.000Z',
  },
];

const taskStoreState = {
  tasks: baseTasks,
  selectedTaskId: 'TSK-PROJ-1',
  selectedTaskStatus: null,
  executionTailById: {},
  executionTailLoadingById: {},
  filters: { state: null, search: '' },
  loading: false,
  detailLoading: false,
  error: null as string | null,
  fetchTasks,
  selectTask: vi.fn(async () => undefined),
  createTask: vi.fn(async () => baseTasks[0]),
  runTaskAction: vi.fn(async () => 'live'),
  observeCraftsmen: vi.fn(async () => 'live'),
  refreshHealthSnapshot: vi.fn(async () => 'live'),
  probeCraftsmanExecution: vi.fn(async () => 'live'),
  fetchCraftsmanExecutionTail: vi.fn(async () => 'live'),
  diagnoseRuntime: vi.fn(async () => ({ status: 'accepted', summary: 'ok' })),
  restartRuntime: vi.fn(async () => ({ status: 'accepted', summary: 'ok' })),
  stopCraftsmanExecution: vi.fn(async () => ({ status: 'accepted', summary: 'ok' })),
  sendCraftsmanInputText: vi.fn(async () => 'live'),
  sendCraftsmanInputKeys: vi.fn(async () => 'live'),
  submitCraftsmanChoice: vi.fn(async () => 'live'),
  closeSubtask: vi.fn(async () => 'live'),
  archiveSubtask: vi.fn(async () => 'live'),
  cancelSubtask: vi.fn(async () => 'live'),
  cleanupTasks: vi.fn(async () => 0),
  resolveReview: vi.fn(async () => 'live'),
  setFilters: vi.fn(),
  clearError: vi.fn(),
};

const projectStoreState = {
  projects: [
    {
      id: 'proj-alpha',
      name: 'Project Alpha',
      summary: null,
      owner: 'archon',
      status: 'active',
      nomosId: null,
      repoPath: null,
      createdAt: '2026-03-27T00:00:00.000Z',
      updatedAt: '2026-03-27T00:00:00.000Z',
    },
    {
      id: 'proj-beta',
      name: 'Project Beta',
      summary: null,
      owner: 'archon',
      status: 'active',
      nomosId: null,
      repoPath: null,
      createdAt: '2026-03-27T00:00:00.000Z',
      updatedAt: '2026-03-27T00:00:00.000Z',
    },
  ],
  selectedProjectId: null,
  selectedProject: null,
  loading: false,
  detailLoading: false,
  creating: false,
  error: null as string | null,
  fetchProjects,
  createProject: vi.fn(),
  selectProject: vi.fn(),
  clearError: vi.fn(),
};

vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: () => false,
}));

vi.mock('@/stores/taskStore', () => ({
  useTaskStore: (selector?: (state: typeof taskStoreState) => unknown) =>
    selector ? selector(taskStoreState) : taskStoreState,
}));

vi.mock('@/stores/projectStore', () => ({
  useProjectStore: (selector?: (state: typeof projectStoreState) => unknown) =>
    selector ? selector(projectStoreState) : projectStoreState,
}));

vi.mock('@/stores/feedbackStore', () => ({
  useFeedbackStore: () => ({
    showMessage: vi.fn(),
  }),
}));

function renderBoardPage() {
  return render(
    <MemoryRouter>
      <BoardPage />
    </MemoryRouter>,
  );
}

function renderTasksPage() {
  return render(
    <MemoryRouter initialEntries={['/tasks']}>
      <Routes>
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/tasks/:taskId" element={<TasksPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('dashboard project-aware task grouping', () => {
  beforeEach(() => {
    fetchTasks.mockClear();
    fetchProjects.mockClear();
    taskStoreState.tasks = [...baseTasks];
    taskStoreState.selectedTaskId = 'TSK-PROJ-1';
    taskStoreState.error = null;
  });

  it('groups board columns by project and lets the operator filter a single project', () => {
    renderBoardPage();

    expect(screen.getAllByText('Project Alpha').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Project Beta').length).toBeGreaterThan(0);
    expect(screen.getAllByText('未归类').length).toBeGreaterThan(0);

    fireEvent.change(screen.getByRole('combobox', { name: '所属 Project' }), {
      target: { value: 'proj-alpha' },
    });

    expect(screen.getAllByText('Alpha API hardening').length).toBeGreaterThan(0);
    expect(screen.queryByText('Beta review gate')).not.toBeInTheDocument();
    expect(screen.queryByText('Unbound cleanup')).not.toBeInTheDocument();
  });

  it('groups the task queue by project and exposes project filters in the popover', () => {
    renderTasksPage();

    expect(screen.getAllByText('Project Alpha').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Project Beta').length).toBeGreaterThan(0);
    expect(screen.getAllByText('未归类').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /筛选与分类/i }));

    const filterDialog = screen.getByRole('dialog', { name: '筛选与分类' });
    expect(within(filterDialog).getByText('所属 Project')).toBeInTheDocument();

    fireEvent.click(within(filterDialog).getByRole('button', { name: /Project Alpha/i }));
    fireEvent.click(within(filterDialog).getByRole('button', { name: /完成筛选/i }));

    expect(screen.getAllByText('Alpha API hardening').length).toBeGreaterThan(0);
    expect(screen.queryByText('Beta review gate')).not.toBeInTheDocument();
    expect(screen.queryByText('Unbound cleanup')).not.toBeInTheDocument();
  });
});
