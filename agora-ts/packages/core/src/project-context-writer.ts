import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { IProjectWriteLockRepository, TaskRecord } from '@agora-ts/contracts';
import type { ProjectKnowledgeTaskRecapInput } from './project-knowledge-port.js';
import type {
  TaskBrainCloseRecapRequest,
  TaskBrainHarvestDraftRequest,
  TaskBrainWorkspaceBindingRef,
  TaskBrainWorkspacePort,
} from './task-brain-port.js';
import type { ProjectService } from './project-service.js';
import { resolveControllerRef } from './team-member-kind.js';

type ExecFileLike = (command: string, args: string[], options?: { cwd?: string }) => string;

export interface ProjectContextWriterOptions {
  writeLockRepository: IProjectWriteLockRepository;
  projectService: Pick<ProjectService, 'getProjectStateRoot' | 'recordTaskRecap'>;
  taskBrainWorkspacePort?: TaskBrainWorkspacePort;
  execFile?: ExecFileLike;
}

export interface TaskCloseoutWriteProposal {
  kind: 'task_closeout';
  project_id: string;
  task_id: string;
  canonical_root: string | null;
  lock_holder_task_id: string;
  close_recap: {
    binding: TaskBrainWorkspaceBindingRef;
    input: TaskBrainCloseRecapRequest;
  };
  harvest_draft: {
    binding: TaskBrainWorkspaceBindingRef;
    input: TaskBrainHarvestDraftRequest;
  };
  project_recap: ProjectKnowledgeTaskRecapInput;
}

export class ProjectContextWriter {
  private readonly locks: IProjectWriteLockRepository;
  private readonly execFile: ExecFileLike;

  constructor(
    private readonly options: ProjectContextWriterOptions,
  ) {
    this.locks = options.writeLockRepository;
    this.execFile = options.execFile ?? ((command, args, execOptions) => execFileSync(command, args, {
      cwd: execOptions?.cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim());
  }

  buildTaskCloseoutProposal(input: {
    task: TaskRecord;
    binding: TaskBrainWorkspaceBindingRef;
    actor: string;
    reason?: string;
  }): TaskCloseoutWriteProposal {
    if (!input.task.project_id) {
      throw new Error(`Task ${input.task.id} has no project binding for closeout writeback`);
    }
    const completedAt = new Date().toISOString();
    const controllerRef = resolveControllerRef(input.task.team.members);
    const summaryLines = buildTaskCloseSummary(input.task, input.actor, input.reason);
    const recapInput = {
      task_id: input.task.id,
      project_id: input.task.project_id,
      locale: input.task.locale,
      title: input.task.title,
      state: input.task.state,
      current_stage: input.task.current_stage,
      controller_ref: controllerRef,
      completed_by: input.actor,
      completed_at: completedAt,
      summary_lines: summaryLines,
    } satisfies TaskBrainCloseRecapRequest;

    return {
      kind: 'task_closeout',
      project_id: input.task.project_id,
      task_id: input.task.id,
      canonical_root: this.options.projectService.getProjectStateRoot(input.task.project_id),
      lock_holder_task_id: input.task.id,
      close_recap: {
        binding: input.binding,
        input: recapInput,
      },
      harvest_draft: {
        binding: input.binding,
        input: {
          ...recapInput,
        },
      },
      project_recap: {
        project_id: input.task.project_id,
        task_id: input.task.id,
        title: input.task.title,
        state: input.task.state,
        current_stage: input.task.current_stage,
        controller_ref: controllerRef,
        workspace_path: input.binding.workspace_path,
        completed_by: input.actor,
        completed_at: completedAt,
        summary_lines: summaryLines,
      },
    };
  }

  applyTaskCloseoutProposal(proposal: TaskCloseoutWriteProposal): void {
    const lock = this.locks.acquireLock({
      project_id: proposal.project_id,
      holder_task_id: proposal.lock_holder_task_id,
    });
    if (!lock) {
      throw new Error(`Project context writer lock is already held for ${proposal.project_id}`);
    }
    try {
      if (this.options.taskBrainWorkspacePort) {
        this.options.taskBrainWorkspacePort.writeTaskCloseRecap(
          proposal.close_recap.binding,
          proposal.close_recap.input,
        );
        this.options.taskBrainWorkspacePort.writeTaskHarvestDraft(
          proposal.harvest_draft.binding,
          proposal.harvest_draft.input,
        );
      }
      this.options.projectService.recordTaskRecap(proposal.project_recap);
      this.commitCanonicalRoot(proposal);
    } finally {
      this.locks.releaseLock(proposal.project_id, proposal.lock_holder_task_id);
    }
  }

  getLock(projectId: string) {
    return this.locks.getLock(projectId);
  }

  private commitCanonicalRoot(proposal: TaskCloseoutWriteProposal) {
    if (!proposal.canonical_root || !existsSync(join(proposal.canonical_root, '.git'))) {
      return;
    }
    const status = this.execFile('git', ['status', '--porcelain'], { cwd: proposal.canonical_root });
    if (!status.trim()) {
      return;
    }
    this.execFile('git', ['add', '-A'], { cwd: proposal.canonical_root });
    this.execFile(
      'git',
      [
        '-c', 'user.name=Agora Project Writer',
        '-c', 'user.email=agora-project-writer@local',
        'commit',
        '-m',
        `chore(project-context): apply ${proposal.task_id} closeout`,
      ],
      { cwd: proposal.canonical_root },
    );
  }
}

function buildTaskCloseSummary(task: Pick<TaskRecord, 'locale' | 'current_stage' | 'team'>, actor: string, reason?: string) {
  return [
    task.locale === 'zh-CN'
      ? '任务已到达 done，已进入 archive 流程。'
      : 'Task reached done and has entered archive handling.',
    `${task.locale === 'zh-CN' ? '当前阶段' : 'Current Stage'}: ${task.current_stage ?? '-'}`,
    `${task.locale === 'zh-CN' ? '主控' : 'Controller'}: ${resolveControllerRef(task.team.members) ?? '-'}`,
    `${task.locale === 'zh-CN' ? '完成人' : 'Completed By'}: ${actor}`,
    ...(reason ? [`${task.locale === 'zh-CN' ? '原因' : 'Reason'}: ${reason}`] : []),
  ];
}
