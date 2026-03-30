import { MemoryRouter } from 'react-router';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from '@/App';
import type { Task, TaskStatus } from '@/types/task';

const createTask = vi.fn(async () => ({ id: 'OC-009' }));

interface TaskStoreMockState {
  tasks: Task[];
  loading: boolean;
  detailLoading: boolean;
  error: string | null;
  selectedTaskId: string | null;
  selectedTaskStatus: TaskStatus | null;
  executionTailById: Record<string, unknown>;
  executionTailLoadingById: Record<string, boolean>;
  filters: { state: string | null; search: string };
  fetchTasks: ReturnType<typeof vi.fn>;
  selectTask: ReturnType<typeof vi.fn>;
  resolveReview: ReturnType<typeof vi.fn>;
  createTask: typeof createTask;
  runTaskAction: ReturnType<typeof vi.fn>;
  observeCraftsmen: ReturnType<typeof vi.fn>;
  refreshHealthSnapshot: ReturnType<typeof vi.fn>;
  probeCraftsmanExecution: ReturnType<typeof vi.fn>;
  fetchCraftsmanExecutionTail: ReturnType<typeof vi.fn>;
  diagnoseRuntime: ReturnType<typeof vi.fn>;
  restartRuntime: ReturnType<typeof vi.fn>;
  stopCraftsmanExecution: ReturnType<typeof vi.fn>;
  sendCraftsmanInputText: ReturnType<typeof vi.fn>;
  sendCraftsmanInputKeys: ReturnType<typeof vi.fn>;
  submitCraftsmanChoice: ReturnType<typeof vi.fn>;
  closeSubtask: ReturnType<typeof vi.fn>;
  archiveSubtask: ReturnType<typeof vi.fn>;
  cancelSubtask: ReturnType<typeof vi.fn>;
  cleanupTasks: ReturnType<typeof vi.fn>;
  setFilters: ReturnType<typeof vi.fn>;
  clearError: ReturnType<typeof vi.fn>;
}

const taskStoreState: TaskStoreMockState = {
  tasks: [
    {
      id: 'OC-001',
      version: 1,
      title: 'API 收口',
      description: '任务一',
      type: 'coding',
      priority: 'high',
      creator: 'archon',
      state: 'in_progress',
      archiveStatus: null,
      current_stage: 'develop',
      teamLabel: 'opus / sonnet',
      workflowLabel: 'discuss-execute-review',
      memberCount: 2,
      isReviewStage: false,
      sourceState: 'active',
      scheduler: null,
      scheduler_snapshot: null,
      discord: null,
      metrics: null,
      error_detail: null,
      created_at: '2026-03-07T00:00:00.000Z',
      updated_at: '2026-03-07T01:00:00.000Z',
    },
  ],
  loading: false,
  detailLoading: false,
  error: null,
  selectedTaskId: null,
  selectedTaskStatus: null,
  executionTailById: {},
  executionTailLoadingById: {},
  filters: { state: null, search: '' },
  fetchTasks: vi.fn(async () => 'live'),
  selectTask: vi.fn(async () => undefined),
  resolveReview: vi.fn(async () => 'live'),
  createTask,
  runTaskAction: vi.fn(async () => 'live'),
  observeCraftsmen: vi.fn(async () => 'live'),
  refreshHealthSnapshot: vi.fn(async () => 'live'),
  probeCraftsmanExecution: vi.fn(async () => 'live'),
  fetchCraftsmanExecutionTail: vi.fn(async () => 'live'),
  diagnoseRuntime: vi.fn(async () => ({ summary: 'ok', detail: null, status: 'accepted' })),
  restartRuntime: vi.fn(async () => ({ summary: 'ok', detail: null, status: 'accepted' })),
  stopCraftsmanExecution: vi.fn(async () => ({ summary: 'ok', detail: null, status: 'accepted' })),
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
  useTaskStore: (selector?: (state: TaskStoreMockState) => unknown) =>
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

vi.mock('@/stores/sessionStore', () => ({
  useSessionStore: (selector?: (state: {
    authenticated: boolean;
    status: string;
    username: string;
    accountId: number | null;
    role: string;
    refresh: () => Promise<string>;
    logout: () => Promise<void>;
    error: string | null;
  }) => unknown) => {
    const state = {
      authenticated: true,
      status: 'ready',
      username: 'admin',
      accountId: 9,
      role: 'admin',
      refresh: vi.fn(async () => 'live'),
      logout: vi.fn(async () => undefined),
      error: null,
    };
    return selector ? selector(state) : state;
  },
}));

describe('dashboard phase 2 routes', () => {
  it('adds board and create-task routes to the main app shell', () => {
    taskStoreState.tasks = [
      ...taskStoreState.tasks,
      {
        ...taskStoreState.tasks[0],
        id: 'OC-002',
        title: '暂停中的任务',
        state: 'paused',
        sourceState: 'paused',
      },
    ];
    render(
      <MemoryRouter initialEntries={['/board']}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: '任务看板' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /创建 任务入口/i })).toBeInTheDocument();
    expect(screen.getAllByText('中断 / 停滞').length).toBeGreaterThan(0);
    expect(screen.getAllByText('暂停中的任务').length).toBeGreaterThan(0);
  });

  it('renders the create task workspace on the dedicated route', () => {
    render(
      <MemoryRouter initialEntries={['/tasks/new']}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: '创建任务' })).toBeInTheDocument();
    expect(screen.getByLabelText('任务标题')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '创建任务' })).toBeInTheDocument();
  });

  it('shows task action controls for actionable live task details', () => {
    taskStoreState.selectedTaskId = 'OC-001';
    taskStoreState.executionTailById = {
      'exec-1': {
        output: '\u001b[32mBuild passed\u001b[0m\nNext step ready',
        available: true,
        fetchedAt: '2026-03-07T00:15:00.000Z',
        live: true,
      },
    };
    taskStoreState.selectedTaskStatus = {
      task: {
        ...taskStoreState.tasks[0],
        gateType: 'approval',
        sourceState: 'active',
        authority: {
          approverAccountId: 7,
        },
        teamMembers: [
          { role: 'architect', agentId: 'opus', model_preference: 'strong_reasoning' },
          { role: 'reviewer', agentId: 'glm5', model_preference: 'chinese_strong' },
        ],
      },
      flow_log: [],
      progress_log: [],
      subtasks: [
        {
          id: 'dev-api',
          task_id: 'OC-001',
          stage_id: 'develop',
          title: '后端 API',
          assignee: 'sonnet',
          status: 'running',
          output: null,
          craftsman_type: 'backend',
          dispatch_status: 'running',
          dispatched_at: '2026-03-07T00:10:00.000Z',
          done_at: null,
        },
      ],
      subtaskExecutions: {
        'dev-api': [
          {
            executionId: 'exec-1',
            taskId: 'OC-001',
            subtaskId: 'dev-api',
            adapter: 'codex',
            mode: 'one_shot',
            sessionId: 'tmux:1',
            status: 'needs_input',
            briefPath: null,
            workdir: '/tmp/agora',
            callbackPayload: {
              inputRequest: {
                transport: 'text',
                hint: 'Please provide the next coding instruction.',
                textPlaceholder: null,
                keys: [],
                choiceOptions: [],
              },
            },
            error: null,
            startedAt: '2026-03-07T00:10:00.000Z',
            finishedAt: null,
            createdAt: '2026-03-07T00:10:00.000Z',
            updatedAt: '2026-03-07T00:10:00.000Z',
          },
        ],
      },
      governanceSnapshot: {
        limits: {
          maxConcurrentRunning: 4,
          maxConcurrentPerAgent: 2,
          hostMemoryWarningUtilizationLimit: 0.7,
          hostMemoryUtilizationLimit: 0.8,
          hostSwapWarningUtilizationLimit: 0.1,
          hostSwapUtilizationLimit: 0.2,
          hostLoadPerCpuWarningLimit: 1.2,
          hostLoadPerCpuLimit: 1.5,
        },
        activeExecutions: 1,
        activeByAssignee: [{ assignee: 'opus', count: 1 }],
        activeExecutionDetails: [],
        hostPressureStatus: 'healthy',
        warnings: [],
        host: {
          observedAt: '2026-03-07T00:12:00.000Z',
          cpuCount: 8,
          load1m: 0.72,
          memoryTotalBytes: 1000,
          memoryUsedBytes: 320,
          memoryUtilization: 0.32,
          swapTotalBytes: 1000,
          swapUsedBytes: 0,
          swapUtilization: 0,
        },
      },
      conversation: [
        {
          id: 'entry-1',
          task_id: 'OC-001',
          binding_id: 'binding-1',
          provider: 'discord',
          provider_message_ref: 'msg-1',
          parent_message_ref: null,
          direction: 'inbound',
          author_kind: 'human',
          author_ref: 'user-1',
          display_name: 'Lizeyu',
          body: '会话消息内容',
          body_format: 'plain_text',
          occurred_at: '2026-03-07T00:12:00.000Z',
          ingested_at: '2026-03-07T00:12:01.000Z',
          metadata: {
            event_type: 'craftsman_completed',
            task_id: 'OC-001',
            task_state: 'active',
            current_stage: 'develop',
            execution_kind: 'craftsman_dispatch',
            allowed_actions: ['dispatch_craftsman'],
            controller_ref: 'opus',
            workspace_path: '/tmp/agora-ai-brain/tasks/OC-001',
            participant_refs: ['opus'],
          },
          statusEvent: {
            eventType: 'craftsman_completed',
            taskId: 'OC-001',
            taskState: 'active',
            currentStage: 'develop',
            executionKind: 'craftsman_dispatch',
            allowedActions: ['dispatch_craftsman'],
            controllerRef: 'opus',
            workspacePath: '/tmp/agora-ai-brain/tasks/OC-001',
            participantRefs: ['opus'],
          },
        },
      ],
    };

    render(
      <MemoryRouter initialEntries={['/tasks/OC-001']}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('button', { name: 'Reviewer 通过' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reviewer 打回' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '暂停任务' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '标记 dev-api 完成' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '运行观察' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '探测执行' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '发送输入' })).toBeInTheDocument();
    expect(screen.getByText('会话消息内容')).toBeInTheDocument();
    expect(screen.getAllByText('craftsman_completed').length).toBeGreaterThan(0);
    expect(screen.getByText(/execution: craftsman_dispatch/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '执行控制面' })).toBeInTheDocument();
    expect(screen.getAllByText('Please provide the next coding instruction.').length).toBeGreaterThan(0);
    expect(screen.getByRole('log', { name: 'Agent runtime output' })).toBeInTheDocument();
  });

  it('hides gate action controls when the selected task is no longer active', () => {
    taskStoreState.selectedTaskId = 'OC-001';
    taskStoreState.selectedTaskStatus = {
      task: {
        ...taskStoreState.tasks[0],
        state: 'completed',
        sourceState: 'done',
        gateType: 'approval',
        current_stage: 'review',
        teamMembers: [
          { role: 'architect', agentId: 'opus', model_preference: 'strong_reasoning' },
          { role: 'reviewer', agentId: 'glm5', model_preference: 'chinese_strong' },
        ],
      },
      flow_log: [],
      progress_log: [],
      subtasks: [],
      currentStageRoster: undefined,
    };

    render(
      <MemoryRouter initialEntries={['/tasks/OC-001']}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('button', { name: 'Reviewer 通过' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reviewer 打回' })).not.toBeInTheDocument();
  });

  it('exposes orphan cleanup from the settings surface', () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: '清理 orphaned' })).toBeInTheDocument();
  });
});
