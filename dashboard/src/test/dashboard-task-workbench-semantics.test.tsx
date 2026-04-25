import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TasksPage } from '@/pages/TasksPage';
import { createMockTasks, getMockTaskStatus } from '@/lib/mockDashboard';
import * as api from '@/lib/api';

const fetchTasks = vi.fn(async () => undefined);
const fetchProjects = vi.fn(async () => 'live');

const taskStoreState = {
  tasks: createMockTasks(),
  loading: false,
  detailLoading: false,
  error: null as string | null,
  selectedTaskId: 'TSK-001',
  selectedTaskStatus: getMockTaskStatus('TSK-001'),
  executionTailById: {},
  executionTailLoadingById: {},
  fetchTasks,
  selectTask: vi.fn(async () => undefined),
  runTaskAction: vi.fn(async () => 'live'),
  observeCraftsmen: vi.fn(async () => 'live'),
  diagnoseRuntime: vi.fn(async () => ({ status: 'accepted', summary: 'ok', detail: null })),
  probeCraftsmanExecution: vi.fn(async () => 'live'),
  fetchCraftsmanExecutionTail: vi.fn(async () => 'live'),
  restartRuntime: vi.fn(async () => ({ status: 'accepted', summary: 'ok', detail: null })),
  sendCraftsmanInputText: vi.fn(async () => 'live'),
  sendCraftsmanInputKeys: vi.fn(async () => 'live'),
  stopCraftsmanExecution: vi.fn(async () => ({ status: 'accepted', summary: 'ok', detail: null })),
  submitCraftsmanChoice: vi.fn(async () => 'live'),
  closeSubtask: vi.fn(async () => 'live'),
  archiveSubtask: vi.fn(async () => 'live'),
  cancelSubtask: vi.fn(async () => 'live'),
};

const projectStoreState = {
  projects: [
    {
      id: 'proj-alpha',
      name: 'Project Alpha',
      summary: 'Alpha summary',
      owner: 'archon',
      status: 'active',
      nomosId: 'agora/default',
      repoPath: '/repo/proj-alpha',
      createdAt: '2026-04-21T00:00:00.000Z',
      updatedAt: '2026-04-21T00:00:00.000Z',
    },
  ],
  fetchProjects,
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

vi.mock('@/stores/sessionStore', () => ({
  useSessionStore: (selector?: (state: { accountId: number | null }) => unknown) =>
    selector ? selector({ accountId: 7 }) : { accountId: 7 },
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    getProjectContextDelivery: vi.fn(async () => ({
      scope: 'project_context',
      delivery: {
        briefing: {
          project_id: 'proj-alpha',
          audience: 'controller',
          markdown: '# Task Briefing\n\nUse the runtime delivery manifest and keep adapters outside core.',
          source_documents: [
            {
              kind: 'decision',
              slug: 'runtime-boundary',
              title: 'Runtime Boundary',
              path: '/brain/projects/proj-alpha/knowledge/decisions/runtime-boundary.md',
            },
          ],
        },
        reference_bundle: {
          scope: 'project_context',
          mode: 'task',
          project_id: 'proj-alpha',
          task_id: 'TSK-001',
          inventory: {
            scope: 'project_context',
            project_id: 'proj-alpha',
            generated_at: '2026-04-21T00:00:00.000Z',
            entries: [],
          },
          project_map: {
            index_reference_key: 'index:index',
            timeline_reference_key: 'timeline:timeline',
            inventory_count: 3,
          },
          references: [
            {
              scope: 'project_context',
              reference_key: 'decision:runtime-boundary',
              project_id: 'proj-alpha',
              kind: 'decision',
              slug: 'runtime-boundary',
              title: 'Runtime Boundary',
              path: '/brain/projects/proj-alpha/knowledge/decisions/runtime-boundary.md',
            },
          ],
        },
        attention_routing_plan: null,
        runtime_delivery: {
          task_id: 'TSK-001',
          task_title: '实现 Agent 权限分级验证',
          workspace_path: '/tmp/proj-alpha/tasks/TSK-001',
          manifest_path: '/tmp/proj-alpha/tasks/TSK-001/04-context/runtime-delivery-manifest.md',
          artifact_paths: {
            controller: '/tmp/proj-alpha/tasks/TSK-001/04-context/project-context-controller.md',
            citizen: '/tmp/proj-alpha/tasks/TSK-001/04-context/project-context-citizen.md',
            craftsman: '/tmp/proj-alpha/tasks/TSK-001/04-context/project-context-craftsman.md',
          },
        },
      },
    })),
  };
});

describe('task workbench semantic surfaces', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    taskStoreState.tasks = createMockTasks().map((task) => (
      task.id === 'TSK-001'
        ? { ...task, projectId: 'proj-alpha' }
        : task
    ));
    const status = getMockTaskStatus('TSK-001');
    if (!status) {
      throw new Error('Missing mock task status');
    }
    taskStoreState.selectedTaskId = 'TSK-001';
    taskStoreState.selectedTaskStatus = {
      ...status,
      task: {
        ...status.task,
        projectId: 'proj-alpha',
        controllerRef: 'archon',
        gateType: 'approval',
        authority: {
          approverAccountId: 7,
        },
        teamMembers: [
          {
            role: 'developer',
            agentId: 'cc-connect:agora-codex-immediate',
            model_preference: 'codex',
            runtime_target_ref: 'cc-connect:agora-codex-immediate',
            runtime_flavor: 'codex',
            runtime_selection_source: 'project_flavor_default',
            runtime_selection_reason: 'project runtime_targets.flavors.codex',
          },
        ],
      },
      currentStageRoster: {
        stageId: 'policy-guard',
        roster: {
          include_roles: ['developer'],
          keep_controller: true,
        },
        desiredParticipantRefs: ['cc-connect:agora-codex-immediate'],
        joinedParticipantRefs: ['cc-connect:agora-codex-immediate'],
      },
      conversation: [
        {
          id: 'conv-1',
          task_id: 'TSK-001',
          binding_id: 'bind-1',
          provider: 'discord',
          provider_message_ref: null,
          parent_message_ref: null,
          direction: 'system',
          author_kind: 'system',
          author_ref: 'agora-core',
          display_name: 'Agora Core',
          body: 'Runtime selection resolved against the project codex default.',
          body_format: 'plain_text',
          occurred_at: '2026-04-21T00:00:00.000Z',
          ingested_at: '2026-04-21T00:00:00.000Z',
          metadata: null,
          statusEvent: {
            eventType: 'runtime-selection-recorded',
            taskId: 'TSK-001',
            taskState: 'in_progress',
            currentStage: 'policy-guard',
            executionKind: 'cc-connect',
            allowedActions: ['advance'],
            controllerRef: 'archon',
            workspacePath: '/tmp/proj-alpha/tasks/TSK-001',
            participantRefs: ['cc-connect:agora-codex-immediate'],
          },
        },
      ],
    };
  });

  it('renders briefing, reference bundle, and participants for project-bound tasks', async () => {
    render(
      <MemoryRouter initialEntries={['/tasks']}>
        <Routes>
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/tasks/:taskId" element={<TasksPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('任务简报')).toBeInTheDocument();
    expect(screen.getByText('引用包')).toBeInTheDocument();
    expect(screen.getByText('参与者')).toBeInTheDocument();
    expect(screen.getByText('捕获')).toBeInTheDocument();
    expect(screen.getByText('回流')).toBeInTheDocument();
    expect(screen.getByText('审计')).toBeInTheDocument();

    expect(await screen.findByText('Runtime Boundary')).toBeInTheDocument();
    expect(screen.getByText('权限矩阵初版已经落地，待补 CLI override 验证。')).toBeInTheDocument();
    expect(screen.getAllByText('实现角色矩阵校验').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/reason: project runtime_targets\.flavors\.codex/).length).toBeGreaterThan(0);
    expect(screen.getByText('Roster policy')).toBeInTheDocument();
    expect(
      screen.getAllByText((_, node) => node?.textContent?.includes('/tmp/proj-alpha/tasks/TSK-001/04-context/runtime-delivery-manifest.md') ?? false).length,
    ).toBeGreaterThan(0);

    const participantsSection = screen.getByText('参与者').closest('section');
    expect(participantsSection).not.toBeNull();
    expect(within(participantsSection!).getByText('developer / cc-connect:agora-codex-immediate')).toBeInTheDocument();
    expect(within(participantsSection!).getByText(/reason: project runtime_targets\.flavors\.codex/)).toBeInTheDocument();

    await waitFor(() => {
      expect(vi.mocked(api.getProjectContextDelivery)).toHaveBeenCalledWith('proj-alpha', {
        audience: 'controller',
        task_id: 'TSK-001',
      });
    });
  });

  it('clears project context delivery when switching to a non-project task', async () => {
    const view = render(
      <MemoryRouter initialEntries={['/tasks']}>
        <Routes>
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/tasks/:taskId" element={<TasksPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Runtime Boundary')).toBeInTheDocument();

    const nextStatus = getMockTaskStatus('TSK-002');
    if (!nextStatus) {
      throw new Error('Missing mock task status for TSK-002');
    }

    taskStoreState.selectedTaskId = 'TSK-002';
    taskStoreState.selectedTaskStatus = {
      ...nextStatus,
      task: {
        ...nextStatus.task,
        projectId: null,
        teamMembers: [],
      },
    };

    view.rerender(
      <MemoryRouter initialEntries={['/tasks']}>
        <Routes>
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/tasks/:taskId" element={<TasksPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.queryByText('Runtime Boundary')).not.toBeInTheDocument();
    });
    expect(screen.getByText('当前任务还没有可展示的引用包。')).toBeInTheDocument();
    expect(vi.mocked(api.getProjectContextDelivery)).toHaveBeenCalledTimes(1);
  });
});
