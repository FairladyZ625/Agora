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
  project_nomos_spec_path?: string | null | undefined;
  project_nomos_draft_root?: string | null | undefined;
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
      title: `Create Project Nomos: ${input.project_name}`,
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
    `Create and refine the project-specific Nomos for project \`${input.project_id}\`.`,
    '',
    'Nomos authoring goals:',
    '- Interview the user before changing methodology or governance defaults.',
    '- Fill the project Nomos authoring spec and refine the seeded draft pack.',
    '- Keep project-specific content in global project state, not in repo-root `AGENTS.md`.',
    '',
    'Primary authoring outputs:',
  ];

  if (input.project_state_root) {
    lines.push(`- Global project state root: \`${input.project_state_root}\``);
  }
  if (input.project_nomos_spec_path) {
    lines.push(`- Project Nomos spec: \`${input.project_nomos_spec_path}\``);
  }
  if (input.project_nomos_draft_root) {
    lines.push(`- Project Nomos draft pack: \`${input.project_nomos_draft_root}\``);
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
    'After interview updates are written into the authoring spec, run:',
    `- \`agora nomos refine-project --project-id ${input.project_id}\``,
    '',
    'Interview checklist:',
    '- What already exists today, and what kind of project is this?',
    '- Which repo/workspace path is the real execution surface?',
    '- Which default methodologies should stay, and which should change?',
    '- Which lifecycle modules, approvals, and doctor rules should this project Nomos enforce?',
    '- What remains unknown and must stay visible in the authoring spec before the Nomos is finalized?',
  );

  return lines.join('\n');
}
