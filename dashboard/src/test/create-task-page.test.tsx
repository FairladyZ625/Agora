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
      defaultTeam: Array<{ role: string; modelPreference: string; suggested: string[] }>;
      raw: Record<string, unknown>;
    } | null;
    fetchTemplates: typeof fetchTemplates;
    selectTemplate: typeof selectTemplate;
  }) => unknown) => selector({
    templates: [
      { id: 'coding', name: '编码任务', type: 'coding', description: '', governance: 'standard', stageCount: 2, stageCountLabel: '2 stages' },
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
      defaultTeamRoles: ['architect', 'developer'],
      defaultTeam: [
        { role: 'architect', modelPreference: 'strong_reasoning', suggested: ['opus'] },
        { role: 'developer', modelPreference: 'fast_coding', suggested: ['sonnet'] },
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
        id: 'codex',
        role: null,
        status: 'idle',
        presence: 'online',
        presenceReason: null,
        channelProviders: ['discord'],
        hostFramework: 'openclaw',
        inventorySources: ['discord', 'openclaw'],
        primaryModel: null,
        workspaceDir: null,
        accountId: 'codex',
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
  }),
}));

describe('create task page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds a private-thread payload from selected agents and submits it', async () => {
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
    const developerCard = screen.getByText('developer').closest('.detail-card');
    expect(developerCard).not.toBeNull();
    fireEvent.click(within(developerCard as HTMLElement).getByRole('button', { name: 'codex' }));
    fireEvent.click(screen.getByRole('button', { name: '创建任务' }));

    await waitFor(() => {
      expect(createTask).toHaveBeenCalledWith(expect.objectContaining({
        title: '实现动态选人 create flow',
        type: 'coding',
        team_override: {
          members: [
            { role: 'architect', agentId: 'opus', model_preference: 'strong_reasoning' },
            { role: 'developer', agentId: 'codex', model_preference: 'fast_coding' },
          ],
        },
        im_target: {
          provider: 'discord',
          visibility: 'private',
          participant_refs: ['opus', 'codex'],
        },
      }));
    });
    expect(fetchTemplates).toHaveBeenCalled();
    expect(fetchStatus).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/tasks/OC-200');
  });
});
