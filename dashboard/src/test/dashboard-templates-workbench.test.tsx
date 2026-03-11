import { MemoryRouter } from 'react-router';
import { fireEvent, render, screen, within } from '@testing-library/react';
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
      { id: 'review', name: '审查', mode: 'discuss', gateType: 'approval', gateApprover: 'reviewer', rejectTarget: 'develop' },
    ],
    defaultTeamRoles: ['architect', 'craftsman'],
    defaultTeam: [
      { role: 'architect', memberKind: 'controller', modelPreference: null, suggested: ['opus'] },
      { role: 'craftsman', memberKind: 'craftsman', modelPreference: 'coding_cli', suggested: ['claude_code'] },
    ],
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
  tmuxRuntime: {
    session: 'agora-craftsmen',
    panes: [
      {
        agent: 'claude',
        paneId: '%0',
        currentCommand: 'claude',
        active: true,
        ready: true,
        tailPreview: null,
        continuityBackend: 'claude_session_id' as const,
        resumeCapability: 'native_resume' as const,
        sessionReference: 'claude-session-1',
        identitySource: 'session_file' as const,
        identityPath: null,
        sessionObservedAt: null,
        lastRecoveryMode: 'resume_exact' as const,
        transportSessionId: 'tmux:agora-craftsmen:claude',
      },
      {
        agent: 'codex',
        paneId: '%1',
        currentCommand: 'codex',
        active: true,
        ready: true,
        tailPreview: null,
        continuityBackend: 'codex_session_file' as const,
        resumeCapability: 'native_resume' as const,
        sessionReference: 'codex-session-1',
        identitySource: 'session_file' as const,
        identityPath: null,
        sessionObservedAt: null,
        lastRecoveryMode: 'resume_exact' as const,
        transportSessionId: 'tmux:agora-craftsmen:codex',
      },
      {
        agent: 'gemini',
        paneId: '%2',
        currentCommand: 'gemini',
        active: true,
        ready: true,
        tailPreview: null,
        continuityBackend: 'gemini_session_id' as const,
        resumeCapability: 'resume_last' as const,
        sessionReference: 'gemini-session-1',
        identitySource: 'session_file' as const,
        identityPath: null,
        sessionObservedAt: null,
        lastRecoveryMode: 'resume_last' as const,
        transportSessionId: 'tmux:agora-craftsmen:gemini',
      },
    ],
  },
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
    fireEvent.change(screen.getByLabelText('architect 成员类型'), {
      target: { value: 'controller' },
    });
    fireEvent.change(screen.getByLabelText('architect 模型偏好'), {
      target: { value: 'strong_reasoning_v2' },
    });
    const architectCard = screen.getByText('architect').closest('.detail-card');
    expect(architectCard).not.toBeNull();
    fireEvent.click(within(architectCard as HTMLElement).getByRole('button', { name: 'sonnet' }));
    fireEvent.change(screen.getByLabelText('阶段 develop 名称'), {
      target: { value: '实施' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存模板' }));

    expect(saveSelectedTemplate).toHaveBeenCalledWith(expect.objectContaining({
      description: '更新后的说明',
      defaultTeam: [
        {
          role: 'architect',
          memberKind: 'controller',
          modelPreference: 'strong_reasoning_v2',
          suggested: ['opus', 'sonnet'],
        },
        {
          role: 'craftsman',
          memberKind: 'craftsman',
          modelPreference: 'coding_cli',
          suggested: ['claude_code'],
        },
      ],
      stages: [
        { id: 'discuss', name: '讨论', mode: 'discuss', gateType: null },
        { id: 'develop', name: '实施', mode: 'execute', gateType: null },
        { id: 'review', name: '审查', mode: 'discuss', gateType: 'approval', gateApprover: 'reviewer', rejectTarget: 'develop' },
      ],
    }));
  });

  it('edits stage graph semantics before saving the selected template', async () => {
    renderPage();

    fireEvent.change(screen.getByLabelText('阶段 develop 模式'), {
      target: { value: 'discuss' },
    });
    fireEvent.change(screen.getByLabelText('阶段 review Gate'), {
      target: { value: 'archon_review' },
    });
    fireEvent.change(screen.getByLabelText('阶段 review 回退目标'), {
      target: { value: 'discuss' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存模板' }));

    expect(saveSelectedTemplate).toHaveBeenCalledWith(expect.objectContaining({
      stages: [
        expect.objectContaining({ id: 'discuss', name: '讨论', mode: 'discuss', gateType: null }),
        expect.objectContaining({ id: 'develop', name: '开发', mode: 'discuss', gateType: null }),
        expect.objectContaining({ id: 'review', name: '审查', mode: 'discuss', gateType: 'archon_review', gateApprover: null, rejectTarget: 'discuss' }),
      ],
    }));
    expect(screen.getByText('review -> discuss')).toBeInTheDocument();
  });

  it('edits gate parameters before saving the selected template', async () => {
    renderPage();

    fireEvent.change(screen.getByLabelText('阶段 review 审批人'), {
      target: { value: 'archon' },
    });
    fireEvent.change(screen.getByLabelText('阶段 review Gate'), {
      target: { value: 'quorum' },
    });
    fireEvent.change(screen.getByLabelText('阶段 review 通过票数'), {
      target: { value: '3' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存模板' }));

    expect(saveSelectedTemplate).toHaveBeenCalledWith(expect.objectContaining({
      stages: [
        expect.objectContaining({ id: 'discuss', name: '讨论', mode: 'discuss', gateType: null }),
        expect.objectContaining({ id: 'develop', name: '开发', mode: 'execute', gateType: null }),
        expect.objectContaining({ id: 'review', name: '审查', mode: 'discuss', gateType: 'quorum', gateApprover: null, gateRequired: 3, rejectTarget: 'develop' }),
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
        { id: 'review', name: '审查', mode: 'discuss', gateType: 'approval', gateApprover: 'reviewer', rejectTarget: 'develop' },
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

    const architectCard = screen.getByText('architect').closest('.detail-card');
    expect(architectCard).not.toBeNull();
    fireEvent.click(within(architectCard as HTMLElement).getByRole('button', { name: 'codex' }));

    expect(screen.getByText(/运行时兼容性/i)).toBeInTheDocument();
    expect(screen.getByText(/当前不可用: codex/i)).toBeInTheDocument();
  });

  it('blocks save when runtime compatibility issues still exist', () => {
    renderPage();

    const architectCard = screen.getByText('architect').closest('.detail-card');
    expect(architectCard).not.toBeNull();
    fireEvent.click(within(architectCard as HTMLElement).getByRole('button', { name: 'codex' }));
    fireEvent.click(screen.getByRole('button', { name: '保存模板' }));

    expect(saveSelectedTemplate).not.toHaveBeenCalled();
    expect(screen.getByText(/请先修复 runtime compatibility 问题/i)).toBeInTheDocument();
  });

  it('renders craftsman suggestions from tmux runtime catalog and normalizes legacy ids', () => {
    renderPage();

    const craftsmanCard = screen.getByText('craftsman').closest('.detail-card');
    expect(craftsmanCard).not.toBeNull();
    expect(screen.queryByText(/缺失于当前 runtime: claude_code/i)).not.toBeInTheDocument();
    expect(within(craftsmanCard as HTMLElement).getByRole('button', { name: 'claude' })).toBeInTheDocument();
    expect(within(craftsmanCard as HTMLElement).getByRole('button', { name: 'codex' })).toBeInTheDocument();
    expect(within(craftsmanCard as HTMLElement).queryByRole('button', { name: 'sonnet' })).not.toBeInTheDocument();
  });
});
