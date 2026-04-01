import type { CraftsmanModeDto, ISubtaskRepository } from '@agora-ts/contracts';
import type { CraftsmanDispatcher } from './craftsman-dispatcher.js';
import type { ProgressService } from './progress-service.js';

export interface DiscussModeResult {
  mode: 'discuss';
  participants: string[];
  stage_id: string;
}

export interface ExecuteModeSubtaskDefinition {
  id: string;
  title: string;
  assignee: string;
  craftsman?: {
    adapter: string;
    mode?: CraftsmanModeDto;
    workdir?: string | null;
    prompt?: string | null;
    brief_path?: string | null;
  };
}

export interface ExecuteModeResult {
  mode: 'execute';
  stage_id: string;
  subtasks: ExecuteModeSubtaskDefinition[];
}

export interface ModeControllerOptions {
  subtaskRepository: ISubtaskRepository;
  progressService: ProgressService;
  dispatcher?: CraftsmanDispatcher;
}

export class ModeController {
  private readonly subtasks: ISubtaskRepository;
  private readonly progress: ProgressService;
  private readonly dispatcher: CraftsmanDispatcher | undefined;

  constructor(options: ModeControllerOptions) {
    this.subtasks = options.subtaskRepository;
    this.progress = options.progressService;
    this.dispatcher = options.dispatcher;
  }

  enterDiscussMode(taskId: string, stageId: string, participants: string[]): DiscussModeResult {
    this.progress.recordStateChange(taskId, stageId, stageId, 'system', {
      mode: 'discuss',
      participants,
    });
    return {
      mode: 'discuss',
      participants,
      stage_id: stageId,
    };
  }

  enterExecuteMode(taskId: string, stageId: string, subtaskDefs: ExecuteModeSubtaskDefinition[]): ExecuteModeResult {
    for (const subtask of subtaskDefs) {
      this.subtasks.insertSubtask({
        id: subtask.id,
        task_id: taskId,
        stage_id: stageId,
        title: subtask.title,
        assignee: subtask.assignee,
        craftsman_type: subtask.craftsman?.adapter ?? null,
      });
      this.progress.recordSubtaskEvent(taskId, stageId, subtask.id, 'created');
      if (this.dispatcher && subtask.craftsman) {
        const dispatched = this.dispatcher.dispatchSubtask({
          task_id: taskId,
          stage_id: stageId,
          subtask_id: subtask.id,
          adapter: subtask.craftsman.adapter,
          mode: subtask.craftsman.mode ?? 'one_shot',
          workdir: subtask.craftsman.workdir ?? null,
          prompt: subtask.craftsman.prompt ?? null,
          brief_path: subtask.craftsman.brief_path ?? null,
        });
        this.progress.recordSubtaskEvent(taskId, stageId, subtask.id, 'dispatched', 'system', {
          execution_id: dispatched.execution.execution_id,
          adapter: dispatched.execution.adapter,
          status: dispatched.execution.status,
        });
      }
    }
    return {
      mode: 'execute',
      stage_id: stageId,
      subtasks: subtaskDefs,
    };
  }
}
