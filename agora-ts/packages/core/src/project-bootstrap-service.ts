import type { StoredTask } from '@agora-ts/db';
import type { ProjectService } from './project-service.js';
import type { TaskService } from './task-service.js';

export interface CreateProjectHarnessBootstrapTaskInput {
  project_id: string;
  project_name: string;
  creator?: string | null | undefined;
  repo_path?: string | null | undefined;
  project_state_root?: string | null | undefined;
  nomos_id?: string | null | undefined;
  bootstrap_prompt_path?: string | null | undefined;
  bootstrap_mode?: 'existing_repo' | 'new_repo' | 'no_repo' | null | undefined;
}

export interface ProjectBootstrapServiceOptions {
  projectService: ProjectService;
  taskService: TaskService;
}

export class ProjectBootstrapService {
  private readonly projectService: ProjectService;
  private readonly taskService: TaskService;

  constructor(options: ProjectBootstrapServiceOptions) {
    this.projectService = options.projectService;
    this.taskService = options.taskService;
  }

  createHarnessBootstrapTask(input: CreateProjectHarnessBootstrapTaskInput): StoredTask {
    this.projectService.requireProject(input.project_id);
    this.seedNomosBootstrapScaffolds(input.project_id);

    return this.taskService.createTask({
      title: `Bootstrap Project Harness: ${input.project_name}`,
      type: 'coding',
      creator: input.creator?.trim() || 'archon',
      description: buildHarnessBootstrapDescription(input),
      priority: 'high',
      project_id: input.project_id,
    });
  }

  private seedNomosBootstrapScaffolds(projectId: string) {
    const documents = [
      {
        kind: 'fact' as const,
        slug: 'bootstrap-current-surface',
        title: 'Bootstrap Current Surface',
        summary: 'Capture current repo/workspace reality for the project harness.',
        body: [
          '- Current code or asset surface',
          '- Repo/workspace paths',
          '- Existing tooling or deployment realities',
        ].join('\n'),
      },
      {
        kind: 'decision' as const,
        slug: 'bootstrap-known-constraints',
        title: 'Bootstrap Known Constraints',
        summary: 'Record the constraints and boundaries already known at bootstrap time.',
        body: [
          '- Product or architecture boundaries',
          '- Human approval requirements',
          '- Operational or repo constraints',
        ].join('\n'),
      },
      {
        kind: 'open_question' as const,
        slug: 'bootstrap-open-questions',
        title: 'Bootstrap Open Questions',
        summary: 'Collect unresolved questions that should guide the initial harness interview.',
        body: [
          '- Unknown project goals',
          '- Missing codebase context',
          '- Unclear methodologies or governance expectations',
        ].join('\n'),
      },
    ];

    for (const document of documents) {
      try {
        this.projectService.upsertKnowledgeEntry({
          project_id: projectId,
          kind: document.kind,
          slug: document.slug,
          title: document.title,
          summary: document.summary,
          body: document.body,
        });
      } catch (error) {
        if (!(error instanceof Error) || error.message !== 'Project knowledge port is not configured') {
          throw error;
        }
      }
    }
  }
}

function buildHarnessBootstrapDescription(input: CreateProjectHarnessBootstrapTaskInput) {
  const lines = [
    `Initialize the installed Nomos for project \`${input.project_id}\`.`,
    '',
    'Bootstrap goals:',
    '- Inspect the current project surface before proposing process changes.',
    '- Fill the global project-state harness docs and project brain, not `AGENTS.md`.',
    '- Establish the first project methodologies, constraints, and open questions.',
    '',
    'Write outputs into:',
    '- `brain/`',
    '- `docs/reference/`',
    '- `docs/architecture/`',
    '- `docs/planning/`',
  ];

  if (input.project_state_root) {
    lines.push(`- Global project state root: \`${input.project_state_root}\``);
  }
  if (input.repo_path) {
    lines.push(`- Bound repo path: \`${input.repo_path}\``);
  } else {
    lines.push('- This project may be non-code-first; do not assume a repo exists.');
  }
  if (input.nomos_id) {
    lines.push(`- Installed Nomos: \`${input.nomos_id}\``);
  }
  if (input.bootstrap_prompt_path) {
    lines.push(`- Follow bootstrap methodology from: \`${input.bootstrap_prompt_path}\``);
  }
  if (input.bootstrap_mode) {
    lines.push(`- Bootstrap mode: \`${input.bootstrap_mode}\``);
  }

  lines.push(
    '',
    'Interview checklist:',
    '- What already exists today?',
    '- Where is the code or working surface?',
    '- What constraints are already known?',
    '- What decisions are already fixed?',
    '- What remains unknown and must be tracked as open questions?',
  );

  return lines.join('\n');
}
