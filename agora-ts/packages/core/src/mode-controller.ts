import { SubtaskRepository, type AgoraDatabase } from '@agora-ts/db';
import { ProgressService } from './progress-service.js';

export interface DiscussModeResult {
  mode: 'discuss';
  participants: string[];
  stage_id: string;
}

export interface ExecuteModeSubtaskDefinition {
  id: string;
  title: string;
  assignee: string;
}

export interface ExecuteModeResult {
  mode: 'execute';
  stage_id: string;
  subtasks: ExecuteModeSubtaskDefinition[];
}

export class ModeController {
  private readonly subtasks: SubtaskRepository;
  private readonly progress: ProgressService;

  constructor(db: AgoraDatabase) {
    this.subtasks = new SubtaskRepository(db);
    this.progress = new ProgressService(db);
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
      });
      this.progress.recordSubtaskEvent(taskId, stageId, subtask.id, 'created');
    }
    return {
      mode: 'execute',
      stage_id: stageId,
      subtasks: subtaskDefs,
    };
  }
}
