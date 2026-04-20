import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateTaskPage } from '@/pages/CreateTaskPage';

const createTask = vi.fn(async () => ({ id: 'OC-200' }));
const apiMocks = vi.hoisted(() => ({
  listSkills: vi.fn(async () => ([
    {
      skill_ref: 'planning-with-files',
      resolved_path: '/tmp/skills/planning-with-files/SKILL.md',
    },
    {
      skill_ref: 'refactoring-ui',
      resolved_path: '/tmp/skills/refactoring-ui/SKILL.md',
    },
    {
      skill_ref: 'frontend-design',
      resolved_path: '/tmp/skills/frontend-design/SKILL.md',
    },
  ])),
  listRuntimeTargets: vi.fn(async () => ([
    {
      runtimeTargetRef: 'cc-connect:agora-claude',
      inventoryKind: 'runtime_target' as const,
      runtimeProvider: 'cc-connect',
      runtimeFlavor: 'claude-code',
      hostFramework: 'cc-connect',
      primaryModel: 'claude-sonnet-4.5',
      workspaceDir: '/Users/lizeyu/Projects/Agora',
      channelProviders: ['discord'],
      inventorySources: ['cc-connect'],
      discordBotUserIds: ['1234567890'],
      enabled: true,
      displayName: 'Agora Claude Runtime',
      tags: ['review'],
      allowedProjects: ['proj-alpha'],
      defaultRoles: ['developer', 'reviewer'],
      presentationMode: 'im_presented' as const,
      presentationProvider: 'discord',
      presentationIdentityRef: '1234567890',
      metadata: null,
      discovered: true,
    },
  ])),
}));
const showMessage = vi.fn();
const navigate = vi.fn();
const fetchTemplates = vi.fn(async () => 'live');
const selectTemplate = vi.fn(async () => undefined);
const fetchStatus = vi.fn(async () => 'live');
const fetchProjects = vi.fn(async () => 'live');
const fetchProjectMembers = vi.fn(async () => ([
  {
    id: 'pm-1',
    projectId: 'proj-alpha',
    accountId: 11,
    role: 'admin' as const,
    status: 'active' as const,
    addedByAccountId: null,
    createdAt: '2026-03-24T00:00:00.000Z',
    updatedAt: '2026-03-24T00:00:00.000Z',
  },
  {
    id: 'pm-2',
    projectId: 'proj-alpha',
    accountId: 12,
    role: 'member' as const,
    status: 'active' as const,
    addedByAccountId: 11,
    createdAt: '2026-03-24T00:00:00.000Z',
    updatedAt: '2026-03-24T00:00:00.000Z',
  },
]));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();
  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

vi.mock('@/lib/api', () => ({
  listSkills: apiMocks.listSkills,
  listRuntimeTargets: apiMocks.listRuntimeTargets,
}));

vi.mock('@/stores/taskStore', () => ({
  useTaskStore: (selector: (state: {
    createTask: typeof createTask;
  }) => unknown) => selector({ createTask }),
}));

vi.mock('@/stores/projectStore', () => ({
  useProjectStore: (selector: (state: {
    projects: Array<{ id: string; name: string; status: string; owner: string | null; summary: string | null }>;
    projectMembershipsByProject: Record<string, Array<{
      id: string;
      projectId: string;
      accountId: number;
      role: 'admin' | 'member';
      status: 'active' | 'removed';
      addedByAccountId: number | null;
      createdAt: string;
      updatedAt: string;
    }>>;
    fetchProjects: typeof fetchProjects;
    fetchProjectMembers: typeof fetchProjectMembers;
  }) => unknown) => selector({
    projects: [
      { id: 'proj-alpha', name: 'Project Alpha', status: 'active', owner: 'archon', summary: 'primary project' },
    ],
    projectMembershipsByProject: {
      'proj-alpha': [
        {
          id: 'pm-1',
          projectId: 'proj-alpha',
          accountId: 11,
          role: 'admin',
          status: 'active',
          addedByAccountId: null,
          createdAt: '2026-03-24T00:00:00.000Z',
          updatedAt: '2026-03-24T00:00:00.000Z',
        },
        {
          id: 'pm-2',
          projectId: 'proj-alpha',
          accountId: 12,
          role: 'member',
          status: 'active',
          addedByAccountId: 11,
          createdAt: '2026-03-24T00:00:00.000Z',
          updatedAt: '2026-03-24T00:00:00.000Z',
        },
      ],
    },
    fetchProjects,
    fetchProjectMembers,
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
        { role: 'developer', memberKind: 'citizen', modelPreference: 'fast_coding', suggested: ['sonnet', 'review'] },
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
      inventoryKind?: 'agent' | 'runtime_target';
      runtimeProvider?: string | null;
      runtimeFlavor?: string | null;
      runtimeTargetRef?: string | null;
      discordBotUserIds?: string[];
      role: string | null;
      status: string;
      presence: 'online' | 'offline' | 'disconnected' | 'stale';
      selectability: 'selectable' | 'restricted';
      selectabilityReason: string | null;
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
        selectability: 'selectable',
        selectabilityReason: 'live_session',
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
        presence: 'offline',
        selectability: 'selectable',
        selectabilityReason: 'inventory_launchable',
        presenceReason: 'inventory_only',
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
      {
        id: 'review',
        role: null,
        status: 'idle',
        presence: 'disconnected',
        selectability: 'restricted',
        selectabilityReason: 'provider_disconnected',
        presenceReason: 'health_monitor_restart',
        channelProviders: ['discord'],
        hostFramework: 'openclaw',
        inventorySources: ['discord', 'openclaw'],
        primaryModel: null,
        workspaceDir: null,
        accountId: 'review',
        activeTaskIds: [],
        activeSubtaskIds: [],
        taskCount: 0,
        subtaskCount: 0,
        load: 0,
        lastActiveAt: null,
        lastSeenAt: null,
      },
      {
        id: 'cc-connect:agora-claude',
        inventoryKind: 'runtime_target' as const,
        runtimeProvider: 'cc-connect',
        runtimeFlavor: 'claude-code',
        runtimeTargetRef: 'cc-connect:agora-claude',
        discordBotUserIds: ['1234567890'],
        role: null,
        status: 'idle',
        presence: 'offline',
        selectability: 'selectable',
        selectabilityReason: 'inventory_launchable',
        presenceReason: 'inventory_only',
        channelProviders: ['discord'],
        hostFramework: 'cc-connect',
        inventorySources: ['cc-connect'],
        primaryModel: 'claude-sonnet-4.5',
        workspaceDir: '/Users/lizeyu/Projects/Agora',
        accountId: null,
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
    window.localStorage.clear();
  });

  it('builds a private-thread payload from selected citizens while keeping craftsman separate from participants', async () => {
    render(
      <MemoryRouter>
        <CreateTaskPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(apiMocks.listSkills).toHaveBeenCalled();
    });

    fireEvent.change(screen.getByLabelText('任务标题'), {
      target: { value: '实现动态选人 create flow' },
    });
    fireEvent.change(screen.getByLabelText('任务描述'), {
      target: { value: '需要私有线程和定向 agent' },
    });
    fireEvent.change(screen.getByLabelText('所属 Project'), {
      target: { value: 'proj-alpha' },
    });
    fireEvent.change(screen.getByLabelText('任务 Owner'), {
      target: { value: '11' },
    });
    fireEvent.change(screen.getByLabelText('任务 Assignee'), {
      target: { value: '12' },
    });
    fireEvent.change(screen.getByLabelText('任务 Approver'), {
      target: { value: '11' },
    });
    const developerCard = screen.getByText('developer').closest('.detail-card');
    expect(developerCard).not.toBeNull();
    fireEvent.click(within(developerCard as HTMLElement).getByRole('button', { name: 'opus' }));
    fireEvent.click(within(developerCard as HTMLElement).getByRole('button', { name: '为 developer 配置专属 Skills' }));
    fireEvent.change(within(developerCard as HTMLElement).getByLabelText('搜索 developer 专属 Skills'), {
      target: { value: 'refactor' },
    });
    fireEvent.click(within(developerCard as HTMLElement).getByRole('button', { name: 'refactoring-ui' }));
    const craftsmanCard = screen.getByText('craftsman').closest('.detail-card');
    expect(craftsmanCard).not.toBeNull();
    fireEvent.click(within(craftsmanCard as HTMLElement).getByRole('button', { name: 'codex' }));
    fireEvent.change(screen.getByLabelText('搜索全局 Skills'), {
      target: { value: 'planning' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'planning-with-files' }));
    fireEvent.click(screen.getByRole('button', { name: '创建任务' }));

    await waitFor(() => {
      expect(createTask).toHaveBeenCalledWith(expect.objectContaining({
        title: '实现动态选人 create flow',
        type: 'coding',
        project_id: 'proj-alpha',
        skill_policy: {
          global_refs: ['planning-with-files'],
          role_refs: {
            developer: ['refactoring-ui'],
          },
          enforcement: 'required',
        },
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
        authority: {
          owner_account_id: 11,
          assignee_account_id: 12,
          approver_account_id: 11,
          controller_agent_ref: 'opus',
        },
      }));
    });
    expect(fetchTemplates).toHaveBeenCalled();
    expect(fetchProjects).toHaveBeenCalled();
    expect(fetchStatus).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/projects/proj-alpha/work/OC-200');
  });

  it('hydrates source context from project brain query params and prepends it to the task draft', async () => {
    render(
      <MemoryRouter initialEntries={['/tasks/new?project=proj-alpha&source_kind=knowledge&source_title=Runtime+Boundary&source_ref=knowledge%2Fdecision%2Fruntime-boundary&source_task_ids=OC-100%2COC-101&source_snippet=Keep+runtime+adapters+outside+core.']}>
        <CreateTaskPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('来源上下文')).toBeInTheDocument();
    expect(screen.getByText('Runtime Boundary')).toBeInTheDocument();
    expect(within(screen.getByLabelText('来源上下文')).getByText(/OC-100, OC-101/)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/Keep runtime adapters outside core\./)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('任务标题'), {
      target: { value: '基于 brain context 创建任务' },
    });
    fireEvent.click(screen.getByRole('button', { name: '创建任务' }));

    await waitFor(() => {
      expect(createTask).toHaveBeenCalledWith(expect.objectContaining({
        project_id: 'proj-alpha',
        description: expect.stringContaining('Runtime Boundary'),
      }));
    });
  });
  it('renders template choices from the live template catalog instead of a hardcoded subset', async () => {
    render(
      <MemoryRouter>
        <CreateTaskPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(apiMocks.listSkills).toHaveBeenCalled();
    });

    expect(screen.getByRole('button', { name: '头脑风暴' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '大型编码任务' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '调研任务' })).toBeInTheDocument();
  });

  it('renders craftsman selectors from tmux runtime inventory instead of citizen agents', async () => {
    render(
      <MemoryRouter>
        <CreateTaskPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(apiMocks.listSkills).toHaveBeenCalled();
    });

    const craftsmanCard = screen.getByText('craftsman').closest('.detail-card');
    expect(craftsmanCard).not.toBeNull();
    expect(within(craftsmanCard as HTMLElement).getByRole('button', { name: 'claude' })).toBeInTheDocument();
    expect(within(craftsmanCard as HTMLElement).getByRole('button', { name: 'codex' })).toBeInTheDocument();
    expect(within(craftsmanCard as HTMLElement).queryByRole('button', { name: 'sonnet' })).not.toBeInTheDocument();
  });

  it('shows the selected controller agent in the provisioning summary', async () => {
    render(
      <MemoryRouter>
        <CreateTaskPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(apiMocks.listSkills).toHaveBeenCalled();
    });

    const provisioning = screen.getByTestId('create-task-provisioning');
    expect(within(provisioning).getByText('主控 Agent')).toBeInTheDocument();
    expect(within(provisioning).getAllByText('opus').length).toBeGreaterThan(0);
  });

  it('keeps offline but selectable agents available in role assignment choices', async () => {
    render(
      <MemoryRouter>
        <CreateTaskPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(apiMocks.listSkills).toHaveBeenCalled();
    });

    const developerCard = screen.getByText('developer').closest('.detail-card');
    expect(developerCard).not.toBeNull();
    expect(within(developerCard as HTMLElement).getByRole('button', { name: 'sonnet' })).toBeInTheDocument();
  });

  it('groups runtime targets separately and allows explicit runtime target assignment', async () => {
    render(
      <MemoryRouter>
        <CreateTaskPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(apiMocks.listRuntimeTargets).toHaveBeenCalled();
    });

    fireEvent.change(screen.getByLabelText('任务标题'), {
      target: { value: '显式选择 runtime target' },
    });
    fireEvent.change(screen.getByLabelText('任务描述'), {
      target: { value: 'developer 直接绑定到 cc-connect target' },
    });
    fireEvent.change(screen.getByLabelText('所属 Project'), {
      target: { value: 'proj-alpha' },
    });
    fireEvent.change(screen.getByLabelText('任务 Owner'), {
      target: { value: '11' },
    });
    fireEvent.change(screen.getByLabelText('任务 Assignee'), {
      target: { value: '12' },
    });
    fireEvent.change(screen.getByLabelText('任务 Approver'), {
      target: { value: '11' },
    });

    const developerCard = screen.getByText('developer').closest('.detail-card');
    expect(developerCard).not.toBeNull();
    expect(within(developerCard as HTMLElement).getByText('原生 Agents')).toBeInTheDocument();
    expect(within(developerCard as HTMLElement).getByText('Runtime Targets')).toBeInTheDocument();
    fireEvent.click(within(developerCard as HTMLElement).getByRole('button', { name: 'Agora Claude Runtime' }));
    fireEvent.click(screen.getByRole('button', { name: '创建任务' }));

    await waitFor(() => {
      expect(createTask).toHaveBeenCalledWith(expect.objectContaining({
        title: '显式选择 runtime target',
        project_id: 'proj-alpha',
        team_override: {
          members: expect.arrayContaining([
            { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
            { role: 'developer', agentId: 'cc-connect:agora-claude', member_kind: 'citizen', model_preference: 'fast_coding' },
          ]),
        },
        im_target: {
          provider: 'discord',
          visibility: 'private',
          participant_refs: ['opus', 'cc-connect:agora-claude'],
        },
      }));
    });
  });

  it('shows restricted suggested agents with a human-readable reason instead of silently hiding them', async () => {
    render(
      <MemoryRouter>
        <CreateTaskPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(apiMocks.listSkills).toHaveBeenCalled();
    });

    const developerCard = screen.getByText('developer').closest('.detail-card');
    expect(developerCard).not.toBeNull();
    expect(within(developerCard as HTMLElement).queryByRole('button', { name: 'review' })).not.toBeInTheDocument();
    expect(within(developerCard as HTMLElement).getByText('review')).toBeInTheDocument();
    expect(within(developerCard as HTMLElement).getByText('连接中断，当前不可分配')).toBeInTheDocument();
  });

  it('keeps the global skill picker open by default and filters the grid with search', async () => {
    render(
      <MemoryRouter>
        <CreateTaskPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(apiMocks.listSkills).toHaveBeenCalled();
    });

    expect(screen.getByLabelText('搜索全局 Skills')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('搜索全局 Skills'), {
      target: { value: 'refactor' },
    });

    expect(screen.getByRole('button', { name: 'refactoring-ui' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'planning-with-files' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'frontend-design' })).not.toBeInTheDocument();
  });

  it('keeps role-specific skills collapsed until an override picker is opened for that role', async () => {
    render(
      <MemoryRouter>
        <CreateTaskPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(apiMocks.listSkills).toHaveBeenCalled();
    });

    const developerCard = screen.getByText('developer').closest('.detail-card');
    expect(developerCard).not.toBeNull();
    expect(within(developerCard as HTMLElement).queryByLabelText('搜索 developer 专属 Skills')).not.toBeInTheDocument();
    expect(within(developerCard as HTMLElement).queryByRole('button', { name: 'planning-with-files' })).not.toBeInTheDocument();

    fireEvent.click(within(developerCard as HTMLElement).getByRole('button', { name: '为 developer 配置专属 Skills' }));

    fireEvent.change(within(developerCard as HTMLElement).getByLabelText('搜索 developer 专属 Skills'), {
      target: { value: 'frontend' },
    });

    expect(within(developerCard as HTMLElement).getByRole('button', { name: 'frontend-design' })).toBeInTheDocument();
    expect(within(developerCard as HTMLElement).queryByRole('button', { name: 'planning-with-files' })).not.toBeInTheDocument();
  });

  it('prioritizes recent global skills in the visible grid order', async () => {
    window.localStorage.setItem('agora-create-task-skill-usage', JSON.stringify([
      {
        skillRef: 'frontend-design',
        surface: 'global',
        templateType: 'coding',
        role: null,
        lastUsedAt: '2026-03-21T11:00:00.000Z',
      },
      {
        skillRef: 'planning-with-files',
        surface: 'role',
        templateType: 'coding',
        role: 'developer',
        lastUsedAt: '2026-03-20T11:00:00.000Z',
      },
    ]));

    render(
      <MemoryRouter>
        <CreateTaskPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(apiMocks.listSkills).toHaveBeenCalled();
    });

    const globalPanel = screen.getByTestId('global-skill-picker-results');
    const visibleSkillButtons = within(globalPanel).getAllByRole('button').map((element) => element.getAttribute('aria-label'));
    expect(visibleSkillButtons.slice(0, 3)).toEqual([
      'frontend-design',
      'planning-with-files',
      'refactoring-ui',
    ]);

    const recommendedButton = within(globalPanel).getByRole('button', { name: 'frontend-design' });
    expect(within(recommendedButton).getByText('推荐')).toBeInTheDocument();

    const recentButton = within(globalPanel).getByRole('button', { name: 'planning-with-files' });
    expect(within(recentButton).getByText('最近')).toBeInTheDocument();
  });

  it('shows a clear hint that selected skills can be clicked again to deselect', async () => {
    render(
      <MemoryRouter>
        <CreateTaskPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(apiMocks.listSkills).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'planning-with-files' }));
    expect(screen.getByText('点击已选 Skill 可取消')).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: 'planning-with-files' }).some(
        (element) => element.getAttribute('data-skill-tooltip') === '点击取消 planning-with-files',
      ),
    ).toBe(true);

    const developerCard = screen.getByText('developer').closest('.detail-card');
    expect(developerCard).not.toBeNull();
    fireEvent.click(within(developerCard as HTMLElement).getByRole('button', { name: '为 developer 配置专属 Skills' }));
    fireEvent.click(within(developerCard as HTMLElement).getByRole('button', { name: 'refactoring-ui' }));

    expect(within(developerCard as HTMLElement).getByText('点击已选 Skill 可取消')).toBeInTheDocument();
    expect(
      within(developerCard as HTMLElement).getAllByRole('button', { name: 'refactoring-ui' }).some(
        (element) => element.getAttribute('data-skill-tooltip') === '点击取消 refactoring-ui',
      ),
    ).toBe(true);
  });

  it('supports lightweight global filters for selected and recommended skills', async () => {
    window.localStorage.setItem('agora-create-task-skill-usage', JSON.stringify([
      {
        skillRef: 'frontend-design',
        surface: 'global',
        templateType: 'coding',
        role: null,
        lastUsedAt: '2026-03-21T11:00:00.000Z',
      },
    ]));

    render(
      <MemoryRouter>
        <CreateTaskPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(apiMocks.listSkills).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'planning-with-files' }));
    fireEvent.click(screen.getByRole('button', { name: '已选' }));

    const globalPanel = screen.getByTestId('global-skill-picker-results');
    expect(within(globalPanel).getAllByRole('button').map((element) => element.getAttribute('aria-label'))).toEqual([
      'planning-with-files',
    ]);

    fireEvent.click(screen.getByRole('button', { name: '推荐' }));
    expect(within(globalPanel).getAllByRole('button').map((element) => element.getAttribute('aria-label'))).toEqual([
      'planning-with-files',
      'frontend-design',
    ]);
  });
});
