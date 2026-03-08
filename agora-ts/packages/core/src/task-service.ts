import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CreateTaskRequestDto, TaskStatusDto, WorkflowDto } from '@agora-ts/contracts';
import {
  FlowLogRepository,
  ProgressLogRepository,
  SubtaskRepository,
  TaskRepository,
  type AgoraDatabase,
  type StoredTask,
} from '@agora-ts/db';
import { PermissionDeniedError, NotFoundError } from './errors.js';
import { TaskState } from './enums.js';
import { StateMachine } from './state-machine.js';

type TaskTemplate = {
  name: string;
  defaultWorkflow?: string;
  defaultTeam?: Record<
    string,
    {
      model_preference?: string;
      suggested?: string[];
    }
  >;
  stages?: WorkflowDto['stages'];
};

export interface TaskServiceOptions {
  templatesDir?: string;
  taskIdGenerator?: () => string;
}

export interface AdvanceTaskOptions {
  callerId: string;
}

function defaultTemplatesDir() {
  return fileURLToPath(new URL('../../../../agora/templates', import.meta.url));
}

function defaultTaskIdGenerator() {
  return `OC-${Date.now()}`;
}

export class TaskService {
  private readonly taskRepository: TaskRepository;
  private readonly flowLogRepository: FlowLogRepository;
  private readonly progressLogRepository: ProgressLogRepository;
  private readonly subtaskRepository: SubtaskRepository;
  private readonly stateMachine: StateMachine;
  private readonly templatesDir: string;
  private readonly taskIdGenerator: () => string;

  constructor(
    private readonly db: AgoraDatabase,
    options: TaskServiceOptions = {},
  ) {
    this.taskRepository = new TaskRepository(db);
    this.flowLogRepository = new FlowLogRepository(db);
    this.progressLogRepository = new ProgressLogRepository(db);
    this.subtaskRepository = new SubtaskRepository(db);
    this.stateMachine = new StateMachine();
    this.templatesDir = options.templatesDir ?? defaultTemplatesDir();
    this.taskIdGenerator = options.taskIdGenerator ?? defaultTaskIdGenerator;
  }

  createTask(input: CreateTaskRequestDto): StoredTask {
    const template = this.loadTemplate(input.type);
    const workflow = this.buildWorkflow(template);
    const team = this.buildTeam(template);
    const taskId = this.taskIdGenerator();

    const draft = this.taskRepository.insertTask({
      id: taskId,
      title: input.title,
      description: input.description,
      type: input.type,
      priority: input.priority,
      creator: input.creator,
      team,
      workflow,
    });

    const created = this.taskRepository.updateTask(taskId, draft.version, {
      state: TaskState.CREATED,
    });

    this.flowLogRepository.insertFlowLog({
      task_id: taskId,
      kind: 'flow',
      event: 'state_changed',
      from_state: TaskState.DRAFT,
      to_state: TaskState.CREATED,
      detail: { template: template.name, task_type: input.type },
      actor: 'system',
    });

    const firstStageId = workflow.stages?.[0]?.id ?? null;
    const active = this.taskRepository.updateTask(taskId, created.version, {
      state: TaskState.ACTIVE,
      current_stage: firstStageId,
    });

    this.flowLogRepository.insertFlowLog({
      task_id: taskId,
      kind: 'flow',
      event: 'state_changed',
      stage_id: firstStageId,
      from_state: TaskState.CREATED,
      to_state: TaskState.ACTIVE,
      actor: 'system',
    });
    if (firstStageId) {
      this.enterStage(taskId, firstStageId);
      this.progressLogRepository.insertProgressLog({
        task_id: taskId,
        kind: 'progress',
        stage_id: firstStageId,
        content: `Entered stage ${firstStageId}`,
        artifacts: { stage_id: firstStageId },
        actor: 'system',
      });
    }

    return active;
  }

  getTask(taskId: string): StoredTask | null {
    return this.taskRepository.getTask(taskId);
  }

  listTasks(state?: string): StoredTask[] {
    return this.taskRepository.listTasks(state);
  }

  getTaskStatus(taskId: string): TaskStatusDto {
    const task = this.getTaskOrThrow(taskId);
    return {
      task,
      flow_log: this.flowLogRepository.listByTask(taskId),
      progress_log: this.progressLogRepository.listByTask(taskId),
      subtasks: this.subtaskRepository.listByTask(taskId),
    };
  }

  advanceTask(taskId: string, options: AdvanceTaskOptions): StoredTask {
    const task = this.getTaskOrThrow(taskId);
    if (task.state !== TaskState.ACTIVE) {
      throw new Error(`Task ${taskId} is in state '${task.state}', expected 'active'`);
    }
    if (!task.current_stage) {
      throw new Error(`Task ${taskId} has no current_stage set`);
    }

    const currentStage = this.stateMachine.getCurrentStage(task.workflow, task.current_stage);
    if (!this.stateMachine.checkGate(this.db, task, currentStage, options.callerId)) {
      throw new PermissionDeniedError(
        `Gate check failed for stage '${task.current_stage}' (gate type: ${currentStage.gate?.type ?? 'command'})`,
      );
    }

    const advance = this.stateMachine.advance(task.workflow, task.current_stage);
    this.exitStage(taskId, advance.currentStage.id, 'advance');

    if (advance.completesTask) {
      const done = this.taskRepository.updateTask(taskId, task.version, {
        state: TaskState.DONE,
      });
      this.flowLogRepository.insertFlowLog({
        task_id: taskId,
        kind: 'flow',
        event: 'state_changed',
        stage_id: advance.currentStage.id,
        from_state: TaskState.ACTIVE,
        to_state: TaskState.DONE,
        actor: options.callerId,
      });
      return done;
    }

    const nextStage = advance.nextStage;
    const updated = this.taskRepository.updateTask(taskId, task.version, {
      current_stage: nextStage?.id ?? null,
    });
    if (nextStage) {
      this.enterStage(taskId, nextStage.id);
    }
    this.flowLogRepository.insertFlowLog({
      task_id: taskId,
      kind: 'flow',
      event: 'stage_advanced',
      stage_id: nextStage?.id ?? null,
      detail: {
        from_stage: advance.currentStage.id,
        to_stage: nextStage?.id ?? 'done',
      },
      actor: options.callerId,
    });
    if (nextStage) {
      this.progressLogRepository.insertProgressLog({
        task_id: taskId,
        kind: 'progress',
        stage_id: nextStage.id,
        content: `Advanced to stage ${nextStage.id}`,
        artifacts: { from_stage: advance.currentStage.id, to_stage: nextStage.id },
        actor: options.callerId,
      });
    }
    return updated;
  }

  private buildWorkflow(template: TaskTemplate): WorkflowDto {
    return {
      type: template.defaultWorkflow ?? 'linear',
      stages: template.stages ?? [],
    };
  }

  private buildTeam(template: TaskTemplate): StoredTask['team'] {
    const members = Object.entries(template.defaultTeam ?? {}).map(([role, config]) => ({
      role,
      agentId: config.suggested?.[0] ?? role,
      model_preference: config.model_preference ?? '',
    }));
    return { members };
  }

  private loadTemplate(taskType: string): TaskTemplate {
    const path = resolve(this.templatesDir, 'tasks', `${taskType}.json`);
    if (!existsSync(path)) {
      throw new NotFoundError(`Template not found: ${path}`);
    }
    return JSON.parse(readFileSync(path, 'utf8')) as TaskTemplate;
  }

  private getTaskOrThrow(taskId: string): StoredTask {
    const task = this.taskRepository.getTask(taskId);
    if (!task) {
      throw new NotFoundError(`Task ${taskId} not found`);
    }
    return task;
  }

  private enterStage(taskId: string, stageId: string) {
    this.db.prepare(`
      INSERT INTO stage_history (task_id, stage_id)
      VALUES (?, ?)
    `).run(taskId, stageId);
  }

  private exitStage(taskId: string, stageId: string, reason: string) {
    this.db.prepare(`
      UPDATE stage_history
      SET exited_at = datetime('now'), exit_reason = ?
      WHERE id = (
        SELECT id
        FROM stage_history
        WHERE task_id = ? AND stage_id = ? AND exited_at IS NULL
        ORDER BY id DESC
        LIMIT 1
      )
    `).run(reason, taskId, stageId);
  }
}
