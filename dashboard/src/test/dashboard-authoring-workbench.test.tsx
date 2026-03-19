import { MemoryRouter } from 'react-router';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateTaskPage } from '@/pages/CreateTaskPage';
import { SettingsPage } from '@/pages/SettingsPage';

const createTask = vi.fn(async () => ({ id: 'OC-009' }));
const fetchTemplates = vi.fn(async () => 'live');
const selectTemplate = vi.fn(async () => undefined);
const fetchStatus = vi.fn(async () => 'live');
const fetchProjects = vi.fn(async () => 'live');
const apiMocks = vi.hoisted(() => ({
  listSkills: vi.fn(async () => []),
}));
const showMessage = vi.fn();
const setMode = vi.fn();
const setApiConfig = vi.fn();
const setRefreshInterval = vi.fn();
const setPauseOnHidden = vi.fn();
const setLocale = vi.fn(async () => undefined);

const taskStoreState = {
  createTask,
  cleanupTasks: vi.fn(async () => 0),
};

const templateStoreState = {
  templates: [
    {
      id: 'coding',
      name: 'Coding Task',
      type: 'coding',
      description: '实现代码任务',
      governance: 'standard',
      stageCount: 4,
      stageCountLabel: '4 stages',
    },
  ],
  selectedTemplateId: 'coding',
  selectedTemplate: {
    id: 'coding',
    name: 'Coding Task',
    type: 'coding',
    description: '实现代码任务',
    governance: 'standard',
    stageCount: 2,
    stages: [
      { id: 'discuss', name: '讨论', mode: 'discuss', gateType: null },
      { id: 'develop', name: '开发', mode: 'execute', gateType: null },
    ],
    defaultTeam: [
      { role: 'architect', modelPreference: 'strong_reasoning', suggested: ['opus', 'sonnet'] },
    ],
    defaultTeamRoles: ['architect'],
    raw: {},
  },
  fetchTemplates,
  selectTemplate,
};

const agentStoreState = {
  agents: [
    { id: 'opus', presence: 'online' },
    { id: 'sonnet', presence: 'busy' },
  ],
  fetchStatus,
};

vi.mock('@/stores/taskStore', () => ({
  useTaskStore: (selector?: (state: typeof taskStoreState) => unknown) =>
    selector ? selector(taskStoreState) : taskStoreState,
}));

vi.mock('@/stores/templateStore', () => ({
  useTemplateStore: (selector?: (state: typeof templateStoreState) => unknown) =>
    selector ? selector(templateStoreState) : templateStoreState,
}));

vi.mock('@/stores/agentStore', () => ({
  useAgentStore: (selector?: (state: typeof agentStoreState) => unknown) =>
    selector ? selector(agentStoreState) : agentStoreState,
}));

vi.mock('@/stores/projectStore', () => ({
  useProjectStore: (selector?: (state: {
    projects: Array<{ id: string; name: string; status: string; owner: string | null; summary: string | null }>;
    fetchProjects: typeof fetchProjects;
  }) => unknown) => {
    const state = {
      projects: [
        { id: 'proj-alpha', name: 'Project Alpha', status: 'active', owner: 'archon', summary: 'primary project' },
      ],
      fetchProjects,
    };
    return selector ? selector(state) : state;
  },
}));

vi.mock('@/stores/feedbackStore', () => ({
  useFeedbackStore: () => ({
    showMessage,
  }),
}));

vi.mock('@/stores/settingsStore', () => ({
  useSettingsStore: (selector?: (state: {
    apiBase: string;
    apiToken: string;
    refreshInterval: number;
    pauseOnHidden: boolean;
    setApiConfig: typeof setApiConfig;
    setRefreshInterval: typeof setRefreshInterval;
    setPauseOnHidden: typeof setPauseOnHidden;
  }) => unknown) => {
    const state = {
      apiBase: '/api',
      apiToken: '',
      refreshInterval: 5,
      pauseOnHidden: true,
      setApiConfig,
      setRefreshInterval,
      setPauseOnHidden,
    };
    return selector ? selector(state) : state;
  },
}));

vi.mock('@/stores/themeStore', () => ({
  useThemeStore: () => ({
    mode: 'system',
    resolved: 'light',
    setMode,
  }),
}));

vi.mock('@/stores/sessionStore', () => ({
  useSessionStore: (selector?: (state: {
    username: string;
    role: 'admin';
    method: string;
  }) => unknown) => {
    const state = {
      username: 'admin',
      role: 'admin' as const,
      method: 'session',
    };
    return selector ? selector(state) : state;
  },
}));

vi.mock('@/components/settings/HumanAccountsPanel', () => ({
  HumanAccountsPanel: () => <div data-testid="human-accounts-panel">accounts</div>,
}));

vi.mock('@/lib/api', () => ({
  healthCheck: vi.fn(async () => ({ status: 'ok' })),
  listSkills: apiMocks.listSkills,
}));

vi.mock('@/lib/i18n', async () => {
  const actual = await vi.importActual<typeof import('@/lib/i18n')>('@/lib/i18n');
  return {
    ...actual,
    useLocale: () => ({
      locale: 'zh-CN',
      setLocale,
    }),
  };
});

function renderWithRouter(node: React.ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

describe('authoring workbench layout', () => {
  beforeEach(() => {
    createTask.mockClear();
    fetchTemplates.mockClear();
    selectTemplate.mockClear();
    fetchStatus.mockClear();
    fetchProjects.mockClear();
    apiMocks.listSkills.mockClear();
    showMessage.mockClear();
    setMode.mockClear();
    setApiConfig.mockClear();
    setRefreshInterval.mockClear();
    setPauseOnHidden.mockClear();
    setLocale.mockClear();
  });

  it('splits create task into composer and provisioning summary modules', () => {
    renderWithRouter(<CreateTaskPage />);

    expect(screen.getByTestId('create-task-composer')).toBeInTheDocument();
    expect(screen.getByTestId('create-task-provisioning')).toBeInTheDocument();
    expect(screen.getAllByText('Coding Task').length).toBeGreaterThan(0);
  });

  it('uses a unified settings masthead and grouped governance modules', () => {
    renderWithRouter(<SettingsPage />);

    expect(screen.getByTestId('settings-masthead')).toBeInTheDocument();
    expect(screen.getByTestId('settings-gateway-panel')).toBeInTheDocument();
    expect(screen.getByTestId('settings-sync-panel')).toBeInTheDocument();
    expect(screen.getByTestId('settings-appearance-panel')).toBeInTheDocument();
    expect(screen.getByTestId('settings-language-panel')).toBeInTheDocument();
    expect(screen.getByTestId('human-accounts-panel')).toBeInTheDocument();
  });
});
