import { MemoryRouter, Route, Routes } from 'react-router';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '@/lib/i18n';
import { ProjectDetailPage } from '@/pages/ProjectDetailPage';
import { ProjectsPage } from '@/pages/ProjectsPage';

const fetchProjects = vi.fn(async () => 'live');
const fetchProjectDetail = vi.fn(async () => 'live');
const { installProjectNomos } = vi.hoisted(() => ({
  installProjectNomos: vi.fn(async () => ({
    project_id: 'proj-alpha',
    nomos: {
      id: 'agora/default',
      name: 'Agora Default Nomos',
      version: '0.1.0',
      description: 'Built-in Nomos',
      source: 'builtin:agora-default',
      install_mode: 'copy_on_install',
    },
    project_state_root: '/Users/example/.agora/projects/proj-alpha',
    repo_shim_path: '/repo/proj-alpha/AGENTS.md',
    repo_git_initialized: false,
    project_state_git_initialized: true,
    bootstrap_task_id: null,
  })),
}));
const { runProjectNomosDoctor } = vi.hoisted(() => ({
  runProjectNomosDoctor: vi.fn(async () => ({
    project_id: 'proj-alpha',
    db_path: '/tmp/agora.db',
    embedding: {
      configured: true,
      healthy: true,
      provider: 'openai-compatible',
      model: 'embedding-3',
    },
    vector_index: {
      configured: true,
      provider: 'qdrant',
      healthy: true,
      chunk_count: 16,
    },
    jobs: {
      pending: 0,
      running: 0,
      failed: 0,
      succeeded: 4,
    },
    drift: {
      detected: false,
      documents_without_jobs: 0,
    },
  })),
}));
const { reviewProjectNomos, activateProjectNomos, validateProjectNomos, diffProjectNomos } = vi.hoisted(() => ({
  reviewProjectNomos: vi.fn(async () => ({
    project_id: 'proj-alpha',
    activation_status: 'active_builtin',
    can_activate: true,
    issues: [],
    active: {
      pack_id: 'agora/default',
      name: 'Agora Default Nomos',
      version: '0.1.0',
      description: 'Built-in Nomos',
      lifecycle_modules: ['project-bootstrap', 'task-context-delivery', 'task-closeout'],
      doctor_checks: ['constitution-present'],
      source: 'builtin:agora-default',
      root: '/Users/example/.agora/projects/proj-alpha',
      profile_path: '/Users/example/.agora/projects/proj-alpha/profile.toml',
    },
    draft: {
      pack_id: 'project/proj-alpha',
      name: 'Project Alpha Nomos',
      version: '0.1.0',
      description: 'Project draft',
      lifecycle_modules: ['project-bootstrap', 'task-context-delivery', 'task-closeout'],
      doctor_checks: ['constitution-present'],
      source: 'project_state_draft',
      root: '/Users/example/.agora/projects/proj-alpha/nomos/project-nomos',
      profile_path: '/Users/example/.agora/projects/proj-alpha/nomos/project-nomos/profile.toml',
    },
  })),
  activateProjectNomos: vi.fn(async () => ({
    project_id: 'proj-alpha',
    nomos_id: 'project/proj-alpha',
    activation_status: 'active_project',
    active_root: '/Users/example/.agora/projects/proj-alpha/nomos/project-nomos',
    active_profile_path: '/Users/example/.agora/projects/proj-alpha/nomos/project-nomos/profile.toml',
    activated_at: '2026-03-23T10:00:00.000Z',
    activated_by: 'archon',
  })),
  validateProjectNomos: vi.fn(async () => ({
    project_id: 'proj-alpha',
    target: 'draft',
    valid: true,
    activation_status: 'active_builtin',
    pack: {
      pack_id: 'project/proj-alpha',
      name: 'Project Alpha Nomos',
      version: '0.1.0',
      description: 'Project draft',
      lifecycle_modules: ['project-bootstrap', 'task-context-delivery', 'task-closeout'],
      doctor_checks: ['constitution-present'],
      source: 'project_state_draft',
      root: '/Users/example/.agora/projects/proj-alpha/nomos/project-nomos',
      profile_path: '/Users/example/.agora/projects/proj-alpha/nomos/project-nomos/profile.toml',
    },
    issues: [],
  })),
  diffProjectNomos: vi.fn(async () => ({
    project_id: 'proj-alpha',
    base: 'builtin',
    candidate: 'draft',
    changed: true,
    base_pack: {
      pack_id: 'agora/default',
      name: 'Agora Default Nomos',
      version: '0.1.0',
      description: 'Built-in Nomos',
      lifecycle_modules: ['project-bootstrap', 'task-context-delivery', 'task-closeout'],
      doctor_checks: ['constitution-present'],
      source: 'builtin:agora-default',
      root: '/Users/example/.agora/projects/proj-alpha',
      profile_path: '/Users/example/.agora/projects/proj-alpha/profile.toml',
    },
    candidate_pack: {
      pack_id: 'project/proj-alpha',
      name: 'Project Alpha Nomos',
      version: '0.1.0',
      description: 'Project draft',
      lifecycle_modules: ['project-bootstrap', 'task-context-delivery', 'task-closeout'],
      doctor_checks: ['constitution-present'],
      source: 'project_state_draft',
      root: '/Users/example/.agora/projects/proj-alpha/nomos/project-nomos',
      profile_path: '/Users/example/.agora/projects/proj-alpha/nomos/project-nomos/profile.toml',
    },
    differences: [{ field: 'pack_id', from: 'agora/default', to: 'project/proj-alpha' }],
  })),
}));
const { exportProjectNomos, installProjectNomosPack } = vi.hoisted(() => ({
  exportProjectNomos: vi.fn(async () => ({
    project_id: 'proj-alpha',
    target: 'draft',
    output_dir: '/tmp/exported-pack',
    pack: {
      pack_id: 'project/proj-alpha',
      name: 'Project Alpha Nomos',
      version: '0.1.0',
      description: 'Project draft',
      lifecycle_modules: ['project-bootstrap', 'task-context-delivery', 'task-closeout'],
      doctor_checks: ['constitution-present'],
      source: 'project_state_draft',
      root: '/Users/example/.agora/projects/proj-alpha/nomos/project-nomos',
      profile_path: '/Users/example/.agora/projects/proj-alpha/nomos/project-nomos/profile.toml',
    },
  })),
  installProjectNomosPack: vi.fn(async () => ({
    project_id: 'proj-alpha',
    pack: {
      pack_id: 'project/proj-alpha',
      name: 'Project Alpha Nomos',
      version: '0.1.0',
      description: 'Project draft',
      lifecycle_modules: ['project-bootstrap', 'task-context-delivery', 'task-closeout'],
      doctor_checks: ['constitution-present'],
      source: 'project_state_draft',
      root: '/Users/example/.agora/projects/proj-alpha/nomos/project-nomos',
      profile_path: '/Users/example/.agora/projects/proj-alpha/nomos/project-nomos/profile.toml',
    },
    installed_root: '/Users/example/.agora/projects/proj-alpha/nomos/project-nomos',
    installed_profile_path: '/Users/example/.agora/projects/proj-alpha/nomos/project-nomos/profile.toml',
    metadata: {},
  })),
}));
const { publishProjectNomosToCatalog, listPublishedNomosCatalog, showPublishedNomosCatalog, installCatalogNomosPack } = vi.hoisted(() => ({
  publishProjectNomosToCatalog: vi.fn(async () => ({
    project_id: 'proj-alpha',
    target: 'draft',
    catalog_root: '/Users/example/.agora/nomos/catalog',
    catalog_pack_root: '/Users/example/.agora/nomos/catalog/packs/project/proj-alpha',
    manifest_path: '/Users/example/.agora/nomos/catalog/packs/project/proj-alpha/catalog-entry.json',
    entry: {
      schema_version: 1,
      pack_id: 'project/proj-alpha',
      published_at: '2026-03-24T12:00:00.000Z',
      published_by: 'archon',
      published_note: 'shareable baseline',
      source_project_id: 'proj-alpha',
      source_target: 'draft',
      source_activation_status: 'active_builtin',
      source_repo_path: '/repo/proj-alpha',
      published_root: '/Users/example/.agora/nomos/catalog/packs/project/proj-alpha',
      manifest_path: '/Users/example/.agora/nomos/catalog/packs/project/proj-alpha/catalog-entry.json',
      pack: {
        pack_id: 'project/proj-alpha',
        name: 'Project Alpha Nomos',
        version: '0.1.0',
        description: 'Project draft',
        lifecycle_modules: ['project-bootstrap', 'task-context-delivery', 'task-closeout'],
        doctor_checks: ['constitution-present'],
        source: 'project_state_draft',
        root: '/Users/example/.agora/projects/proj-alpha/nomos/project-nomos',
        profile_path: '/Users/example/.agora/projects/proj-alpha/nomos/project-nomos/profile.toml',
      },
    },
  })),
  listPublishedNomosCatalog: vi.fn(async () => ({
    catalog_root: '/Users/example/.agora/nomos/catalog',
    total: 1,
    summaries: [{
      pack_id: 'project/proj-alpha',
      name: 'Project Alpha Nomos',
      version: '0.1.0',
      description: 'Project draft',
      published_at: '2026-03-24T12:00:00.000Z',
      published_by: 'archon',
      source_project_id: 'proj-alpha',
      source_target: 'draft',
      source_repo_path: '/repo/proj-alpha',
    }],
    entries: [],
  })),
  showPublishedNomosCatalog: vi.fn(async () => ({
    schema_version: 1,
    pack_id: 'project/proj-alpha',
    published_at: '2026-03-24T12:00:00.000Z',
    published_by: 'archon',
    published_note: 'shareable baseline',
    source_project_id: 'proj-alpha',
    source_target: 'draft',
    source_activation_status: 'active_builtin',
    source_repo_path: '/repo/proj-alpha',
    published_root: '/Users/example/.agora/nomos/catalog/packs/project/proj-alpha',
    manifest_path: '/Users/example/.agora/nomos/catalog/packs/project/proj-alpha/catalog-entry.json',
    pack: {
      pack_id: 'project/proj-alpha',
      name: 'Project Alpha Nomos',
      version: '0.1.0',
      description: 'Project draft',
      lifecycle_modules: ['project-bootstrap', 'task-context-delivery', 'task-closeout'],
      doctor_checks: ['constitution-present'],
      source: 'project_state_draft',
      root: '/Users/example/.agora/projects/proj-alpha/nomos/project-nomos',
      profile_path: '/Users/example/.agora/projects/proj-alpha/nomos/project-nomos/profile.toml',
    },
  })),
  installCatalogNomosPack: vi.fn(async () => ({
    project_id: 'proj-alpha',
    pack: {
      pack_id: 'project/proj-alpha',
      name: 'Project Alpha Nomos',
      version: '0.1.0',
      description: 'Project draft',
      lifecycle_modules: ['project-bootstrap', 'task-context-delivery', 'task-closeout'],
      doctor_checks: ['constitution-present'],
      source: 'project_state_draft',
      root: '/Users/example/.agora/projects/proj-alpha/nomos/project-nomos',
      profile_path: '/Users/example/.agora/projects/proj-alpha/nomos/project-nomos/profile.toml',
    },
    installed_root: '/Users/example/.agora/projects/proj-alpha/nomos/project-nomos',
    installed_profile_path: '/Users/example/.agora/projects/proj-alpha/nomos/project-nomos/profile.toml',
    metadata: {},
    catalog_entry: {
      schema_version: 1,
      pack_id: 'project/proj-alpha',
      published_at: '2026-03-24T12:00:00.000Z',
      published_by: 'archon',
      published_note: 'shareable baseline',
      source_project_id: 'proj-alpha',
      source_target: 'draft',
      source_activation_status: 'active_builtin',
      source_repo_path: '/repo/proj-alpha',
      published_root: '/Users/example/.agora/nomos/catalog/packs/project/proj-alpha',
      manifest_path: '/Users/example/.agora/nomos/catalog/packs/project/proj-alpha/catalog-entry.json',
      pack: {
        pack_id: 'project/proj-alpha',
        name: 'Project Alpha Nomos',
        version: '0.1.0',
        description: 'Project draft',
        lifecycle_modules: ['project-bootstrap', 'task-context-delivery', 'task-closeout'],
        doctor_checks: ['constitution-present'],
        source: 'project_state_draft',
        root: '/Users/example/.agora/projects/proj-alpha/nomos/project-nomos',
        profile_path: '/Users/example/.agora/projects/proj-alpha/nomos/project-nomos/profile.toml',
      },
    },
  })),
}));
const createProject = vi.fn(async () => ({
  id: 'proj-beta',
  name: 'Project Beta',
  summary: 'New project',
  owner: 'archon',
  status: 'active',
  nomosId: 'agora/default',
  repoPath: null,
  createdAt: '2026-03-16T02:00:00.000Z',
  updatedAt: '2026-03-16T02:00:00.000Z',
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    installProjectNomos,
    runProjectNomosDoctor,
    reviewProjectNomos,
    activateProjectNomos,
    validateProjectNomos,
    diffProjectNomos,
    exportProjectNomos,
    installProjectNomosPack,
    publishProjectNomosToCatalog,
    listPublishedNomosCatalog,
    showPublishedNomosCatalog,
    installCatalogNomosPack,
  };
});
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
      nomosId: 'agora/default',
      repoPath: '/repo/proj-alpha',
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
      nomosId: 'agora/default',
      repoPath: '/repo/proj-alpha',
      createdAt: '2026-03-16T00:00:00.000Z',
      updatedAt: '2026-03-16T01:00:00.000Z',
    },
    nomos: {
      nomosId: 'agora/default',
      activationStatus: 'active_builtin',
      projectStateRoot: '/Users/example/.agora/projects/proj-alpha',
      profilePath: '/Users/example/.agora/projects/proj-alpha/profile.toml',
      profileInstalled: true,
      repoPath: '/repo/proj-alpha',
      repoShimInstalled: true,
      bootstrapPromptsDir: '/Users/example/.agora/projects/proj-alpha/prompts/bootstrap',
      lifecycleModules: ['project-bootstrap', 'task-context-delivery', 'task-closeout'],
      draftRoot: '/Users/example/.agora/projects/proj-alpha/nomos/project-nomos',
      draftProfilePath: '/Users/example/.agora/projects/proj-alpha/nomos/project-nomos/profile.toml',
      draftProfileInstalled: true,
      activeRoot: '/Users/example/.agora/projects/proj-alpha',
      activeProfilePath: '/Users/example/.agora/projects/proj-alpha/profile.toml',
      activeProfileInstalled: true,
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
    expect(screen.getByText('Nomos: agora/default')).toBeInTheDocument();
    expect(screen.getByText('Repo Bound')).toBeInTheDocument();
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

  it('renders the project detail page', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/proj-alpha']}>
        <Routes>
          <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Project Alpha' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Nomos State' })).toBeInTheDocument();
    expect(screen.getAllByText('/Users/example/.agora/projects/proj-alpha').length).toBeGreaterThan(0);
    expect(screen.getByText('/repo/proj-alpha')).toBeInTheDocument();
    expect(screen.getAllByText('Yes').length).toBeGreaterThan(0);
    expect(screen.getByText('project-bootstrap, task-context-delivery, task-closeout')).toBeInTheDocument();
    expect(screen.getByText('active_builtin')).toBeInTheDocument();
    expect(screen.getByText('/Users/example/.agora/projects/proj-alpha/nomos/project-nomos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review Draft' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Activate Draft' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Validate Draft' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Diff Draft' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export Pack' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish To Catalog' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Install Pack' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh Catalog' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reinstall Nomos' }));
    await waitFor(() => {
      expect(installProjectNomos).toHaveBeenCalledWith('proj-alpha', {
        skip_bootstrap_task: true,
      });
    });
    expect(fetchProjectDetail).toHaveBeenCalledWith('proj-alpha');
    expect(screen.getByText('Nomos reinstalled and project state refreshed.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Rerun Bootstrap' }));
    await waitFor(() => {
      expect(installProjectNomos).toHaveBeenCalledWith('proj-alpha', {
        skip_bootstrap_task: false,
      });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Run Doctor' }));
    await waitFor(() => {
      expect(runProjectNomosDoctor).toHaveBeenCalledWith('proj-alpha');
    });
    expect(screen.getByText('Doctor report refreshed.')).toBeInTheDocument();
    expect(screen.getByText('openai-compatible / Yes')).toBeInTheDocument();
    expect(screen.getByText('qdrant / 16')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review Draft' }));
    await waitFor(() => {
      expect(reviewProjectNomos).toHaveBeenCalledWith('proj-alpha');
    });
    expect(screen.getByTestId('project-nomos-review')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Validate Draft' }));
    await waitFor(() => {
      expect(validateProjectNomos).toHaveBeenCalledWith('proj-alpha', 'draft');
    });
    expect(screen.getByTestId('project-nomos-validation')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Diff Draft' }));
    await waitFor(() => {
      expect(diffProjectNomos).toHaveBeenCalledWith('proj-alpha', { base: 'builtin', candidate: 'draft' });
    });
    expect(screen.getByTestId('project-nomos-diff')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Activate Draft' }));
    await waitFor(() => {
      expect(activateProjectNomos).toHaveBeenCalledWith('proj-alpha', 'archon');
    });
    expect(screen.getByText('Project Nomos activated.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Export Dir'), { target: { value: '/tmp/exported-pack' } });
    fireEvent.click(screen.getByRole('button', { name: 'Export Pack' }));
    await waitFor(() => {
      expect(exportProjectNomos).toHaveBeenCalledWith('proj-alpha', '/tmp/exported-pack', 'draft');
    });
    fireEvent.change(screen.getByLabelText('Publish Note'), { target: { value: 'shareable baseline' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publish To Catalog' }));
    await waitFor(() => {
      expect(publishProjectNomosToCatalog).toHaveBeenCalledWith('proj-alpha', {
        target: 'draft',
        published_by: 'archon',
        published_note: 'shareable baseline',
      });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh Catalog' }));
    await waitFor(() => {
      expect(listPublishedNomosCatalog).toHaveBeenCalledWith();
    });
    expect(screen.getByTestId('project-nomos-catalog-panel')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Catalog Pack Id'), { target: { value: 'project/proj-alpha' } });
    fireEvent.click(screen.getByRole('button', { name: 'Show Catalog Entry' }));
    await waitFor(() => {
      expect(showPublishedNomosCatalog).toHaveBeenCalledWith('project/proj-alpha');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Install From Catalog' }));
    await waitFor(() => {
      expect(installCatalogNomosPack).toHaveBeenCalledWith('proj-alpha', 'project/proj-alpha');
    });
    fireEvent.change(screen.getByLabelText('Pack Dir'), { target: { value: '/tmp/exported-pack' } });
    fireEvent.click(screen.getByRole('button', { name: 'Install Pack' }));
    await waitFor(() => {
      expect(installProjectNomosPack).toHaveBeenCalledWith('proj-alpha', '/tmp/exported-pack');
    });
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
