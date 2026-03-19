import { MemoryRouter, Route, Routes } from 'react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TemplatesPage } from '@/pages/TemplatesPage';
import { TemplateGraphEditorPage } from '@/pages/TemplateGraphEditorPage';

const fetchTemplates = vi.fn(async () => 'live');
const selectTemplate = vi.fn(async () => undefined);
const createTemplate = vi.fn(async () => 'live');
const saveSelectedTemplate = vi.fn(async () => 'live');
const duplicateSelectedTemplate = vi.fn(async () => 'live');
const validateSelectedTemplate = vi.fn(async () => 'live');
const fetchStatus = vi.fn(async () => 'live');

const baseSelectedTemplate = {
  id: 'coding',
  name: 'Coding Task',
  type: 'coding',
  description: '实现代码任务',
  governance: 'standard',
  stageCount: 4,
  stages: [
    { id: 'discuss', name: '讨论', mode: 'discuss', gateType: null, roster: null },
    { id: 'develop', name: '开发', mode: 'execute', gateType: null, roster: null },
    { id: 'review', name: '审查', mode: 'discuss', gateType: 'approval', gateApprover: 'reviewer', rejectTarget: 'develop', roster: null },
  ],
  graph: {
    graphVersion: 1,
    entryNodes: ['discuss'],
    nodes: [
      { id: 'discuss', name: '讨论', kind: 'stage', executionKind: 'citizen_discuss', allowedActions: [], roster: null, gateType: null, gateApprover: null, gateRequired: null, gateTimeoutSec: null, layout: { x: 0, y: 0 } },
      { id: 'develop', name: '开发', kind: 'stage', executionKind: 'citizen_execute', allowedActions: [], roster: null, gateType: null, gateApprover: null, gateRequired: null, gateTimeoutSec: null, layout: { x: 260, y: 0 } },
      { id: 'review', name: '审查', kind: 'stage', executionKind: 'human_approval', allowedActions: [], roster: null, gateType: 'approval', gateApprover: 'reviewer', gateRequired: null, gateTimeoutSec: null, layout: { x: 520, y: 0 } },
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
  selectedTemplateId: 'coding' as string | null,
  detailLoading: false,
  selectedTemplate: structuredClone(baseSelectedTemplate) as typeof baseSelectedTemplate | null,
  error: null as string | null,
  saving: false,
  validationResult: null,
  fetchTemplates,
  selectTemplate,
  createTemplate,
  saveSelectedTemplate,
  duplicateSelectedTemplate,
  validateSelectedTemplate,
};

const agentStoreState = {
  agents: [],
  fetchStatus,
  craftsmanRuntime: null,
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

function renderGraphEditorWithRoutes() {
  return render(
    <MemoryRouter initialEntries={['/templates/coding/graph']}>
      <Routes>
        <Route path="/templates" element={<div>templates route</div>} />
        <Route path="/templates/:templateId/graph" element={<TemplateGraphEditorPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('templates workflow surfaces', () => {
  beforeEach(() => {
    templateStoreState.selectedTemplateId = 'coding';
    templateStoreState.detailLoading = false;
    templateStoreState.error = null;
    templateStoreState.selectedTemplate = structuredClone(baseSelectedTemplate);
    fetchTemplates.mockClear();
    selectTemplate.mockClear();
    createTemplate.mockClear();
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

  it('creates a starter template from the authoring strip', async () => {
    renderTemplatesOverview();

    fireEvent.change(screen.getByLabelText('模板 ID'), {
      target: { value: 'workflow_starter' },
    });
    fireEvent.change(screen.getByLabelText('模板名称'), {
      target: { value: 'Workflow Starter' },
    });
    fireEvent.click(screen.getByRole('button', { name: '新建模板' }));

    await waitFor(() => {
      expect(createTemplate).toHaveBeenCalledWith({
        id: 'workflow_starter',
        name: 'Workflow Starter',
      });
    });
  });

  it('shows an explicit loading state while the workflow editor detail is still fetching', () => {
    templateStoreState.detailLoading = true;

    renderGraphEditor();

    expect(screen.getByText('正在加载流程编辑器…')).toBeInTheDocument();
  });

  it('shows an unavailable state when the template graph cannot be loaded', () => {
    templateStoreState.selectedTemplate = null;
    templateStoreState.error = 'template missing';

    renderGraphEditor();

    expect(screen.getByText('template missing')).toBeInTheDocument();
    expect(screen.getByText('当前模板流程不可用。')).toBeInTheDocument();
  });

  it('navigates back to the templates surface from the graph editor header', async () => {
    renderGraphEditorWithRoutes();

    fireEvent.click(screen.getByRole('button', { name: '返回模板' }));

    await waitFor(() => {
      expect(screen.getByText('templates route')).toBeInTheDocument();
    });
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
    fireEvent.change(screen.getByLabelText('graph node discuss gate type'), {
      target: { value: 'command' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存流程' }));

    expect(saveSelectedTemplate).toHaveBeenCalledWith(expect.objectContaining({
      graph: expect.objectContaining({
        nodes: expect.arrayContaining([
          expect.objectContaining({
            id: 'discuss',
            name: '讨论 v2',
            executionKind: 'citizen_discuss',
            gateType: 'command',
          }),
        ]),
      }),
    }));
  });

  it('edits stage roster semantics through the graph inspector', () => {
    renderGraphEditor();

    fireEvent.click(screen.getByLabelText('graph node review'));
    fireEvent.change(screen.getByLabelText('graph node review roster roles'), {
      target: { value: 'reviewer, architect' },
    });
    fireEvent.click(screen.getByLabelText('graph node review keep controller'));
    fireEvent.click(screen.getByRole('button', { name: '保存流程' }));

    expect(saveSelectedTemplate).toHaveBeenCalledWith(expect.objectContaining({
      graph: expect.objectContaining({
        nodes: expect.arrayContaining([
          expect.objectContaining({
            id: 'review',
            roster: {
              includeRoles: ['reviewer', 'architect'],
              includeAgents: [],
              excludeAgents: [],
              keepController: true,
            },
          }),
        ]),
      }),
      stages: expect.arrayContaining([
        expect.objectContaining({
          id: 'review',
          roster: {
            includeRoles: ['reviewer', 'architect'],
            includeAgents: [],
            excludeAgents: [],
            keepController: true,
          },
        }),
      ]),
    }));
  });

  it('renders visible workflow nodes inside the graph editor canvas', () => {
    const { container } = renderGraphEditor();

    const canvasNodes = Array.from(container.querySelectorAll('.react-flow__node'));

    expect(canvasNodes.length).toBeGreaterThan(0);
    for (const node of canvasNodes) {
      expect(node).toBeVisible();
      expect(node.querySelector('.template-graph-node__title')).not.toBeNull();
    }
  });

  it('renders a visible reject loop edge inside the graph editor canvas', () => {
    renderGraphEditor();

    expect(screen.getByRole('button', { name: 'graph edge review develop' })).toBeInTheDocument();
    expect(document.body.textContent).toMatch(/打回|reject/i);
  });

  it('adds nodes and tidies the canvas layout from the graph tools rail', () => {
    renderGraphEditor();

    fireEvent.click(screen.getByRole('button', { name: '整理布局' }));
    fireEvent.click(screen.getByRole('button', { name: '新增节点' }));
    fireEvent.click(screen.getByRole('button', { name: '保存流程' }));

    expect(saveSelectedTemplate).toHaveBeenCalledWith(expect.objectContaining({
      graph: expect.objectContaining({
        nodes: expect.arrayContaining([
          expect.objectContaining({
            id: 'node_4',
            name: '新节点',
          }),
        ]),
      }),
      stages: expect.arrayContaining([
        expect.objectContaining({
          id: 'node_4',
          name: '新节点',
        }),
      ]),
    }));
  });

  it('edits advance and reject targets directly from the node inspector', () => {
    renderGraphEditor();

    fireEvent.click(screen.getByLabelText('graph node review'));
    fireEvent.change(screen.getByLabelText('graph node review reject target'), {
      target: { value: 'discuss' },
    });
    fireEvent.click(screen.getByLabelText('graph node discuss'));
    fireEvent.change(screen.getByLabelText('graph node discuss next stage'), {
      target: { value: 'develop' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存流程' }));

    expect(saveSelectedTemplate).toHaveBeenCalledWith(expect.objectContaining({
      graph: expect.objectContaining({
        edges: expect.arrayContaining([
          expect.objectContaining({
            id: 'review__reject__discuss',
            from: 'review',
            to: 'discuss',
            kind: 'reject',
          }),
          expect.objectContaining({
            id: 'discuss__advance__develop',
            from: 'discuss',
            to: 'develop',
            kind: 'advance',
          }),
        ]),
      }),
      stages: expect.arrayContaining([
        expect.objectContaining({
          id: 'review',
          rejectTarget: 'discuss',
        }),
      ]),
    }));
  });

  it('offers explicit add-edge actions for advance and reject paths', () => {
    renderGraphEditor();

    fireEvent.click(screen.getByLabelText('graph node develop'));
    fireEvent.change(screen.getByLabelText('graph node develop next stage'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: '新增推进边' }));
    fireEvent.click(screen.getByRole('button', { name: '新增打回边' }));
    fireEvent.click(screen.getByRole('button', { name: '保存流程' }));

    expect(saveSelectedTemplate).toHaveBeenCalledWith(expect.objectContaining({
      graph: expect.objectContaining({
        edges: expect.arrayContaining([
          expect.objectContaining({
            id: 'develop__advance__review',
            from: 'develop',
            to: 'review',
            kind: 'advance',
          }),
          expect.objectContaining({
            id: 'develop__reject__discuss',
            from: 'develop',
            to: 'discuss',
            kind: 'reject',
          }),
        ]),
      }),
      stages: expect.arrayContaining([
        expect.objectContaining({
          id: 'develop',
          rejectTarget: 'discuss',
        }),
      ]),
    }));
  });

  it('supports deleting edges from the dedicated edge inspector', () => {
    renderGraphEditor();

    fireEvent.click(screen.getByLabelText('graph edge develop review'));
    fireEvent.click(screen.getByRole('button', { name: '删除边' }));
    fireEvent.click(screen.getByRole('button', { name: '保存流程' }));

    expect(saveSelectedTemplate).toHaveBeenCalledWith(expect.objectContaining({
      graph: expect.objectContaining({
        edges: expect.not.arrayContaining([
          expect.objectContaining({
            id: 'develop__advance__review',
          }),
        ]),
      }),
    }));
  });

  it('updates entry nodes and deletes graph nodes through the dedicated workflow editor page', () => {
    renderGraphEditor();

    fireEvent.click(screen.getByLabelText('graph node develop'));
    fireEvent.click(screen.getByLabelText('graph node develop entry'));
    fireEvent.click(screen.getByLabelText('graph node review'));
    fireEvent.click(screen.getByRole('button', { name: '删除节点' }));
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
    expect(screen.getByText(/请先修复流程图配置问题/i)).toBeInTheDocument();
    expect(screen.getByText(/流程图至少需要一个入口节点/i)).toBeInTheDocument();
  });

  it('blocks save when the graph creates multiple incoming advance edges', () => {
    renderGraphEditor();

    fireEvent.click(screen.getByLabelText('graph node discuss'));
    fireEvent.change(screen.getByLabelText('graph node discuss next stage'), {
      target: { value: 'review' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存流程' }));

    expect(saveSelectedTemplate).not.toHaveBeenCalled();
    expect(screen.getByText(/不能接收多条推进边/i)).toBeInTheDocument();
  });
});
