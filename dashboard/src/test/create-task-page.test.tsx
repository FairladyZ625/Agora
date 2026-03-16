import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateTaskPage } from '@/pages/CreateTaskPage';

const createTask = vi.fn(async () => ({ id: 'OC-200' }));
const showMessage = vi.fn();
const navigate = vi.fn();
const fetchTemplates = vi.fn(async () => 'live');
const selectTemplate = vi.fn(async () => undefined);
const fetchStatus = vi.fn(async () => 'live');
const fetchProjects = vi.fn(async () => 'live');

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();
  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

vi.mock('@/stores/taskStore', () => ({
  useTaskStore: (selector: (state: {
    createTask: typeof createTask;
  }) => unknown) => selector({ createTask }),
}));

vi.mock('@/stores/projectStore', () => ({
  useProjectStore: (selector: (state: {
    projects: Array<{ id: string; name: string; status: string; owner: string | null; summary: string | null }>;
    fetchProjects: typeof fetchProjects;
  }) => unknown) => selector({
    projects: [
      { id: 'proj-alpha', name: 'Project Alpha', status: 'active', owner: 'archon', summary: 'primary project' },
    ],
    fetchProjects,
  }),
}));

vi.mock('@/stores/feedbackStore', () => ({
  useFeedbackStore: () => ({
    showMessage,
  }),
}));

vi.mock('@/stores/templateStore', () => ({
  useTemplateStore: (selector: (state: {
    templates: Array<{ id: string; name: string; type: string; description: string; governance: string; stageCount: number; stageCountLabel: string }>;
    selectedTemplateId: string | null;
    selectedTemplate: {
      id: string;
      name: string;
      type: string;
      description: string;
      governance: string;
      stageCount: number;
      stages: Array<{ id: string; name: string; mode: string; gateType: string | null }>;
      defaultTeamRoles: string[];
      defaultTeam: Array<{
        role: string;
        memberKind?: 'controller' | 'citizen' | 'craftsman' | null;
        modelPreference: string;
        suggested: string[];
      }>;
      raw: Record<string, unknown>;
    } | null;
    fetchTemplates: typeof fetchTemplates;
    selectTemplate: typeof selectTemplate;
  }) => unknown) => selector({
    templates: [
      { id: 'coding', name: '编码任务', type: 'coding', description: '', governance: 'standard', stageCount: 2, stageCountLabel: '2 stages' },
      { id: 'brainstorm', name: '头脑风暴', type: 'brainstorm', description: '', governance: 'lean', stageCount: 2, stageCountLabel: '2 stages' },
      { id: 'coding_heavy', name: '大型编码任务', type: 'coding_heavy', description: '', governance: 'strict', stageCount: 5, stageCountLabel: '5 stages' },
      { id: 'document', name: '文档撰写', type: 'document', description: '', governance: 'standard', stageCount: 3, stageCountLabel: '3 stages' },
      { id: 'quick', name: '快速任务', type: 'quick', description: '', governance: 'lean', stageCount: 1, stageCountLabel: '1 stages' },
      { id: 'research', name: '调研任务', type: 'research', description: '', governance: 'lean', stageCount: 3, stageCountLabel: '3 stages' },
    ],
    selectedTemplateId: 'coding',
    selectedTemplate: {
      id: 'coding',
      name: '编码任务',
      type: 'coding',
      description: 'coding',
      governance: 'standard',
      stageCount: 2,
      stages: [
        { id: 'discuss', name: '讨论', mode: 'discuss', gateType: 'archon_review' },
        { id: 'develop', name: '开发', mode: 'execute', gateType: 'all_subtasks_done' },
      ],
      defaultTeamRoles: ['architect', 'developer', 'craftsman'],
      defaultTeam: [
        { role: 'architect', memberKind: 'controller', modelPreference: 'strong_reasoning', suggested: ['opus'] },
        { role: 'developer', memberKind: 'citizen', modelPreference: 'fast_coding', suggested: ['sonnet'] },
        { role: 'craftsman', memberKind: 'craftsman', modelPreference: 'coding_cli', suggested: ['claude_code'] },
      ],
      raw: {},
    },
    fetchTemplates,
    selectTemplate,
  }),
}));

vi.mock('@/stores/agentStore', () => ({
  useAgentStore: (selector: (state: {
    agents: Array<{
      id: string;
      role: string | null;
      status: string;
      presence: 'online' | 'offline' | 'disconnected' | 'stale';
      presenceReason: string | null;
      channelProviders: string[];
      hostFramework: string | null;
      inventorySources: string[];
      primaryModel: string | null;
      workspaceDir: string | null;
      accountId: string | null;
      activeTaskIds: string[];
      activeSubtaskIds: string[];
      taskCount: number;
      subtaskCount: number;
      load: number;
      lastActiveAt: string | null;
      lastSeenAt: string | null;
    }>;
    fetchStatus: typeof fetchStatus;
    craftsmanRuntime: {
      providers: Array<{
        provider: 'tmux' | 'acpx' | 'unknown';
        session: string | null;
        slotCount: number;
        readySlots: number;
        activeSlots: number;
      }>;
      slots: Array<{
        provider: 'tmux' | 'acpx' | 'unknown';
        agent: string;
        sessionId: string | null;
        runtimeMode: string | null;
        transport: string | null;
        status: string;
        ready: boolean;
        active: boolean;
        currentCommand: string | null;
        tailPreview: string | null;
        sessionReference: string | null;
        executionId: string | null;
        taskId: string | null;
        subtaskId: string | null;
        title: string | null;
      }>;
    } | null;
  }) => unknown) => selector({
    agents: [
      {
        id: 'opus',
        role: null,
        status: 'idle',
        presence: 'online',
        presenceReason: null,
        channelProviders: ['discord'],
        hostFramework: 'openclaw',
        inventorySources: ['discord', 'openclaw'],
        primaryModel: null,
        workspaceDir: null,
        accountId: 'opus',
        activeTaskIds: [],
        activeSubtaskIds: [],
        taskCount: 0,
        subtaskCount: 0,
        load: 0,
        lastActiveAt: null,
        lastSeenAt: null,
      },
      {
        id: 'sonnet',
        role: null,
        status: 'idle',
        presence: 'online',
        presenceReason: null,
        channelProviders: ['discord'],
        hostFramework: 'openclaw',
        inventorySources: ['discord', 'openclaw'],
        primaryModel: null,
        workspaceDir: null,
        accountId: 'sonnet',
        activeTaskIds: [],
        activeSubtaskIds: [],
        taskCount: 0,
        subtaskCount: 0,
        load: 0,
        lastActiveAt: null,
        lastSeenAt: null,
      },
    ],
    fetchStatus,
    craftsmanRuntime: {
      providers: [{ provider: 'tmux' as const, session: 'agora-craftsmen', slotCount: 2, readySlots: 2, activeSlots: 2 }],
      slots: [
        {
          provider: 'tmux' as const,
          agent: 'claude',
          sessionId: 'tmux:agora-craftsmen:claude',
          runtimeMode: 'tmux',
          transport: 'tmux-pane',
          status: 'running',
          ready: true,
          active: true,
          currentCommand: 'claude',
          tailPreview: null,
          sessionReference: 'claude-session-1',
          executionId: null,
          taskId: null,
          subtaskId: null,
          title: null,
        },
        {
          provider: 'tmux' as const,
          agent: 'codex',
          sessionId: 'tmux:agora-craftsmen:codex',
          runtimeMode: 'tmux',
          transport: 'tmux-pane',
          status: 'running',
          ready: true,
          active: true,
          currentCommand: 'codex',
          tailPreview: null,
          sessionReference: 'codex-session-1',
          executionId: null,
          taskId: null,
          subtaskId: null,
          title: null,
        },
      ],
    },
  }),
}));

describe('create task page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds a private-thread payload from selected citizens while keeping craftsman separate from participants', async () => {
    render(
      <MemoryRouter>
        <CreateTaskPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('任务标题'), {
      target: { value: '实现动态选人 create flow' },
    });
    fireEvent.change(screen.getByLabelText('任务描述'), {
      target: { value: '需要私有线程和定向 agent' },
    });
    fireEvent.change(screen.getByLabelText('所属 Project'), {
      target: { value: 'proj-alpha' },
    });
    const developerCard = screen.getByText('developer').closest('.detail-card');
    expect(developerCard).not.toBeNull();
    fireEvent.click(within(developerCard as HTMLElement).getByRole('button', { name: 'opus' }));
    const craftsmanCard = screen.getByText('craftsman').closest('.detail-card');
    expect(craftsmanCard).not.toBeNull();
    fireEvent.click(within(craftsmanCard as HTMLElement).getByRole('button', { name: 'codex' }));
    fireEvent.click(screen.getByRole('button', { name: '创建任务' }));

    await waitFor(() => {
      expect(createTask).toHaveBeenCalledWith(expect.objectContaining({
        title: '实现动态选人 create flow',
        type: 'coding',
        project_id: 'proj-alpha',
        team_override: {
          members: [
            { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
            { role: 'developer', agentId: 'opus', member_kind: 'citizen', model_preference: 'fast_coding' },
            { role: 'craftsman', agentId: 'codex', member_kind: 'craftsman', model_preference: 'coding_cli' },
          ],
        },
        im_target: {
          provider: 'discord',
          visibility: 'private',
          participant_refs: ['opus'],
        },
      }));
    });
    expect(fetchTemplates).toHaveBeenCalled();
    expect(fetchProjects).toHaveBeenCalled();
    expect(fetchStatus).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/tasks/OC-200');
  });

  it('renders template choices from the live template catalog instead of a hardcoded subset', () => {
    render(
      <MemoryRouter>
        <CreateTaskPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: '头脑风暴' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '大型编码任务' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '调研任务' })).toBeInTheDocument();
  });

  it('renders craftsman selectors from tmux runtime inventory instead of citizen agents', () => {
    render(
      <MemoryRouter>
        <CreateTaskPage />
      </MemoryRouter>,
    );

    const craftsmanCard = screen.getByText('craftsman').closest('.detail-card');
    expect(craftsmanCard).not.toBeNull();
    expect(within(craftsmanCard as HTMLElement).getByRole('button', { name: 'claude' })).toBeInTheDocument();
    expect(within(craftsmanCard as HTMLElement).getByRole('button', { name: 'codex' })).toBeInTheDocument();
    expect(within(craftsmanCard as HTMLElement).queryByRole('button', { name: 'sonnet' })).not.toBeInTheDocument();
  });

  it('shows the selected controller agent in the provisioning summary', () => {
    render(
      <MemoryRouter>
        <CreateTaskPage />
      </MemoryRouter>,
    );

    const provisioning = screen.getByTestId('create-task-provisioning');
    expect(within(provisioning).getByText('主控 Agent')).toBeInTheDocument();
    expect(within(provisioning).getAllByText('opus').length).toBeGreaterThan(0);
  });
});
