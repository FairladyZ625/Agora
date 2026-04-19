import { MemoryRouter, Route, Routes } from 'react-router';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '@/lib/i18n';
import { ProjectBrainPage } from '@/pages/ProjectBrainPage';
import * as api from '@/lib/api';

const fetchProjectDetail = vi.fn(async () => 'live');

const projectStoreState = {
  selectedProjectId: 'proj-alpha',
  selectedProject: {
    project: {
      id: 'proj-alpha',
      name: 'Project Alpha',
      summary: 'Core + brain baseline',
      owner: 'archon',
      status: 'active',
      nomosId: 'agora/default',
      repoPath: '/repo/proj-alpha',
      createdAt: '2026-03-16T00:00:00.000Z',
      updatedAt: '2026-03-16T01:00:00.000Z',
    },
    nomos: null,
    overview: {
      status: 'active',
      owner: 'archon',
      updatedAt: '2026-03-16T01:00:00.000Z',
      stats: {
        knowledgeCount: 1,
        citizenCount: 1,
        recapCount: 1,
        taskCount: 0,
        activeTaskCount: 0,
        reviewTaskCount: 0,
        todoCount: 0,
        pendingTodoCount: 0,
      },
    },
    surfaces: {
      index: {
        kind: 'index',
        slug: 'index',
        title: 'Project Alpha',
        path: '/brain/projects/proj-alpha/index.md',
        content: '# Project Alpha\n\nCurrent authority center.',
        updatedAt: '2026-03-16T01:00:00.000Z',
      },
      timeline: {
        kind: 'timeline',
        slug: 'timeline',
        title: 'Project Alpha Timeline',
        path: '/brain/projects/proj-alpha/timeline.md',
        content: '# Timeline\n\n- 2026-03-16 | task_recap | OC-100',
        sourceTaskIds: ['OC-100'],
        updatedAt: '2026-03-16T01:30:00.000Z',
      },
    },
    index: {
      kind: 'index',
      slug: 'index',
      title: 'Project Alpha',
      path: '/brain/projects/proj-alpha/index.md',
      content: '# Project Alpha\n\nCurrent authority center.',
      updatedAt: '2026-03-16T01:00:00.000Z',
    },
    timeline: {
      kind: 'timeline',
      slug: 'timeline',
      title: 'Project Alpha Timeline',
      path: '/brain/projects/proj-alpha/timeline.md',
      content: '# Timeline\n\n- 2026-03-16 | task_recap | OC-100',
      sourceTaskIds: ['OC-100'],
      updatedAt: '2026-03-16T01:30:00.000Z',
    },
    recaps: [
      {
        taskId: 'OC-100',
        title: 'Bootstrap recap',
        summaryPath: '/brain/projects/proj-alpha/recaps/OC-100.md',
        content: '# Bootstrap recap\n\nTask recap line.',
        updatedAt: '2026-03-16T01:00:00.000Z',
      },
    ],
    knowledge: [
      {
        kind: 'decision',
        slug: 'runtime-boundary',
        title: 'Runtime Boundary',
        path: '/brain/projects/proj-alpha/knowledge/decisions/runtime-boundary.md',
        content: 'Keep runtime adapters outside core.',
        sourceTaskIds: ['OC-100'],
        updatedAt: '2026-03-16T01:00:00.000Z',
      },
    ],
    citizens: [
      {
        citizenId: 'citizen-alpha',
        roleId: 'architect',
        displayName: 'Alpha Architect',
        status: 'active',
        persona: 'Think in systems.',
        boundaries: ['Keep adapters outside core.'],
        skillsRef: ['acpx-agent-delegate'],
        channelPolicies: { discord: { posting: 'human_gate' } },
        brainScaffoldMode: 'role_default',
        runtimeAdapter: 'openclaw',
        runtimeMetadata: { mode: 'preview' },
      },
    ],
    work: {
      tasks: [
        {
          id: 'OC-100',
          title: 'Bootstrap recap',
          state: 'in_progress',
          projectId: 'proj-alpha',
        },
      ],
      todos: [],
      recaps: [
        {
          taskId: 'OC-100',
          title: 'Bootstrap recap',
          summaryPath: '/brain/projects/proj-alpha/recaps/OC-100.md',
          content: '# Bootstrap recap\n\nTask recap line.',
          updatedAt: '2026-03-16T01:00:00.000Z',
        },
      ],
      knowledge: [
        {
          kind: 'decision',
          slug: 'runtime-boundary',
          title: 'Runtime Boundary',
          path: '/brain/projects/proj-alpha/knowledge/decisions/runtime-boundary.md',
          content: 'Keep runtime adapters outside core.',
          sourceTaskIds: ['OC-100'],
          updatedAt: '2026-03-16T01:00:00.000Z',
        },
      ],
    },
    operator: {
      nomosId: 'agora/default',
      repoPath: '/repo/proj-alpha',
      citizens: [
        {
          citizenId: 'citizen-alpha',
          roleId: 'architect',
          displayName: 'Alpha Architect',
          status: 'active',
          persona: 'Think in systems.',
          boundaries: ['Keep adapters outside core.'],
          skillsRef: ['acpx-agent-delegate'],
          channelPolicies: { discord: { posting: 'human_gate' } },
          brainScaffoldMode: 'role_default',
          runtimeAdapter: 'openclaw',
          runtimeMetadata: { mode: 'preview' },
        },
      ],
    },
    tasks: [],
    todos: [],
  },
  detailLoading: false,
  error: null,
  selectProject: fetchProjectDetail,
};

vi.mock('@/stores/projectStore', () => ({
  useProjectStore: (selector?: (state: typeof projectStoreState) => unknown) =>
    selector ? selector(projectStoreState) : projectStoreState,
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
          markdown: '# Project Context Briefing\n\nContext summary.',
          source_documents: [],
        },
        reference_bundle: {
          scope: 'project_context',
          mode: 'bootstrap',
          project_id: 'proj-alpha',
          inventory: {
            scope: 'project_context',
            project_id: 'proj-alpha',
            generated_at: '2026-03-16T01:00:00.000Z',
            entries: [],
          },
          project_map: {
            index_reference_key: 'index:index',
            timeline_reference_key: 'timeline:timeline',
            inventory_count: 2,
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
        attention_routing_plan: {
          scope: 'project_context',
          mode: 'bootstrap',
          project_id: 'proj-alpha',
          audience: 'controller',
          summary: 'Start from the project map.',
          routes: [
            {
              ordinal: 1,
              reference_key: 'index:index',
              kind: 'project_map',
              rationale: 'Start from the project map.',
            },
          ],
        },
        runtime_delivery: {
          task_id: 'OC-100',
          task_title: 'Bootstrap recap',
          workspace_path: '/tmp/proj-alpha/tasks/OC-100',
          manifest_path: '/tmp/proj-alpha/tasks/OC-100/04-context/runtime-delivery-manifest.md',
          artifact_paths: {
            controller: '/tmp/proj-alpha/tasks/OC-100/04-context/project-context-controller.md',
            citizen: '/tmp/proj-alpha/tasks/OC-100/04-context/project-context-citizen.md',
            craftsman: '/tmp/proj-alpha/tasks/OC-100/04-context/project-context-craftsman.md',
          },
        },
      },
    })),
  };
});

describe('project context page', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setLocale('en-US');
  });

  it('renders the project context workbench shell and delivery surface', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/proj-alpha/context']}>
        <Routes>
          <Route path="/projects/:projectId/context" element={<ProjectBrainPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Project Context' })).toBeInTheDocument();
    expect(screen.getAllByText('Project Alpha').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Context delivery' })).toBeInTheDocument();
    expect(screen.getByText('Start from the project map.')).toBeInTheDocument();
    expect(
      screen.getAllByText((_, node) => node?.textContent?.includes('/tmp/proj-alpha/tasks/OC-100/04-context/runtime-delivery-manifest.md') ?? false).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Project inventory' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All surfaces' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search project surfaces')).toBeInTheDocument();
    expect(screen.getByText('Select a project surface to inspect its context and next actions.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Project overview' })).toHaveAttribute('href', '/projects/proj-alpha');
    expect(vi.mocked(api.getProjectContextDelivery)).toHaveBeenCalledWith('proj-alpha', {
      audience: 'controller',
      task_id: 'OC-100',
    });
  });

  it('filters and searches the project context inventory list', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/proj-alpha/context']}>
        <Routes>
          <Route path="/projects/:projectId/context" element={<ProjectBrainPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Project Context' })).toBeInTheDocument();
    const inventoryPanel = screen.getByRole('heading', { name: 'Project inventory' }).closest('section');
    expect(inventoryPanel).not.toBeNull();
    const inventory = within(inventoryPanel!);
    expect(inventory.getByText('Bootstrap recap')).toBeInTheDocument();
    expect(inventory.getByText('Runtime Boundary')).toBeInTheDocument();
    expect(inventory.getByText('Alpha Architect')).toBeInTheDocument();

    fireEvent.click(inventory.getByRole('button', { name: 'Knowledge notes' }));
    expect(inventory.getByText('Runtime Boundary')).toBeInTheDocument();
    expect(inventory.queryByText('Bootstrap recap')).not.toBeInTheDocument();
    expect(inventory.queryByText('Alpha Architect')).not.toBeInTheDocument();

    fireEvent.click(inventory.getByRole('button', { name: 'All surfaces' }));
    fireEvent.change(inventory.getByPlaceholderText('Search project surfaces'), { target: { value: 'timeline' } });
    expect(inventory.getByText('Project Alpha Timeline')).toBeInTheDocument();
    expect(inventory.queryByText('Runtime Boundary')).not.toBeInTheDocument();
  });

  it('renders detail content for selected inventory documents', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/proj-alpha/context']}>
        <Routes>
          <Route path="/projects/:projectId/context" element={<ProjectBrainPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Project Context' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open context item Project Alpha Timeline' }));
    expect(screen.getAllByText('Foundation doc').length).toBeGreaterThan(0);
    expect(screen.getByText('/brain/projects/proj-alpha/timeline.md')).toBeInTheDocument();
    expect(screen.getByText(/task_recap \| OC-100/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Source Task OC-100' })).toHaveAttribute('href', '/projects/proj-alpha/work/OC-100');

    fireEvent.click(screen.getByRole('button', { name: 'Open context item Runtime Boundary' }));
    expect(screen.getByText('Source Tasks')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Source Task OC-100' })).toHaveAttribute('href', '/projects/proj-alpha/work/OC-100');
    expect(screen.getByText('Continue from this surface')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Project overview' })).toHaveAttribute('href', '/projects/proj-alpha');
    expect(screen.getByRole('link', { name: 'Create Task From Surface' }).getAttribute('href')).toContain('source_kind=knowledge');
    expect(screen.getByRole('link', { name: 'Create Task From Surface' }).getAttribute('href')).toContain('source_title=Runtime+Boundary');

    fireEvent.click(screen.getByRole('button', { name: 'Open context item Alpha Architect' }));
    expect(screen.getByText('Channel Policies')).toBeInTheDocument();
    expect(screen.getByText(/human_gate/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create Task From Surface' }).getAttribute('href')).toContain('source_kind=citizen');
    expect(screen.getByRole('link', { name: 'Create Task From Surface' }).getAttribute('href')).toContain('source_title=Alpha+Architect');
    expect(screen.getByRole('link', { name: 'Back to Project overview' })).toHaveAttribute('href', '/projects/proj-alpha');
  });
});
