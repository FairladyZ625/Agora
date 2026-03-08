import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CreateTaskRequestDto, TaskStatusDto, WorkflowDto } from '@agora-ts/contracts';
import {
  FlowLogRepository,
  ProgressLogRepository,
  SubtaskRepository,
  TaskRepository,
  TodoRepository,
  type AgoraDatabase,
  type StoredTask,
} from '@agora-ts/db';
import { PermissionDeniedError, NotFoundError } from './errors.js';
import { GateService } from './gate-service.js';
import { TaskState } from './enums.js';
import { PermissionService } from './permission-service.js';
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
  archonUsers?: string[];
}

export interface AdvanceTaskOptions {
  callerId: string;
}

export interface ApproveTaskOptions {
  approverId: string;
  comment: string;
}

export interface RejectTaskOptions {
  rejectorId: string;
  reason: string;
}

export interface ArchonDecisionOptions {
  reviewerId: string;
  comment?: string;
  reason?: string;
}

export interface CompleteSubtaskOptions {
  subtaskId: string;
  callerId: string;
  output: string;
}

export interface ForceAdvanceOptions {
  reason: string;
}

export interface ConfirmTaskOptions {
  voterId: string;
  vote: 'approve' | 'reject';
  comment: string;
}

export interface UpdateTaskStateOptions {
  reason: string;
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
  private readonly todoRepository: TodoRepository;
  private readonly stateMachine: StateMachine;
  private readonly permissions: PermissionService;
  private readonly gateService: GateService;
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
    this.todoRepository = new TodoRepository(db);
    this.stateMachine = new StateMachine();
    this.permissions = options.archonUsers
      ? new PermissionService({ archonUsers: options.archonUsers })
      : new PermissionService();
    this.gateService = new GateService(db, this.permissions);
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
    this.gateService.routeGateCommand(task, currentStage, 'advance', options.callerId);
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

  approveTask(taskId: string, options: ApproveTaskOptions): StoredTask {
    const task = this.getTaskOrThrow(taskId);
    const stage = this.getCurrentStageOrThrow(task);
    this.gateService.routeGateCommand(task, stage, 'approve', options.approverId);
    const approverRole = this.getApproverRole(stage);
    this.gateService.recordApproval(taskId, stage.id, approverRole, options.approverId, options.comment);
    this.flowLogRepository.insertFlowLog({
      task_id: taskId,
      kind: 'flow',
      event: 'gate_passed',
      stage_id: stage.id,
      detail: { gate_type: 'approval', passed: true, comment: options.comment },
      actor: options.approverId,
    });
    return task;
  }

  rejectTask(taskId: string, options: RejectTaskOptions): StoredTask {
    const task = this.getTaskOrThrow(taskId);
    const stage = this.getCurrentStageOrThrow(task);
    this.gateService.routeGateCommand(task, stage, 'reject', options.rejectorId);
    this.flowLogRepository.insertFlowLog({
      task_id: taskId,
      kind: 'flow',
      event: 'gate_failed',
      stage_id: stage.id,
      detail: { gate_type: 'approval', passed: false, reason: options.reason },
      actor: options.rejectorId,
    });
    this.flowLogRepository.insertFlowLog({
      task_id: taskId,
      kind: 'flow',
      event: 'rejected',
      stage_id: stage.id,
      detail: { reason: options.reason },
      actor: options.rejectorId,
    });
    return task;
  }

  archonApproveTask(taskId: string, options: ArchonDecisionOptions): StoredTask {
    const task = this.getTaskOrThrow(taskId);
    const stage = this.getCurrentStageOrThrow(task);
    this.gateService.routeGateCommand(task, stage, 'archon-approve', options.reviewerId);
    this.gateService.recordArchonReview(taskId, stage.id, 'approved', options.reviewerId, options.comment ?? '');
    this.flowLogRepository.insertFlowLog({
      task_id: taskId,
      kind: 'archon',
      event: 'archon_approved',
      stage_id: stage.id,
      detail: { decision: 'approved', comment: options.comment ?? '' },
      actor: options.reviewerId,
    });
    return task;
  }

  archonRejectTask(taskId: string, options: ArchonDecisionOptions): StoredTask {
    const task = this.getTaskOrThrow(taskId);
    const stage = this.getCurrentStageOrThrow(task);
    this.gateService.routeGateCommand(task, stage, 'archon-reject', options.reviewerId);
    this.gateService.recordArchonReview(taskId, stage.id, 'rejected', options.reviewerId, options.reason ?? '');
    this.flowLogRepository.insertFlowLog({
      task_id: taskId,
      kind: 'archon',
      event: 'archon_rejected',
      stage_id: stage.id,
      detail: { decision: 'rejected', reason: options.reason ?? '' },
      actor: options.reviewerId,
    });
    return task;
  }

  completeSubtask(taskId: string, options: CompleteSubtaskOptions): StoredTask {
    const task = this.getTaskOrThrow(taskId);
    const subtask = this.subtaskRepository.listByTask(taskId).find((item) => item.id === options.subtaskId);
    if (!subtask) {
      throw new NotFoundError(`Subtask ${options.subtaskId} not found in task ${taskId}`);
    }
    if (!this.permissions.verifySubtaskDone(options.callerId, subtask.assignee)) {
      throw new PermissionDeniedError(`${options.callerId} 无权完成子任务 ${options.subtaskId}（assignee=${subtask.assignee}）`);
    }
    this.subtaskRepository.updateSubtask(taskId, options.subtaskId, {
      status: 'done',
      output: options.output,
      done_at: new Date().toISOString(),
    });
    this.flowLogRepository.insertFlowLog({
      task_id: taskId,
      kind: 'system',
      event: 'subtask_done',
      stage_id: subtask.stage_id,
      detail: { subtask_id: options.subtaskId },
      actor: options.callerId,
    });
    return task;
  }

  forceAdvanceTask(taskId: string, options: ForceAdvanceOptions): StoredTask {
    const task = this.getTaskOrThrow(taskId);
    if (task.state !== TaskState.ACTIVE) {
      throw new Error(`Task ${taskId} is in state '${task.state}', expected 'active'`);
    }
    if (!task.current_stage) {
      throw new Error(`Task ${taskId} has no current_stage set`);
    }
    const advance = this.stateMachine.advance(task.workflow, task.current_stage);
    this.exitStage(taskId, advance.currentStage.id, 'force_advance');
    this.flowLogRepository.insertFlowLog({
      task_id: taskId,
      kind: 'flow',
      event: 'force_advance',
      stage_id: task.current_stage,
      detail: { reason: options.reason },
      actor: 'archon',
    });

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
        actor: 'archon',
      });
      return done;
    }

    const nextStage = advance.nextStage;
    const updated = this.taskRepository.updateTask(taskId, task.version, {
      current_stage: nextStage?.id ?? null,
    });
    if (nextStage) {
      this.enterStage(taskId, nextStage.id);
      this.flowLogRepository.insertFlowLog({
        task_id: taskId,
        kind: 'flow',
        event: 'stage_advanced',
        stage_id: nextStage.id,
        detail: { from_stage: advance.currentStage.id, to_stage: nextStage.id },
        actor: 'archon',
      });
    }
    return updated;
  }

  confirmTask(taskId: string, options: ConfirmTaskOptions): StoredTask & { quorum: { approved: number; total: number } } {
    const task = this.getTaskOrThrow(taskId);
    const stage = this.getCurrentStageOrThrow(task);
    this.gateService.routeGateCommand(task, stage, 'confirm', options.voterId);
    const quorum = this.gateService.recordQuorumVote(taskId, stage.id, options.voterId, options.vote, options.comment);
    this.flowLogRepository.insertFlowLog({
      task_id: taskId,
      kind: 'flow',
      event: 'quorum_vote',
      stage_id: stage.id,
      detail: {
        vote: options.vote,
        approved: quorum.approved,
        total: quorum.total,
      },
      actor: options.voterId,
    });
    return {
      ...task,
      quorum,
    };
  }

  pauseTask(taskId: string, options: UpdateTaskStateOptions): StoredTask {
    return this.updateTaskState(taskId, TaskState.PAUSED, options);
  }

  resumeTask(taskId: string): StoredTask {
    return this.updateTaskState(taskId, TaskState.ACTIVE, { reason: 'resumed' });
  }

  cancelTask(taskId: string, options: UpdateTaskStateOptions): StoredTask {
    return this.updateTaskState(taskId, TaskState.CANCELLED, options);
  }

  unblockTask(taskId: string, options: UpdateTaskStateOptions): StoredTask {
    return this.updateTaskState(taskId, TaskState.ACTIVE, options);
  }

  updateTaskState(taskId: string, newState: string, options: UpdateTaskStateOptions): StoredTask {
    const task = this.getTaskOrThrow(taskId);
    if (!this.stateMachine.validateTransition(task.state as TaskState, newState as TaskState)) {
      throw new Error(`Invalid transition: ${task.state} -> ${newState}`);
    }
    const updated = this.taskRepository.updateTask(taskId, task.version, {
      state: newState,
      error_detail: newState === TaskState.ACTIVE || newState === TaskState.CANCELLED ? null : task.error_detail,
    });
    this.flowLogRepository.insertFlowLog({
      task_id: taskId,
      kind: 'flow',
      event: 'state_changed',
      stage_id: task.current_stage,
      from_state: task.state,
      to_state: newState,
      detail: options.reason ? { reason: options.reason } : undefined,
      actor: 'system',
    });
    return updated;
  }

  promoteTodo(todoId: number, options: { type: string; creator: string; priority: string }) {
    const todo = this.todoRepository.getTodo(todoId);
    if (!todo) {
      throw new NotFoundError(`Todo ${todoId} not found`);
    }
    if (todo.promoted_to) {
      throw new Error(`Todo ${todoId} already promoted to ${todo.promoted_to}`);
    }
    const task = this.createTask({
      title: todo.text,
      type: options.type,
      creator: options.creator,
      description: '',
      priority: options.priority,
    });
    const updatedTodo = this.todoRepository.updateTodo(todoId, {
      promoted_to: task.id,
    });
    return { todo: updatedTodo, task };
  }

  cleanupOrphaned(taskId?: string): number {
    const rows = taskId
      ? (this.db.prepare("SELECT id FROM tasks WHERE id = ? AND state = 'orphaned'").all(taskId) as Array<{ id: string }>)
      : (this.db.prepare("SELECT id FROM tasks WHERE state = 'orphaned'").all() as Array<{ id: string }>);

    let count = 0;
    for (const row of rows) {
      const orphanedTaskId = row.id;
      this.db.prepare('DELETE FROM subtasks WHERE task_id = ?').run(orphanedTaskId);
      this.db.prepare('DELETE FROM flow_log WHERE task_id = ?').run(orphanedTaskId);
      this.db.prepare('DELETE FROM progress_log WHERE task_id = ?').run(orphanedTaskId);
      this.db.prepare('DELETE FROM stage_history WHERE task_id = ?').run(orphanedTaskId);
      this.db.prepare('DELETE FROM archon_reviews WHERE task_id = ?').run(orphanedTaskId);
      this.db.prepare('DELETE FROM approvals WHERE task_id = ?').run(orphanedTaskId);
      this.db.prepare('DELETE FROM quorum_votes WHERE task_id = ?').run(orphanedTaskId);
      this.db.prepare('DELETE FROM tasks WHERE id = ?').run(orphanedTaskId);
      count += 1;
    }
    return count;
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

  private getCurrentStageOrThrow(task: StoredTask) {
    if (!task.current_stage) {
      throw new Error(`Task ${task.id} has no current_stage set`);
    }
    return this.stateMachine.getCurrentStage(task.workflow, task.current_stage);
  }

  private getApproverRole(stage: NonNullable<StoredTask['workflow']['stages']>[number]) {
    const raw = stage.gate?.approver_role ?? stage.gate?.approver;
    return typeof raw === 'string' && raw.length > 0 ? raw : 'reviewer';
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
