import { MemoryRouter, Route, Routes } from 'react-router';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '@/lib/i18n';
import { ProjectDetailPage } from '@/pages/ProjectDetailPage';
import { ProjectsPage } from '@/pages/ProjectsPage';

const fetchProjects = vi.fn(async () => 'live');
const fetchProjectDetail = vi.fn(async () => 'live');
const createProject = vi.fn(async () => ({
  id: 'proj-beta',
  name: 'Project Beta',
  summary: 'New project',
  owner: 'archon',
  status: 'active',
  createdAt: '2026-03-16T02:00:00.000Z',
  updatedAt: '2026-03-16T02:00:00.000Z',
}));
const updateTodo = vi.fn(async () => undefined);
const deleteTodo = vi.fn(async () => undefined);
const promoteTodo = vi.fn(async () => ({ task: { id: 'OC-401' } }));

const projectStoreState = {
  projects: [
    {
      id: 'proj-alpha',
      name: 'Project Alpha',
      summary: 'Core + brain baseline',
      owner: 'archon',
      status: 'active',
      createdAt: '2026-03-16T00:00:00.000Z',
      updatedAt: '2026-03-16T01:00:00.000Z',
    },
  ],
  selectedProjectId: 'proj-alpha',
  selectedProject: {
    project: {
      id: 'proj-alpha',
      name: 'Project Alpha',
      summary: 'Core + brain baseline',
      owner: 'archon',
      status: 'active',
      createdAt: '2026-03-16T00:00:00.000Z',
      updatedAt: '2026-03-16T01:00:00.000Z',
    },
    index: {
      kind: 'index',
      slug: 'index',
      title: 'Project Alpha',
      path: '/brain/projects/proj-alpha/index.md',
      content: '# Project Alpha',
      updatedAt: '2026-03-16T01:00:00.000Z',
    },
    timeline: {
      kind: 'timeline',
      slug: 'timeline',
      title: 'Project Alpha Timeline',
      path: '/brain/projects/proj-alpha/timeline.md',
      content: '# Timeline\n\n- 2026-03-16 | task_recap | OC-100',
      updatedAt: '2026-03-16T01:30:00.000Z',
    },
    recaps: [
      {
        taskId: 'OC-100',
        title: 'Bootstrap recap',
        summaryPath: '/brain/projects/proj-alpha/recaps/OC-100.md',
        content: '# Bootstrap recap\n\nTask recap line.\n\nNext step: wire dashboard reader.',
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
        skillsRef: ['acpx-agent-delegate', 'planning-with-files'],
        channelPolicies: { discord: { posting: 'human_gate' } },
        brainScaffoldMode: 'role_default',
        runtimeAdapter: 'openclaw',
        runtimeMetadata: { mode: 'preview', version: 1 },
      },
    ],
    tasks: [
      {
        id: 'OC-100',
        title: 'Bootstrap flow',
        state: 'in_progress',
        projectId: 'proj-alpha',
      },
      {
        id: 'OC-101',
        title: 'Review handoff',
        state: 'gate_waiting',
        projectId: 'proj-alpha',
      },
    ],
    todos: [
      {
        id: 3,
        text: '补 Project 入口',
        status: 'pending',
        projectId: 'proj-alpha',
      },
      {
        id: 4,
        text: '整理 recap',
        status: 'done',
        projectId: 'proj-alpha',
      },
    ],
  },
  loading: false,
  detailLoading: false,
  error: null,
  fetchProjects,
  createProject,
  selectProject: fetchProjectDetail,
  clearError: vi.fn(),
};

vi.mock('@/stores/projectStore', () => ({
  useProjectStore: (selector?: (state: typeof projectStoreState) => unknown) =>
    selector ? selector(projectStoreState) : projectStoreState,
}));

vi.mock('@/stores/todoStore', () => ({
  useTodoStore: (selector?: (state: {
    updateTodo: typeof updateTodo;
    deleteTodo: typeof deleteTodo;
    promoteTodo: typeof promoteTodo;
  }) => unknown) => (
    selector ? selector({
      updateTodo,
      deleteTodo,
      promoteTodo,
    }) : {
      updateTodo,
      deleteTodo,
      promoteTodo,
    }
  ),
}));

describe('project workbench pages', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setLocale('en-US');
  });

  it('renders the projects list page', () => {
    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Projects' })).toBeInTheDocument();
    expect(screen.getByText('Project Alpha')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Project' })).toBeInTheDocument();
  });

  it('creates a project without exposing a manual project id input', async () => {
    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Create Project' }));
    expect(screen.queryByText('Project ID')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Project Name'), { target: { value: 'Project Beta' } });
    fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'New project' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Project Creation' }));

    await waitFor(() => {
      expect(createProject).toHaveBeenCalledWith({
        name: 'Project Beta',
        owner: 'archon',
        summary: 'New project',
      });
    });
  });

  it('renders the project detail page', () => {
    render(
      <MemoryRouter initialEntries={['/projects/proj-alpha']}>
        <Routes>
          <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Project Alpha' })).toBeInTheDocument();
    expect(screen.getByText('Bootstrap recap')).toBeInTheDocument();
    expect(screen.getByText('Runtime Boundary')).toBeInTheDocument();
    expect(screen.getByText('Alpha Architect')).toBeInTheDocument();
    expect(screen.getAllByText('Active Tasks').length).toBeGreaterThan(0);
    expect(screen.getByText('Waiting Review')).toBeInTheDocument();
    expect(screen.getAllByText('Pending Todos').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Bootstrap flow' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review handoff' })).toBeInTheDocument();
    expect(screen.getByText('补 Project 入口')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create Task In Project' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create Todo In Project' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Project Brain' })).toBeInTheDocument();
    expect(screen.getByText('Citizen Preview')).toBeInTheDocument();
    expect(screen.getByText('Think in systems.')).toBeInTheDocument();
    expect(screen.getByText('openclaw')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open recap Bootstrap recap' }));
    expect(screen.getByRole('dialog', { name: 'PROJECT RECAP' })).toBeInTheDocument();
    expect(screen.getByText('Task recap line.')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /关闭|Close/ })[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Open knowledge Runtime Boundary' }));
    const knowledgeDialog = screen.getByRole('dialog', { name: 'PROJECT KNOWLEDGE' });
    expect(knowledgeDialog).toBeInTheDocument();
    expect(within(knowledgeDialog).getByText('OC-100')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /关闭|Close/ })[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Open citizen Alpha Architect' }));
    const citizenDialog = screen.getByRole('dialog', { name: 'CITIZEN PREVIEW' });
    expect(citizenDialog).toBeInTheDocument();
    expect(within(citizenDialog).getByText('acpx-agent-delegate, planning-with-files')).toBeInTheDocument();
    expect(within(citizenDialog).getByText(/human_gate/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /关闭|Close/ })[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Waiting Review Tasks' }));
    expect(screen.queryByRole('link', { name: 'Bootstrap flow' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review handoff' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pending Todos Only' }));
    expect(screen.queryByText('整理 recap')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mark Todo Done' }));
    fireEvent.click(screen.getByRole('button', { name: 'Promote Todo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Todo' }));
    expect(updateTodo).toHaveBeenCalledWith(3, { status: 'done' });
    expect(promoteTodo).toHaveBeenCalledWith(3, { type: 'quick', creator: 'archon', priority: 'normal' });
    expect(deleteTodo).toHaveBeenCalledWith(3);
  });
});
