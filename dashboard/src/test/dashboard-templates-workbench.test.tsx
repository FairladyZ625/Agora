import { MemoryRouter, Route, Routes } from 'react-router';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TemplatesPage } from '@/pages/TemplatesPage';
import { TemplateGraphEditorPage } from '@/pages/TemplateGraphEditorPage';

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
    graph: {
      graphVersion: 1,
      entryNodes: ['discuss'],
      nodes: [
        { id: 'discuss', name: '讨论', kind: 'stage', executionKind: 'citizen_discuss', allowedActions: [], gateType: null, gateApprover: null, gateRequired: null, gateTimeoutSec: null, layout: { x: 0, y: 0 } },
        { id: 'develop', name: '开发', kind: 'stage', executionKind: 'citizen_execute', allowedActions: [], gateType: null, gateApprover: null, gateRequired: null, gateTimeoutSec: null, layout: { x: 260, y: 0 } },
        { id: 'review', name: '审查', kind: 'stage', executionKind: 'human_approval', allowedActions: [], gateType: 'approval', gateApprover: 'reviewer', gateRequired: null, gateTimeoutSec: null, layout: { x: 520, y: 0 } },
      ],
      edges: [
        { id: 'discuss__advance__develop', from: 'discuss', to: 'develop', kind: 'advance' },
        { id: 'develop__advance__review', from: 'develop', to: 'review', kind: 'advance' },
        { id: 'review__reject__develop', from: 'review', to: 'develop', kind: 'reject' },
      ],
    },
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
  agents: [],
  fetchStatus,
  tmuxRuntime: { session: null, panes: [] },
};

vi.mock('@/stores/templateStore', () => ({
  useTemplateStore: (selector?: (state: typeof templateStoreState) => unknown) =>
    selector ? selector(templateStoreState) : templateStoreState,
}));

vi.mock('@/stores/agentStore', () => ({
  useAgentStore: (selector?: (state: typeof agentStoreState) => unknown) =>
    selector ? selector(agentStoreState) : agentStoreState,
}));

function renderTemplatesOverview() {
  return render(
    <MemoryRouter>
      <TemplatesPage />
    </MemoryRouter>,
  );
}

function renderGraphEditor() {
  return render(
    <MemoryRouter initialEntries={['/templates/coding/graph']}>
      <Routes>
        <Route path="/templates/:templateId/graph" element={<TemplateGraphEditorPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('templates workflow surfaces', () => {
  beforeEach(() => {
    fetchTemplates.mockClear();
    selectTemplate.mockClear();
    saveSelectedTemplate.mockClear();
    duplicateSelectedTemplate.mockClear();
    validateSelectedTemplate.mockClear();
    fetchStatus.mockClear();
  });

  it('renders the templates overview as a library + summary page with an edit workflow entry', () => {
    renderTemplatesOverview();

    expect(screen.getByTestId('templates-library')).toBeInTheDocument();
    expect(screen.getByTestId('templates-detail-panel')).toBeInTheDocument();
    expect(screen.getByText('流程图预览')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '编辑流程' })).toBeInTheDocument();
  });

  it('edits graph node and edge properties through the dedicated workflow editor page', () => {
    renderGraphEditor();

    fireEvent.click(screen.getByLabelText('graph node discuss'));
    fireEvent.change(screen.getByLabelText('graph node discuss name'), {
      target: { value: '讨论 v2' },
    });
    fireEvent.change(screen.getByLabelText('graph node discuss execution kind'), {
      target: { value: 'citizen_discuss' },
    });
    fireEvent.click(screen.getByLabelText('graph edge review develop'));
    fireEvent.change(screen.getByLabelText('graph edge review__reject__develop kind'), {
      target: { value: 'advance' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存流程' }));

    expect(saveSelectedTemplate).toHaveBeenCalledWith(expect.objectContaining({
      graph: expect.objectContaining({
        nodes: expect.arrayContaining([
          expect.objectContaining({
            id: 'discuss',
            name: '讨论 v2',
            executionKind: 'citizen_discuss',
          }),
        ]),
        edges: expect.arrayContaining([
          expect.objectContaining({
            id: 'review__reject__develop',
            kind: 'advance',
          }),
        ]),
      }),
    }));
  });

  it('renders graph nodes visibly inside the ReactFlow canvas', () => {
    const { container } = renderGraphEditor();

    const canvasNodes = Array.from(container.querySelectorAll('.react-flow__node'));

    expect(canvasNodes.length).toBeGreaterThan(0);
    for (const node of canvasNodes) {
      expect(node).toBeVisible();
      expect(node).not.toHaveStyle({ visibility: 'hidden' });
    }
  });

  it('updates entry nodes and deletes graph nodes through the dedicated workflow editor page', () => {
    renderGraphEditor();

    fireEvent.click(screen.getByLabelText('graph node develop'));
    fireEvent.click(screen.getByLabelText('graph node develop entry'));
    fireEvent.click(screen.getByLabelText('graph node review'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete node' }));
    fireEvent.click(screen.getByRole('button', { name: '保存流程' }));

    expect(saveSelectedTemplate).toHaveBeenCalledWith(expect.objectContaining({
      graph: expect.objectContaining({
        entryNodes: expect.arrayContaining(['develop']),
        nodes: expect.not.arrayContaining([
          expect.objectContaining({ id: 'review' }),
        ]),
      }),
      stages: expect.not.arrayContaining([
        expect.objectContaining({ id: 'review' }),
      ]),
    }));
  });

  it('blocks save when graph validation still reports missing entry nodes', () => {
    renderGraphEditor();

    fireEvent.click(screen.getByLabelText('graph node discuss'));
    fireEvent.click(screen.getByLabelText('graph node discuss entry'));
    fireEvent.click(screen.getByRole('button', { name: '保存流程' }));

    expect(saveSelectedTemplate).not.toHaveBeenCalled();
    expect(screen.getByText(/请先修复 graph 配置问题/i)).toBeInTheDocument();
    expect(screen.getByText(/Graph must include at least one entry node/i)).toBeInTheDocument();
  });
});
