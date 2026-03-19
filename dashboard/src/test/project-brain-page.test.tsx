import { MemoryRouter, Route, Routes } from 'react-router';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '@/lib/i18n';
import { ProjectBrainPage } from '@/pages/ProjectBrainPage';

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
      createdAt: '2026-03-16T00:00:00.000Z',
      updatedAt: '2026-03-16T01:00:00.000Z',
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

describe('project brain page', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setLocale('en-US');
  });

  it('renders the project brain workbench shell', () => {
    render(
      <MemoryRouter initialEntries={['/projects/proj-alpha/brain']}>
        <Routes>
          <Route path="/projects/:projectId/brain" element={<ProjectBrainPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Project Brain' })).toBeInTheDocument();
    expect(screen.getAllByText('Project Alpha').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'All Documents' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search project brain')).toBeInTheDocument();
    expect(screen.getByText('Select a brain document to inspect it here.')).toBeInTheDocument();
  });

  it('filters and searches the project brain document list', () => {
    render(
      <MemoryRouter initialEntries={['/projects/proj-alpha/brain']}>
        <Routes>
          <Route path="/projects/:projectId/brain" element={<ProjectBrainPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Bootstrap recap')).toBeInTheDocument();
    expect(screen.getByText('Runtime Boundary')).toBeInTheDocument();
    expect(screen.getByText('Alpha Architect')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Knowledge' }));
    expect(screen.getByText('Runtime Boundary')).toBeInTheDocument();
    expect(screen.queryByText('Bootstrap recap')).not.toBeInTheDocument();
    expect(screen.queryByText('Alpha Architect')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'All Documents' }));
    fireEvent.change(screen.getByPlaceholderText('Search project brain'), { target: { value: 'timeline' } });
    expect(screen.getByText('Project Alpha Timeline')).toBeInTheDocument();
    expect(screen.queryByText('Runtime Boundary')).not.toBeInTheDocument();
  });

  it('renders detail content for selected brain documents', () => {
    render(
      <MemoryRouter initialEntries={['/projects/proj-alpha/brain']}>
        <Routes>
          <Route path="/projects/:projectId/brain" element={<ProjectBrainPage />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open brain item Project Alpha Timeline' }));
    expect(screen.getByText('/brain/projects/proj-alpha/timeline.md')).toBeInTheDocument();
    expect(screen.getByText(/task_recap \| OC-100/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Source Task OC-100' })).toHaveAttribute('href', '/tasks/OC-100');

    fireEvent.click(screen.getByRole('button', { name: 'Open brain item Runtime Boundary' }));
    expect(screen.getByText('Source Tasks')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Source Task OC-100' })).toHaveAttribute('href', '/tasks/OC-100');
    expect(screen.getByRole('link', { name: 'Back to Project Detail' })).toHaveAttribute('href', '/projects/proj-alpha');
    expect(screen.getByRole('link', { name: 'Create Task In Project' }).getAttribute('href')).toContain('source_kind=knowledge');
    expect(screen.getByRole('link', { name: 'Create Task In Project' }).getAttribute('href')).toContain('source_title=Runtime+Boundary');

    fireEvent.click(screen.getByRole('button', { name: 'Open brain item Alpha Architect' }));
    expect(screen.getByText('Channel Policies')).toBeInTheDocument();
    expect(screen.getByText(/human_gate/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create Task In Project' }).getAttribute('href')).toContain('source_kind=citizen');
    expect(screen.getByRole('link', { name: 'Create Task In Project' }).getAttribute('href')).toContain('source_title=Alpha+Architect');
    expect(screen.getByRole('link', { name: 'Back to Project Detail' })).toHaveAttribute('href', '/projects/proj-alpha');
  });
});
