import { MemoryRouter } from 'react-router';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TemplatesPage } from '@/pages/TemplatesPage';

const fetchTemplates = vi.fn(async () => 'live');
const selectTemplate = vi.fn(async () => undefined);
const saveSelectedTemplate = vi.fn(async () => 'live');
const duplicateSelectedTemplate = vi.fn(async () => 'live');
const validateSelectedTemplate = vi.fn(async () => 'live');
const fetchStatus = vi.fn(async () => 'live');

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
    {
      id: 'research',
      name: 'Research Task',
      type: 'research',
      description: '调研任务',
      governance: 'lean',
      stageCount: 3,
      stageCountLabel: '3 stages',
    },
  ],
  selectedTemplateId: 'coding',
  selectedTemplate: {
    id: 'coding',
    name: 'Coding Task',
    type: 'coding',
    description: '实现代码任务',
    governance: 'standard',
    stageCount: 4,
    stages: [
      { id: 'discuss', name: '讨论', mode: 'discuss', gateType: null },
      { id: 'develop', name: '开发', mode: 'execute', gateType: null },
      { id: 'review', name: '审查', mode: 'discuss', gateType: 'approval', rejectTarget: 'develop' },
    ],
    defaultTeamRoles: ['architect'],
    defaultTeam: [{ role: 'architect', modelPreference: null, suggested: ['opus'] }],
    raw: {},
  },
  error: null,
  saving: false,
  validationResult: null,
  fetchTemplates,
  selectTemplate,
  saveSelectedTemplate,
  duplicateSelectedTemplate,
  validateSelectedTemplate,
};

const agentStoreState = {
  agents: [
    {
      id: 'opus',
      role: null,
      status: 'idle',
      presence: 'online' as const,
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
      presence: 'offline' as const,
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
      presence: 'online' as const,
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
};

vi.mock('@/stores/templateStore', () => ({
  useTemplateStore: (selector?: (state: typeof templateStoreState) => unknown) =>
    selector ? selector(templateStoreState) : templateStoreState,
}));

vi.mock('@/stores/agentStore', () => ({
  useAgentStore: (selector?: (state: typeof agentStoreState) => unknown) =>
    selector ? selector(agentStoreState) : agentStoreState,
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <TemplatesPage />
    </MemoryRouter>,
  );
}

describe('templates workbench layout', () => {
  beforeEach(() => {
    fetchTemplates.mockClear();
    selectTemplate.mockClear();
    saveSelectedTemplate.mockClear();
    duplicateSelectedTemplate.mockClear();
    validateSelectedTemplate.mockClear();
    fetchStatus.mockClear();
  });

  it('uses a unified masthead and split template library/detail modules', () => {
    renderPage();

    expect(screen.getByTestId('templates-library')).toBeInTheDocument();
    expect(screen.getByTestId('templates-detail-panel')).toBeInTheDocument();
    expect(screen.getAllByText('Coding Task').length).toBeGreaterThan(0);
    expect(screen.getByText('architect')).toBeInTheDocument();
    expect(screen.getByText('流程图预览')).toBeInTheDocument();
    expect(screen.getByText('review -> develop')).toBeInTheDocument();
  });

  it('edits team preset and stage labels before saving the selected template', async () => {
    renderPage();

    fireEvent.change(screen.getByLabelText('模板描述'), {
      target: { value: '更新后的说明' },
    });
    fireEvent.change(screen.getByLabelText('architect 模型偏好'), {
      target: { value: 'strong_reasoning_v2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'sonnet' }));
    fireEvent.change(screen.getByLabelText('阶段 develop 名称'), {
      target: { value: '实施' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存模板' }));

    expect(saveSelectedTemplate).toHaveBeenCalledWith(expect.objectContaining({
      description: '更新后的说明',
      defaultTeam: [
        {
          role: 'architect',
          modelPreference: 'strong_reasoning_v2',
          suggested: ['opus', 'sonnet'],
        },
      ],
      stages: [
        { id: 'discuss', name: '讨论', mode: 'discuss', gateType: null },
        { id: 'develop', name: '实施', mode: 'execute', gateType: null },
        { id: 'review', name: '审查', mode: 'discuss', gateType: 'approval', rejectTarget: 'develop' },
      ],
    }));
  });

  it('validates the current workflow draft and duplicates the template with a new id', async () => {
    renderPage();

    fireEvent.change(screen.getByLabelText('副本 ID'), {
      target: { value: 'coding_copy' },
    });
    fireEvent.click(screen.getByRole('button', { name: '校验工作流' }));
    fireEvent.click(screen.getByRole('button', { name: '复制模板' }));

    expect(validateSelectedTemplate).toHaveBeenCalledWith(expect.objectContaining({
      id: 'coding',
      stages: [
        { id: 'discuss', name: '讨论', mode: 'discuss', gateType: null },
        { id: 'develop', name: '开发', mode: 'execute', gateType: null },
        { id: 'review', name: '审查', mode: 'discuss', gateType: 'approval', rejectTarget: 'develop' },
      ],
    }));
    expect(duplicateSelectedTemplate).toHaveBeenCalledWith({
      templateId: 'coding',
      newId: 'coding_copy',
      name: 'Coding Task Copy',
    });
  });

  it('shows runtime compatibility warnings for missing or unavailable suggested agents', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'codex' }));

    expect(screen.getByText(/运行时兼容性/i)).toBeInTheDocument();
    expect(screen.getByText(/当前不可用: codex/i)).toBeInTheDocument();
  });

  it('blocks save when runtime compatibility issues still exist', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'codex' }));
    fireEvent.click(screen.getByRole('button', { name: '保存模板' }));

    expect(saveSelectedTemplate).not.toHaveBeenCalled();
    expect(screen.getByText(/请先修复 runtime compatibility 问题/i)).toBeInTheDocument();
  });
});
