import { MemoryRouter, Route, Routes } from 'react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '@/lib/i18n';
import { ProjectArchiveWorkspacePage } from '@/pages/ProjectArchiveWorkspacePage';
import { ProjectDetailPage } from '@/pages/ProjectDetailPage';
import { ProjectKnowledgePage } from '@/pages/ProjectKnowledgePage';
import { ProjectOperatorPage } from '@/pages/ProjectOperatorPage';
import { ProjectsPage } from '@/pages/ProjectsPage';
import { WorkspaceBootstrapPage } from '@/pages/WorkspaceBootstrapPage';
import type { ApiProjectWorkbenchDto } from '@/types/api';

const fetchProjects = vi.fn(async () => 'live');
const PROJECTS_PAGE_SELECTION_KEY = 'agora-projects-selected-project';
const projectStoreState: Record<string, unknown> & {
  selectedProjectId: string | null;
  selectedProject: Record<string, unknown> | null;
} = {
  selectedProjectId: null,
  selectedProject: null,
};

function buildProjectWorkbench(project: {
  id: string;
  name: string;
  summary: string | null;
  owner: string | null;
  status: 'active' | 'archived';
  nomosId: string | null;
  repoPath: string | null;
  createdAt: string;
  updatedAt: string;
}, stats: {
  knowledgeCount: number;
  citizenCount: number;
  recapCount: number;
  taskCount: number;
  activeTaskCount: number;
  reviewTaskCount: number;
  todoCount: number;
  pendingTodoCount: number;
}, taskPrefix: string) {
  return {
    project,
    nomos: project.nomosId
      ? {
          nomosId: project.nomosId,
          activationStatus: 'active_builtin',
          projectStateRoot: `/Users/example/.agora/projects/${project.id}`,
          profilePath: `/Users/example/.agora/projects/${project.id}/profile.toml`,
          profileInstalled: true,
          repoPath: project.repoPath,
          repoShimInstalled: Boolean(project.repoPath),
          bootstrapPromptsDir: `/Users/example/.agora/projects/${project.id}/prompts/bootstrap`,
          lifecycleModules: ['project-bootstrap', 'task-context-delivery', 'task-closeout'],
          draftRoot: `/Users/example/.agora/projects/${project.id}/nomos/project-nomos`,
          draftProfilePath: `/Users/example/.agora/projects/${project.id}/nomos/project-nomos/profile.toml`,
          draftProfileInstalled: true,
          activeRoot: `/Users/example/.agora/projects/${project.id}`,
          activeProfilePath: `/Users/example/.agora/projects/${project.id}/profile.toml`,
          activeProfileInstalled: true,
        }
      : null,
    overview: {
      status: project.status,
      owner: project.owner,
      updatedAt: project.updatedAt,
      stats,
    },
    surfaces: {
      index: {
        kind: 'index',
        slug: 'index',
        title: project.name,
        path: `/brain/projects/${project.id}/index.md`,
        content: `# ${project.name}`,
        updatedAt: project.updatedAt,
      },
      timeline: {
        kind: 'timeline',
        slug: 'timeline',
        title: `${project.name} Timeline`,
        path: `/brain/projects/${project.id}/timeline.md`,
        content: `# Timeline\n\n- 2026-03-16 | task_recap | ${taskPrefix}-100`,
        sourceTaskIds: [`${taskPrefix}-100`],
        updatedAt: project.updatedAt,
      },
    },
    index: {
      kind: 'index',
      slug: 'index',
      title: project.name,
      path: `/brain/projects/${project.id}/index.md`,
      content: `# ${project.name}`,
      updatedAt: project.updatedAt,
    },
    timeline: {
      kind: 'timeline',
      slug: 'timeline',
      title: `${project.name} Timeline`,
      path: `/brain/projects/${project.id}/timeline.md`,
      content: `# Timeline\n\n- 2026-03-16 | task_recap | ${taskPrefix}-100`,
      updatedAt: project.updatedAt,
    },
    recaps: [
      {
        taskId: `${taskPrefix}-100`,
        title: `${project.name} recap`,
        summaryPath: `/brain/projects/${project.id}/recaps/${taskPrefix}-100.md`,
        content: `# ${project.name} recap\n\nRecent checkpoint.`,
        updatedAt: project.updatedAt,
      },
    ],
    knowledge: [
      {
        kind: 'decision',
        slug: `${project.id}-boundary`,
        title: `${project.name} Boundary`,
        path: `/brain/projects/${project.id}/knowledge/decisions/${project.id}-boundary.md`,
        content: `Keep ${project.name} focused.`,
        sourceTaskIds: [`${taskPrefix}-100`],
        updatedAt: project.updatedAt,
      },
    ],
    citizens: [
      {
        citizenId: `citizen-${project.id}`,
        roleId: 'architect',
        displayName: `${project.name} Architect`,
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
    work: {
      tasks: [
        { id: `${taskPrefix}-100`, title: `${project.name} Bootstrap`, state: 'in_progress', projectId: project.id },
        { id: `${taskPrefix}-101`, title: `${project.name} Review`, state: 'gate_waiting', projectId: project.id },
      ],
      todos: [
        { id: stats.taskCount, text: `Organize ${project.name} workspace`, status: 'pending', projectId: project.id },
        { id: stats.taskCount + 1, text: `Archive ${project.name} recap`, status: 'done', projectId: project.id },
      ],
      recaps: [
        {
          taskId: `${taskPrefix}-100`,
          title: `${project.name} recap`,
          summaryPath: `/brain/projects/${project.id}/recaps/${taskPrefix}-100.md`,
          content: `# ${project.name} recap\n\nRecent checkpoint.`,
          updatedAt: project.updatedAt,
        },
      ],
      knowledge: [
        {
          kind: 'decision',
          slug: `${project.id}-boundary`,
          title: `${project.name} Boundary`,
          path: `/brain/projects/${project.id}/knowledge/decisions/${project.id}-boundary.md`,
          content: `Keep ${project.name} focused.`,
          sourceTaskIds: [`${taskPrefix}-100`],
          updatedAt: project.updatedAt,
        },
      ],
    },
    operator: {
      nomosId: project.nomosId,
      repoPath: project.repoPath,
      citizens: [
        {
          citizenId: `citizen-${project.id}`,
          roleId: 'architect',
          displayName: `${project.name} Architect`,
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
    },
    tasks: [
      { id: `${taskPrefix}-100`, title: `${project.name} Bootstrap`, state: 'in_progress', projectId: project.id },
      { id: `${taskPrefix}-101`, title: `${project.name} Review`, state: 'gate_waiting', projectId: project.id },
    ],
    todos: [
      { id: stats.taskCount, text: `Organize ${project.name} workspace`, status: 'pending', projectId: project.id },
      { id: stats.taskCount + 1, text: `Archive ${project.name} recap`, status: 'done', projectId: project.id },
    ],
  };
}

const PROJECT_ALPHA = {
  id: 'proj-alpha',
  name: 'Project Alpha',
  summary: 'Core + brain baseline',
  owner: 'archon',
  status: 'active',
  nomosId: 'agora/default',
  repoPath: '/repo/proj-alpha',
  createdAt: '2026-03-16T00:00:00.000Z',
  updatedAt: '2026-03-16T01:00:00.000Z',
} satisfies Parameters<typeof buildProjectWorkbench>[0];

const PROJECT_BETA = {
  id: 'proj-beta',
  name: 'Beta Delivery',
  summary: 'Delivery slice for customer rollout',
  owner: 'helios',
  status: 'active',
  nomosId: 'agora/default',
  repoPath: null,
  createdAt: '2026-03-15T00:00:00.000Z',
  updatedAt: '2026-03-18T09:00:00.000Z',
} satisfies Parameters<typeof buildProjectWorkbench>[0];

const PROJECT_GAMMA = {
  id: 'proj-gamma',
  name: 'Gamma Research',
  summary: 'Research backlog and discovery stream',
  owner: 'atlas',
  status: 'archived',
  nomosId: null,
  repoPath: '/repo/proj-gamma',
  createdAt: '2026-03-14T00:00:00.000Z',
  updatedAt: '2026-03-17T09:00:00.000Z',
} satisfies Parameters<typeof buildProjectWorkbench>[0];

const PROJECT_DETAILS = {
  'proj-alpha': buildProjectWorkbench(PROJECT_ALPHA, {
    knowledgeCount: 1,
    citizenCount: 1,
    recapCount: 1,
    taskCount: 2,
    activeTaskCount: 2,
    reviewTaskCount: 1,
    todoCount: 2,
    pendingTodoCount: 1,
  }, 'OC'),
  'proj-beta': buildProjectWorkbench(PROJECT_BETA, {
    knowledgeCount: 3,
    citizenCount: 2,
    recapCount: 2,
    taskCount: 6,
    activeTaskCount: 4,
    reviewTaskCount: 2,
    todoCount: 5,
    pendingTodoCount: 3,
  }, 'BD'),
  'proj-gamma': buildProjectWorkbench(PROJECT_GAMMA, {
    knowledgeCount: 5,
    citizenCount: 1,
    recapCount: 4,
    taskCount: 1,
    activeTaskCount: 0,
    reviewTaskCount: 0,
    todoCount: 1,
    pendingTodoCount: 1,
  }, 'GR'),
};

function buildProjectWorkbenchDto(workbench: typeof PROJECT_DETAILS['proj-alpha']): ApiProjectWorkbenchDto {
  const buildTaskDto = (task: typeof workbench.work.tasks[number]): ApiProjectWorkbenchDto['work']['tasks'][number] => ({
    id: task.id,
    version: 1,
    title: task.title,
    description: null,
    type: 'quick',
    priority: 'normal',
    creator: 'archon',
    locale: 'en-US',
    project_id: task.projectId,
    state: task.state === 'done' ? 'done' : 'active',
    archive_status: null,
    authority: null,
    controller_ref: 'archon',
    current_stage: task.state === 'gate_waiting' ? 'review' : 'develop',
    skill_policy: null,
    team: null,
    workflow: null,
    control: null,
    scheduler: null,
    scheduler_snapshot: null,
    discord: null,
    metrics: null,
    error_detail: null,
    created_at: workbench.project.createdAt,
    updated_at: workbench.project.updatedAt,
  });

  const buildTodoDto = (todo: typeof workbench.work.todos[number]): ApiProjectWorkbenchDto['work']['todos'][number] => ({
    id: todo.id,
    text: todo.text,
    project_id: todo.projectId,
    status: todo.status,
    due: null,
    created_at: workbench.project.createdAt,
    completed_at: todo.status === 'done' ? workbench.project.updatedAt : null,
    tags: [],
    promoted_to: null,
  });
  return {
    project: {
      id: workbench.project.id,
      name: workbench.project.name,
      summary: workbench.project.summary,
      owner: workbench.project.owner,
      status: workbench.project.status,
      metadata: {
        ...(workbench.project.nomosId
          ? {
              agora: {
                nomos: {
                  id: workbench.project.nomosId,
                },
              },
            }
          : {}),
        ...(workbench.project.repoPath ? { repo_path: workbench.project.repoPath } : {}),
      },
      created_at: workbench.project.createdAt,
      updated_at: workbench.project.updatedAt,
    },
    overview: {
      status: workbench.overview.status,
      owner: workbench.overview.owner,
      updated_at: workbench.overview.updatedAt,
      counts: {
        knowledge: workbench.overview.stats.knowledgeCount,
        citizens: workbench.overview.stats.citizenCount,
        recaps: workbench.overview.stats.recapCount,
        tasks_total: workbench.overview.stats.taskCount,
        active_tasks: workbench.overview.stats.activeTaskCount,
        review_tasks: workbench.overview.stats.reviewTaskCount,
        todos_total: workbench.overview.stats.todoCount,
        pending_todos: workbench.overview.stats.pendingTodoCount,
      },
    },
    surfaces: {
      index: workbench.surfaces.index ? {
        project_id: workbench.project.id,
        kind: 'index',
        slug: 'index',
        title: workbench.surfaces.index.title,
        path: workbench.surfaces.index.path,
        content: workbench.surfaces.index.content,
        created_at: null,
        updated_at: workbench.surfaces.index.updatedAt,
        source_task_ids: [],
      } : null,
      timeline: workbench.surfaces.timeline ? {
        project_id: workbench.project.id,
        kind: 'timeline',
        slug: 'timeline',
        title: workbench.surfaces.timeline.title,
        path: workbench.surfaces.timeline.path,
        content: workbench.surfaces.timeline.content,
        created_at: null,
        source_task_ids: workbench.surfaces.timeline.sourceTaskIds,
        updated_at: workbench.surfaces.timeline.updatedAt,
      } : null,
    },
    work: {
      recaps: workbench.work.recaps.map((recap) => ({
        project_id: workbench.project.id,
        task_id: recap.taskId,
        title: recap.title,
        path: recap.summaryPath,
        content: recap.content,
        updated_at: recap.updatedAt,
      })),
      knowledge: workbench.work.knowledge.map((knowledge) => ({
        project_id: workbench.project.id,
        kind: knowledge.kind as ApiProjectWorkbenchDto['work']['knowledge'][number]['kind'],
        slug: knowledge.slug,
        title: knowledge.title,
        path: knowledge.path,
        content: knowledge.content,
        created_at: null,
        source_task_ids: knowledge.sourceTaskIds,
        updated_at: knowledge.updatedAt,
      })),
      tasks: workbench.work.tasks.map(buildTaskDto),
      todos: workbench.work.todos.map(buildTodoDto),
    },
    operator: {
      nomos_id: workbench.operator.nomosId,
      repo_path: workbench.operator.repoPath,
        citizens: workbench.operator.citizens.map((citizen) => ({
          citizen_id: citizen.citizenId,
          project_id: workbench.project.id,
          role_id: citizen.roleId,
          display_name: citizen.displayName,
          status: citizen.status as ApiProjectWorkbenchDto['operator']['citizens'][number]['status'],
          persona: citizen.persona,
          boundaries: citizen.boundaries,
          skills_ref: citizen.skillsRef,
          channel_policies: citizen.channelPolicies,
          brain_scaffold_mode: citizen.brainScaffoldMode as ApiProjectWorkbenchDto['operator']['citizens'][number]['brain_scaffold_mode'],
          runtime_projection: {
            adapter: citizen.runtimeAdapter,
            auto_provision: false,
          metadata: citizen.runtimeMetadata,
        },
        created_at: workbench.project.createdAt,
        updated_at: workbench.project.updatedAt,
      })),
    },
  };
}

const PROJECT_WORKBENCH_DTOS = {
  'proj-alpha': buildProjectWorkbenchDto(PROJECT_DETAILS['proj-alpha']),
  'proj-beta': buildProjectWorkbenchDto(PROJECT_DETAILS['proj-beta']),
  'proj-gamma': buildProjectWorkbenchDto(PROJECT_DETAILS['proj-gamma']),
};

PROJECT_DETAILS['proj-alpha'].recaps = [
  {
    taskId: 'OC-100',
    title: 'Bootstrap recap',
    summaryPath: '/brain/projects/proj-alpha/recaps/OC-100.md',
    content: '# Bootstrap recap\n\nTask recap line.\n\nNext step: wire dashboard reader.',
    updatedAt: '2026-03-16T01:00:00.000Z',
  },
];
PROJECT_DETAILS['proj-alpha'].work.recaps = PROJECT_DETAILS['proj-alpha'].recaps;
PROJECT_DETAILS['proj-alpha'].knowledge = [
  {
    kind: 'decision',
    slug: 'runtime-boundary',
    title: 'Runtime Boundary',
    path: '/brain/projects/proj-alpha/knowledge/decisions/runtime-boundary.md',
    content: 'Keep runtime adapters outside core.',
    sourceTaskIds: ['OC-100'],
    updatedAt: '2026-03-16T01:00:00.000Z',
  },
];
PROJECT_DETAILS['proj-alpha'].work.knowledge = PROJECT_DETAILS['proj-alpha'].knowledge;
PROJECT_DETAILS['proj-alpha'].tasks = [
  { id: 'OC-100', title: 'Bootstrap flow', state: 'in_progress', projectId: 'proj-alpha' },
  { id: 'OC-101', title: 'Review handoff', state: 'gate_waiting', projectId: 'proj-alpha' },
];
PROJECT_DETAILS['proj-alpha'].work.tasks = PROJECT_DETAILS['proj-alpha'].tasks;
PROJECT_DETAILS['proj-alpha'].todos = [
  { id: 3, text: '补 Project 入口', status: 'pending', projectId: 'proj-alpha' },
  { id: 4, text: '整理 recap', status: 'done', projectId: 'proj-alpha' },
];
PROJECT_DETAILS['proj-alpha'].work.todos = PROJECT_DETAILS['proj-alpha'].todos;
PROJECT_DETAILS['proj-alpha'].citizens = [
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
];
PROJECT_DETAILS['proj-alpha'].operator.citizens = PROJECT_DETAILS['proj-alpha'].citizens;

const fetchProjectDetail = vi.fn(async (projectId: string | null) => {
  if (!projectId) {
    projectStoreState.selectedProjectId = null;
    projectStoreState.selectedProject = null;
    return;
  }
  projectStoreState.selectedProjectId = projectId;
  projectStoreState.selectedProject = PROJECT_DETAILS[projectId as keyof typeof PROJECT_DETAILS] ?? null;
});
const fetchProjectMembers = vi.fn(async () => ([
  {
    id: 'pm-1',
    projectId: 'proj-alpha',
    accountId: 11,
    role: 'admin' as const,
    status: 'active' as const,
    addedByAccountId: null,
    createdAt: '2026-03-24T00:00:00.000Z',
    updatedAt: '2026-03-24T00:00:00.000Z',
  },
  {
    id: 'pm-2',
    projectId: 'proj-alpha',
    accountId: 12,
    role: 'member' as const,
    status: 'active' as const,
    addedByAccountId: 11,
    createdAt: '2026-03-24T00:00:00.000Z',
    updatedAt: '2026-03-24T00:00:00.000Z',
  },
]));
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
const { importNomosSource, installProjectNomosFromSource } = vi.hoisted(() => ({
  importNomosSource: vi.fn(async () => ({
    source_dir: '/tmp/nomos-source',
    source_kind: 'pack_root',
    manifest_path: null,
    entry: {
      schema_version: 1,
      pack_id: 'project/proj-alpha',
      published_at: '2026-03-25T12:00:00.000Z',
      source_kind: 'pack_root',
      published_by: null,
      published_note: null,
      source_project_id: 'external',
      source_target: 'draft',
      source_activation_status: 'active_builtin',
      source_repo_path: '/tmp/nomos-source',
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
  installProjectNomosFromSource: vi.fn(async () => ({
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
      published_at: '2026-03-25T12:00:00.000Z',
      source_kind: 'pack_root',
      published_by: null,
      published_note: null,
      source_project_id: 'external',
      source_target: 'draft',
      source_activation_status: 'active_builtin',
      source_repo_path: '/tmp/nomos-source',
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
    imported: {
      source_dir: '/tmp/nomos-source',
      source_kind: 'pack_root',
      manifest_path: null,
      entry: {
        schema_version: 1,
        pack_id: 'project/proj-alpha',
        source_kind: 'pack_root',
        published_at: '2026-03-25T12:00:00.000Z',
        published_by: null,
        published_note: null,
        source_project_id: 'external',
        source_target: 'draft',
        source_activation_status: 'active_builtin',
        source_repo_path: '/tmp/nomos-source',
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
    },
  })),
}));
const {
  registerNomosSource,
  listRegisteredNomosSources,
  showRegisteredNomosSource,
  syncRegisteredNomosSource,
  installProjectNomosFromRegisteredSource,
} = vi.hoisted(() => ({
  registerNomosSource: vi.fn(async () => ({
    schema_version: 1,
    source_id: 'shared/proj-alpha',
    source_kind: 'pack_root',
    source_dir: '/tmp/nomos-source',
    registered_at: '2026-03-25T12:10:00.000Z',
    last_synced_at: null,
    last_sync_status: 'never',
    last_sync_error: null,
    last_catalog_pack_id: null,
    last_imported_source_kind: null,
    last_manifest_path: null,
    entry_path: '/Users/example/.agora/nomos/sources/entries/shared/proj-alpha/source-entry.json',
  })),
  listRegisteredNomosSources: vi.fn(async () => ({
    registry_root: '/Users/example/.agora/nomos/sources',
    total: 1,
    entries: [{
      schema_version: 1,
      source_id: 'shared/proj-alpha',
      source_kind: 'pack_root',
      source_dir: '/tmp/nomos-source',
      registered_at: '2026-03-25T12:10:00.000Z',
      last_synced_at: '2026-03-25T12:15:00.000Z',
      last_sync_status: 'ok',
      last_sync_error: null,
      last_catalog_pack_id: 'project/proj-alpha',
      last_imported_source_kind: 'pack_root',
      last_manifest_path: '/Users/example/.agora/nomos/catalog/packs/project/proj-alpha/catalog-entry.json',
      entry_path: '/Users/example/.agora/nomos/sources/entries/shared/proj-alpha/source-entry.json',
    }],
  })),
  showRegisteredNomosSource: vi.fn(async () => ({
    schema_version: 1,
    source_id: 'shared/proj-alpha',
    source_kind: 'pack_root',
    source_dir: '/tmp/nomos-source',
    registered_at: '2026-03-25T12:10:00.000Z',
    last_synced_at: '2026-03-25T12:15:00.000Z',
    last_sync_status: 'ok',
    last_sync_error: null,
    last_catalog_pack_id: 'project/proj-alpha',
    last_imported_source_kind: 'pack_root',
    last_manifest_path: '/Users/example/.agora/nomos/catalog/packs/project/proj-alpha/catalog-entry.json',
    entry_path: '/Users/example/.agora/nomos/sources/entries/shared/proj-alpha/source-entry.json',
  })),
  syncRegisteredNomosSource: vi.fn(async () => ({
    source: {
      schema_version: 1,
      source_id: 'shared/proj-alpha',
      source_kind: 'pack_root',
      source_dir: '/tmp/nomos-source',
      registered_at: '2026-03-25T12:10:00.000Z',
      last_synced_at: '2026-03-25T12:20:00.000Z',
      last_sync_status: 'ok',
      last_sync_error: null,
      last_catalog_pack_id: 'project/proj-alpha',
      last_imported_source_kind: 'pack_root',
      last_manifest_path: '/Users/example/.agora/nomos/catalog/packs/project/proj-alpha/catalog-entry.json',
      entry_path: '/Users/example/.agora/nomos/sources/entries/shared/proj-alpha/source-entry.json',
    },
    imported: {
      source_dir: '/tmp/nomos-source',
      source_kind: 'pack_root',
      manifest_path: null,
      entry: {
        schema_version: 1,
        pack_id: 'project/proj-alpha',
        published_at: '2026-03-25T12:20:00.000Z',
        source_kind: 'pack_root',
        published_by: null,
        published_note: null,
        source_project_id: 'external',
        source_target: 'draft',
        source_activation_status: 'active_builtin',
        source_repo_path: '/tmp/nomos-source',
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
    },
  })),
  installProjectNomosFromRegisteredSource: vi.fn(async () => ({
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
      published_at: '2026-03-25T12:20:00.000Z',
      source_kind: 'pack_root',
      published_by: null,
      published_note: null,
      source_project_id: 'external',
      source_target: 'draft',
      source_activation_status: 'active_builtin',
      source_repo_path: '/tmp/nomos-source',
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
    source: {
      schema_version: 1,
      source_id: 'shared/proj-alpha',
      source_kind: 'pack_root',
      source_dir: '/tmp/nomos-source',
      registered_at: '2026-03-25T12:10:00.000Z',
      last_synced_at: '2026-03-25T12:20:00.000Z',
      last_sync_status: 'ok',
      last_sync_error: null,
      last_catalog_pack_id: 'project/proj-alpha',
      last_imported_source_kind: 'pack_root',
      last_manifest_path: '/Users/example/.agora/nomos/catalog/packs/project/proj-alpha/catalog-entry.json',
      entry_path: '/Users/example/.agora/nomos/sources/entries/shared/proj-alpha/source-entry.json',
    },
    imported: {
      source_dir: '/tmp/nomos-source',
      source_kind: 'pack_root',
      manifest_path: null,
      entry: {
        schema_version: 1,
        pack_id: 'project/proj-alpha',
        published_at: '2026-03-25T12:20:00.000Z',
        source_kind: 'pack_root',
        published_by: null,
        published_note: null,
        source_project_id: 'external',
        source_target: 'draft',
        source_activation_status: 'active_builtin',
        source_repo_path: '/tmp/nomos-source',
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
    },
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
      source_kind: 'project_publish',
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
      source_kind: 'project_publish',
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
    source_kind: 'project_publish',
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
      source_kind: 'project_publish',
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
const { getWorkspaceBootstrapStatus } = vi.hoisted(() => ({
  getWorkspaceBootstrapStatus: vi.fn(async () => ({
    runtime_ready: false,
    runtime_readiness_reason: 'discord_bot_binding_required',
    bootstrap_task_id: null,
    bootstrap_task_title: null,
    bootstrap_task_state: null,
    bootstrap_completed: false,
  })),
}));
const { getProjectWorkbench } = vi.hoisted(() => ({
  getProjectWorkbench: vi.fn(async (projectId: string) => PROJECT_WORKBENCH_DTOS[projectId as keyof typeof PROJECT_WORKBENCH_DTOS]),
}));
const { listRuntimeTargets } = vi.hoisted(() => ({
  listRuntimeTargets: vi.fn(async () => ([
    {
      runtimeTargetRef: 'cc-connect:agora-codex',
      inventoryKind: 'runtime_target' as const,
      runtimeProvider: 'cc-connect',
      runtimeFlavor: 'codex',
      hostFramework: 'cc-connect',
      primaryModel: 'gpt-5.4',
      workspaceDir: '/repo/agora',
      channelProviders: ['discord'],
      inventorySources: ['cc-connect'],
      discordBotUserIds: [],
      enabled: true,
      displayName: 'Agora Codex',
      tags: ['coding'],
      allowedProjects: [],
      defaultRoles: ['developer'],
      presentationMode: 'headless' as const,
      presentationProvider: null,
      presentationIdentityRef: null,
      metadata: null,
      discovered: true,
    },
    {
      runtimeTargetRef: 'cc-connect:agora-claude',
      inventoryKind: 'runtime_target' as const,
      runtimeProvider: 'cc-connect',
      runtimeFlavor: 'claude-code',
      hostFramework: 'cc-connect',
      primaryModel: 'claude-sonnet-4.5',
      workspaceDir: '/repo/agora',
      channelProviders: ['discord'],
      inventorySources: ['cc-connect'],
      discordBotUserIds: ['1234567890'],
      enabled: true,
      displayName: 'Agora Claude',
      tags: ['review'],
      allowedProjects: ['proj-alpha'],
      defaultRoles: ['reviewer'],
      presentationMode: 'im_presented' as const,
      presentationProvider: 'discord',
      presentationIdentityRef: '1234567890',
      metadata: null,
      discovered: true,
    },
  ])),
}));
const { getProjectRuntimePolicy } = vi.hoisted(() => ({
  getProjectRuntimePolicy: vi.fn(async () => ({
    projectId: 'proj-alpha',
    runtimePolicy: {
      runtimeTargets: {
        flavors: {
          codex: 'cc-connect:agora-codex',
          'claude-code': 'cc-connect:agora-claude',
        },
        defaultCoding: 'cc-connect:agora-codex',
        defaultReview: 'cc-connect:agora-claude',
      },
      roleRuntimePolicy: {
        reviewer: {
          preferredFlavor: 'claude-code',
        },
      },
    },
  })),
}));
const updateProjectRuntimePolicy = vi.hoisted(() => vi.fn(async (_projectId: string, input: {
  runtimeTargets?: {
    flavors?: Record<string, string>;
    default?: string;
    defaultCoding?: string;
    defaultReview?: string;
  } | null;
  roleRuntimePolicy?: Record<string, { preferredFlavor?: string | null }>;
}) => ({
  projectId: 'proj-alpha',
  runtimePolicy: {
    runtimeTargets: input.runtimeTargets ?? null,
    roleRuntimePolicy: input.roleRuntimePolicy ?? {},
  },
})));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    getWorkspaceBootstrapStatus,
    getProjectWorkbench,
    listRuntimeTargets,
    getProjectRuntimePolicy,
    updateProjectRuntimePolicy,
    installProjectNomos,
    runProjectNomosDoctor,
    reviewProjectNomos,
    activateProjectNomos,
    validateProjectNomos,
    diffProjectNomos,
    exportProjectNomos,
    importNomosSource,
    registerNomosSource,
    listRegisteredNomosSources,
    showRegisteredNomosSource,
    syncRegisteredNomosSource,
    installProjectNomosPack,
    installProjectNomosFromSource,
    installProjectNomosFromRegisteredSource,
    publishProjectNomosToCatalog,
    listPublishedNomosCatalog,
    showPublishedNomosCatalog,
    installCatalogNomosPack,
  };
});
const updateTodo = vi.fn(async () => undefined);
const deleteTodo = vi.fn(async () => undefined);
const promoteTodo = vi.fn(async () => ({ task: { id: 'OC-401' } }));

Object.assign(projectStoreState, {
  projects: [
    PROJECT_ALPHA,
    PROJECT_BETA,
    PROJECT_GAMMA,
  ],
  selectedProjectId: 'proj-alpha',
  projectMembershipsByProject: {
    'proj-alpha': [
      {
        id: 'pm-1',
        projectId: 'proj-alpha',
        accountId: 11,
        role: 'admin',
        status: 'active',
        addedByAccountId: null,
        createdAt: '2026-03-24T00:00:00.000Z',
        updatedAt: '2026-03-24T00:00:00.000Z',
      },
      {
        id: 'pm-2',
        projectId: 'proj-alpha',
        accountId: 12,
        role: 'member',
        status: 'active',
        addedByAccountId: 11,
        createdAt: '2026-03-24T00:00:00.000Z',
        updatedAt: '2026-03-24T00:00:00.000Z',
      },
    ],
  },
  selectedProject: PROJECT_DETAILS['proj-alpha'],
  loading: false,
  detailLoading: false,
  error: null,
  fetchProjects,
  fetchProjectMembers,
  createProject,
  selectProject: fetchProjectDetail,
  clearError: vi.fn(),
});

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
  async function renderProjectDetailPage() {
    render(
      <MemoryRouter initialEntries={['/projects/proj-alpha']}>
        <Routes>
          <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: 'Project Alpha' });
  }

  async function renderProjectKnowledgePage() {
    render(
      <MemoryRouter initialEntries={['/projects/proj-alpha/knowledge']}>
        <Routes>
          <Route path="/projects/:projectId/knowledge" element={<ProjectKnowledgePage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByTestId('project-knowledge-page-panel');
  }

  async function renderProjectArchivePage() {
    render(
      <MemoryRouter initialEntries={['/projects/proj-alpha/archive']}>
        <Routes>
          <Route path="/projects/:projectId/archive" element={<ProjectArchiveWorkspacePage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByTestId('project-archive-page-panel');
  }

  async function renderProjectOperatorPage() {
    render(
      <MemoryRouter initialEntries={['/projects/proj-alpha/operator']}>
        <Routes>
          <Route path="/projects/:projectId/operator" element={<ProjectOperatorPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByTestId('project-nomos-panel');
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    projectStoreState.selectedProjectId = 'proj-alpha';
    projectStoreState.selectedProject = PROJECT_DETAILS['proj-alpha'];
    await setLocale('en-US');
  });

  it('renders the projects list page with a workspace bootstrap entry point', async () => {
    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Projects' })).toBeInTheDocument();
    expect(screen.getByText('Project Alpha')).toBeInTheDocument();
    expect(screen.getAllByText('Beta Delivery').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Create Project' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Open workspace bootstrap' })).toBeInTheDocument();
  });

  it('renders a persistent project preview pane and restores the remembered selection', async () => {
    localStorage.setItem(PROJECTS_PAGE_SELECTION_KEY, 'proj-beta');

    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(fetchProjectDetail).toHaveBeenCalledWith('proj-beta');
    });

    const previewPane = screen.getByTestId('projects-preview-pane');

    expect(screen.getAllByText('Beta Delivery').length).toBeGreaterThan(0);
    expect(within(previewPane).getByText('Delivery slice for customer rollout')).toBeInTheDocument();
    expect(within(previewPane).getByText('Current Work Brief')).toBeInTheDocument();
    expect(within(previewPane).getByText('Project Surfaces Brief')).toBeInTheDocument();
    expect(within(previewPane).getByRole('link', { name: 'Open Project Workspace' })).toHaveAttribute('href', '/projects/proj-beta');
    expect(within(previewPane).getByRole('link', { name: 'Open Context' })).toHaveAttribute('href', '/projects/proj-beta/context');
  });

  it('filters and reorders the project pool without navigating away from the page', async () => {
    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>,
    );

    const listPanel = screen.getByTestId('projects-list-panel');

    fireEvent.change(screen.getByLabelText('Search Projects'), {
      target: { value: 'beta' },
    });

    expect(within(listPanel).getByText('Beta Delivery')).toBeInTheDocument();
    expect(within(listPanel).queryByText('Gamma Research')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Sort Projects'), {
      target: { value: 'tasks' },
    });

    const projectOptions = screen.getAllByRole('button', { name: /Select project /i });
    expect(projectOptions[0]).toHaveTextContent('Beta Delivery');

    fireEvent.click(screen.getByRole('button', { name: 'Select project Beta Delivery' }));

    await waitFor(() => {
      expect(fetchProjectDetail).toHaveBeenCalledWith('proj-beta');
    });

    const previewPane = screen.getByTestId('projects-preview-pane');
    expect(within(previewPane).getAllByText('6 tasks').length).toBeGreaterThan(0);
    expect(within(previewPane).getAllByText('3 pending todos').length).toBeGreaterThan(0);
  });

  it('prefetches project pool stats without requiring manual selection', async () => {
    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>,
    );

    const listPanel = screen.getByTestId('projects-list-panel');

    await waitFor(() => {
      expect(getProjectWorkbench).toHaveBeenCalledWith('proj-beta');
      expect(getProjectWorkbench).toHaveBeenCalledWith('proj-gamma');
    });

    await waitFor(() => {
      expect(within(listPanel).getByText('6 tasks')).toBeInTheDocument();
      expect(within(listPanel).getByText('3 pending todos')).toBeInTheDocument();
      expect(within(listPanel).getByText('1 tasks')).toBeInTheDocument();
    });
  });

  it('renders the workspace bootstrap page with runtime readiness guidance', async () => {
    render(
      <MemoryRouter initialEntries={['/workspace/bootstrap']}>
        <Routes>
          <Route path="/workspace/bootstrap" element={<WorkspaceBootstrapPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Workspace bootstrap' })).toBeInTheDocument();
    expect(screen.getByText('Runtime readiness')).toBeInTheDocument();
    expect(screen.getByText('Discord is the default first-phase IM. Finish the bot setup before the workspace interview starts.')).toBeInTheDocument();
    expect(screen.getByText('Create a Discord bot in the Discord developer portal.')).toBeInTheDocument();
    expect(screen.getByText(/discord_bot_binding_required/)).toBeInTheDocument();
  });

  it('creates a project without exposing a manual project id input', async () => {
    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Create Project' }));
    const createPanel = screen.getByTestId('projects-create-panel');
    expect(screen.queryByText('Project ID')).not.toBeInTheDocument();
    expect(within(createPanel).getByText('Default Nomos')).toBeInTheDocument();
    expect(within(createPanel).getByText('Nomos: agora/default')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Project Name'), { target: { value: 'Project Beta' } });
    fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'New project' } });
    fireEvent.change(screen.getByLabelText('Project Admin Account IDs'), { target: { value: '11,12' } });
    fireEvent.change(screen.getByLabelText('Project Member Account IDs'), { target: { value: '12,13' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Project Creation' }));

    await waitFor(() => {
      expect(createProject).toHaveBeenCalledWith({
        name: 'Project Beta',
        owner: 'archon',
        summary: 'New project',
        nomos_id: 'agora/default',
        admins: [{ account_id: 11 }, { account_id: 12 }],
        members: [{ account_id: 13, role: 'member' }],
      });
    });
  });

  it('renders the project detail shell as an overview entry', async () => {
    await renderProjectDetailPage();

    expect(screen.getByRole('heading', { name: 'Project Alpha' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Project overview' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Project surfaces' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Current work' })).toBeInTheDocument();
    expect(fetchProjectDetail).toHaveBeenCalledWith('proj-alpha');
    expect(screen.getByText('Project Alpha Timeline')).toBeInTheDocument();
    expect(screen.getAllByText('Active Tasks').length).toBeGreaterThan(0);
    expect(screen.getByText('Waiting Review')).toBeInTheDocument();
    expect(screen.getAllByText('Pending Todos').length).toBeGreaterThan(0);
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.getByText('Waiting review')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('#11 · admin')).toBeInTheDocument();
    expect(screen.getByText('#12 · member')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Bootstrap flow' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review handoff' })).toBeInTheDocument();
    expect(screen.getByText('补 Project 入口')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Knowledge' })).toHaveAttribute('href', '/projects/proj-alpha/knowledge');
    expect(screen.getByRole('link', { name: 'Archive' })).toHaveAttribute('href', '/projects/proj-alpha/archive');
    expect(screen.getByRole('link', { name: 'Operator' })).toHaveAttribute('href', '/projects/proj-alpha/operator');
    expect(screen.getByRole('link', { name: 'Create Task In Project' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create Todo In Project' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Project Context' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Runtime policy' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review Draft' })).not.toBeInTheDocument();
    expect(screen.queryByText('/repo/proj-alpha')).not.toBeInTheDocument();
  });

  it('updates project runtime policy through the dashboard panel', async () => {
    await renderProjectDetailPage();

    fireEvent.change(screen.getByLabelText('Default Coding Target'), {
      target: { value: 'cc-connect:agora-codex' },
    });
    fireEvent.change(screen.getByLabelText('Default Review Target'), {
      target: { value: 'cc-connect:agora-claude' },
    });
    fireEvent.change(screen.getByLabelText('Flavor codex'), {
      target: { value: 'cc-connect:agora-codex' },
    });
    fireEvent.change(screen.getByLabelText('Flavor claude-code'), {
      target: { value: 'cc-connect:agora-claude' },
    });
    fireEvent.change(screen.getByLabelText('Role reviewer preferred flavor'), {
      target: { value: 'claude-code' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Runtime Policy' }));

    await waitFor(() => {
      expect(updateProjectRuntimePolicy).toHaveBeenCalledWith('proj-alpha', {
        runtimeTargets: {
          flavors: {
            codex: 'cc-connect:agora-codex',
            'claude-code': 'cc-connect:agora-claude',
          },
          defaultCoding: 'cc-connect:agora-codex',
          defaultReview: 'cc-connect:agora-claude',
        },
        roleRuntimePolicy: {
          reviewer: {
            preferredFlavor: 'claude-code',
          },
        },
      });
    });
  });

  it('runs project nomos management actions', async () => {
    await renderProjectOperatorPage();
    fireEvent.click(screen.getByRole('button', { name: 'Show operator tools' }));
    expect(screen.getByText('Alpha Architect')).toBeInTheDocument();
    expect(screen.getByText('Think in systems.')).toBeInTheDocument();
    expect(screen.getByText('openclaw')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reinstall Nomos' }));
    await waitFor(() => {
      expect(installProjectNomos).toHaveBeenCalledWith('proj-alpha', {
        skip_bootstrap_task: true,
      });
    });
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
  });

  it('runs nomos catalog and source import actions', async () => {
    await renderProjectOperatorPage();
    fireEvent.click(screen.getByRole('button', { name: 'Show operator tools' }));

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
    fireEvent.change(screen.getByLabelText('Source Dir'), { target: { value: '/tmp/nomos-source' } });
    fireEvent.click(screen.getByRole('button', { name: 'Import Source' }));
    await waitFor(() => {
      expect(importNomosSource).toHaveBeenCalledWith('/tmp/nomos-source');
    });
    const sourcePanel = screen.getByTestId('project-nomos-source-panel');
    expect(sourcePanel).toBeInTheDocument();
    expect(within(sourcePanel).getAllByText(/Source Kind:\s*pack_root/).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('Source Id'), { target: { value: 'shared/proj-alpha' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register Source' }));
    await waitFor(() => {
      expect(registerNomosSource).toHaveBeenCalledWith('shared/proj-alpha', '/tmp/nomos-source');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh Sources' }));
    await waitFor(() => {
      expect(listRegisteredNomosSources).toHaveBeenCalledWith();
    });
    expect(screen.getByTestId('project-nomos-registered-sources-panel')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show Source Entry' }));
    await waitFor(() => {
      expect(showRegisteredNomosSource).toHaveBeenCalledWith('shared/proj-alpha');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sync Registered Source' }));
    await waitFor(() => {
      expect(syncRegisteredNomosSource).toHaveBeenCalledWith('shared/proj-alpha');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Install From Registered Source' }));
    await waitFor(() => {
      expect(installProjectNomosFromRegisteredSource).toHaveBeenCalledWith('proj-alpha', 'shared/proj-alpha');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Install From Source' }));
    await waitFor(() => {
      expect(installProjectNomosFromSource).toHaveBeenCalledWith('proj-alpha', '/tmp/nomos-source');
    });
  });

  it('renders project knowledge and archive drill-downs on the new shell routes', async () => {
    await renderProjectKnowledgePage();

    expect(screen.getByText('Runtime Boundary')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open knowledge Runtime Boundary' }));
    const knowledgeDialog = screen.getByRole('dialog', { name: 'PROJECT KNOWLEDGE' });
    expect(knowledgeDialog).toBeInTheDocument();
    expect(within(knowledgeDialog).getByText('OC-100')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /关闭|Close/ })[1]);

    cleanup();
    await renderProjectArchivePage();

    fireEvent.click(screen.getByRole('button', { name: 'Open recap Bootstrap recap' }));
    expect(screen.getByRole('dialog', { name: 'PROJECT RECAP' })).toBeInTheDocument();
    expect(screen.getByText('Task recap line.')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /关闭|Close/ })[1]);
  });

  it('renders operator citizen drill-downs and preserves overview todo filters', async () => {
    await renderProjectOperatorPage();
    fireEvent.click(screen.getByRole('button', { name: 'Show operator tools' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open citizen Alpha Architect' }));
    const citizenDialog = screen.getByRole('dialog', { name: 'CITIZEN PREVIEW' });
    expect(citizenDialog).toBeInTheDocument();
    expect(within(citizenDialog).getByText('acpx-agent-delegate, planning-with-files')).toBeInTheDocument();
    expect(within(citizenDialog).getByText(/human_gate/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /关闭|Close/ })[1]);

    cleanup();
    await renderProjectDetailPage();
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

  it('keeps operator controls collapsed until explicitly expanded', async () => {
    await renderProjectOperatorPage();

    expect(screen.queryAllByText('/Users/example/.agora/projects/proj-alpha')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Refresh Catalog' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show operator tools' }));

    expect(screen.getAllByText('/Users/example/.agora/projects/proj-alpha').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Hide operator tools' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh Catalog' })).toBeInTheDocument();
  });
});
