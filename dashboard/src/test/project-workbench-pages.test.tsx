import { MemoryRouter, Route, Routes } from 'react-router';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectDetailPage } from '@/pages/ProjectDetailPage';
import { ProjectsPage } from '@/pages/ProjectsPage';

const fetchProjects = vi.fn(async () => 'live');
const fetchProjectDetail = vi.fn(async () => 'live');

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
    recaps: [
      {
        taskId: 'OC-100',
        title: 'Bootstrap recap',
        summaryPath: '/brain/projects/proj-alpha/recaps/OC-100.md',
        completedAt: '2026-03-16T01:00:00.000Z',
      },
    ],
    knowledge: [
      {
        kind: 'decision',
        slug: 'runtime-boundary',
        title: 'Runtime Boundary',
        summary: 'Keep runtime adapters outside core.',
        path: '/brain/projects/proj-alpha/knowledge/decisions/runtime-boundary.md',
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
      },
    ],
  },
  loading: false,
  detailLoading: false,
  error: null,
  fetchProjects,
  selectProject: fetchProjectDetail,
  clearError: vi.fn(),
};

vi.mock('@/stores/projectStore', () => ({
  useProjectStore: (selector?: (state: typeof projectStoreState) => unknown) =>
    selector ? selector(projectStoreState) : projectStoreState,
}));

describe('project workbench pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the projects list page', () => {
    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Projects' })).toBeInTheDocument();
    expect(screen.getByText('Project Alpha')).toBeInTheDocument();
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
  });
});
