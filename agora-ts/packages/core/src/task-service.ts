import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  CraftsmanCallbackRequestDto,
  CraftsmanDispatchRequestDto,
  CreateTaskRequestDto,
  PromoteTodoRequestDto,
  TaskStatusDto,
  WorkflowDto,
} from '@agora-ts/contracts';
import {
  ArchiveJobRepository,
  CraftsmanExecutionRepository,
  FlowLogRepository,
  ProgressLogRepository,
  SubtaskRepository,
  TaskContextBindingRepository,
  TaskConversationRepository,
  TaskRepository,
  TodoRepository,
  type AgoraDatabase,
  type StoredTask,
} from '@agora-ts/db';
import { PermissionDeniedError, NotFoundError } from './errors.js';
import { CraftsmanCallbackService } from './craftsman-callback-service.js';
import type { CraftsmanDispatcher } from './craftsman-dispatcher.js';
import { GateService } from './gate-service.js';
import { TaskState } from './enums.js';
import { PermissionService } from './permission-service.js';
import { StateMachine } from './state-machine.js';
import type { IMProvisioningPort } from './im-ports.js';
import type { TaskContextBindingService } from './task-context-binding-service.js';
import type { TaskParticipationService } from './task-participation-service.js';

const TERMINAL_SUBTASK_STATES = new Set(['done', 'failed']);
const TERMINAL_EXECUTION_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);

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
  allowAgents?: Record<string, { canCall: string[]; canAdvance: boolean }>;
  craftsmanDispatcher?: CraftsmanDispatcher;
  isCraftsmanSessionAlive?: (sessionId: string) => boolean;
  imProvisioningPort?: IMProvisioningPort;
  taskContextBindingService?: TaskContextBindingService;
  taskParticipationService?: TaskParticipationService;
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
  action?: 'retry' | 'skip' | 'reassign';
  assignee?: string;
  craftsman_type?: string;
}

export interface StartupRecoveryScanResult {
  scanned_tasks: number;
  blocked_tasks: number;
  failed_subtasks: number;
  failed_executions: number;
}

function defaultTemplatesDir() {
  return fileURLToPath(new URL('../../../templates', import.meta.url));
}

function defaultTaskIdGenerator() {
  return `OC-${Date.now()}`;
}

export class TaskService {
  private readonly taskRepository: TaskRepository;
  private readonly flowLogRepository: FlowLogRepository;
  private readonly progressLogRepository: ProgressLogRepository;
  private readonly subtaskRepository: SubtaskRepository;
  private readonly taskContextBindingRepository: TaskContextBindingRepository;
  private readonly taskConversationRepository: TaskConversationRepository;
  private readonly todoRepository: TodoRepository;
  private readonly archiveJobRepository: ArchiveJobRepository;
  private readonly stateMachine: StateMachine;
  private readonly permissions: PermissionService;
  private readonly gateService: GateService;
  private readonly craftsmanCallbacks: CraftsmanCallbackService;
  private readonly craftsmanExecutions: CraftsmanExecutionRepository;
  private readonly craftsmanDispatcher: CraftsmanDispatcher | undefined;
  private readonly isCraftsmanSessionAlive: ((sessionId: string) => boolean) | undefined;
  private readonly templatesDir: string;
  private readonly taskIdGenerator: () => string;
  private readonly imProvisioningPort: IMProvisioningPort | undefined;
  private readonly taskContextBindingService: TaskContextBindingService | undefined;
  private readonly taskParticipationService: TaskParticipationService | undefined;

  constructor(
    private readonly db: AgoraDatabase,
    options: TaskServiceOptions = {},
  ) {
    this.taskRepository = new TaskRepository(db);
    this.flowLogRepository = new FlowLogRepository(db);
    this.progressLogRepository = new ProgressLogRepository(db);
    this.subtaskRepository = new SubtaskRepository(db);
    this.taskContextBindingRepository = new TaskContextBindingRepository(db);
    this.taskConversationRepository = new TaskConversationRepository(db);
    this.todoRepository = new TodoRepository(db);
    this.archiveJobRepository = new ArchiveJobRepository(db);
    this.craftsmanExecutions = new CraftsmanExecutionRepository(db);
    this.stateMachine = new StateMachine();
    this.permissions = options.archonUsers
      ? new PermissionService({ archonUsers: options.archonUsers, allowAgents: options.allowAgents })
      : new PermissionService({ allowAgents: options.allowAgents });
    this.gateService = new GateService(db, this.permissions);
    this.craftsmanCallbacks = new CraftsmanCallbackService(db);
    this.craftsmanDispatcher = options.craftsmanDispatcher;
    this.isCraftsmanSessionAlive = options.isCraftsmanSessionAlive;
    this.templatesDir = options.templatesDir ?? defaultTemplatesDir();
    this.taskIdGenerator = options.taskIdGenerator ?? defaultTaskIdGenerator;
    this.imProvisioningPort = options.imProvisioningPort;
    this.taskContextBindingService = options.taskContextBindingService;
    this.taskParticipationService = options.taskParticipationService;
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

    this.taskParticipationService?.seedParticipants(taskId, team);

    // Fire-and-forget: provision IM thread (non-blocking, failure doesn't block task creation)
    if (this.imProvisioningPort && this.taskContextBindingService) {
      const bindingService = this.taskContextBindingService;
      const provisioningPort = this.imProvisioningPort;
      void provisioningPort.provisionThread(taskId, input.title).then((provisioned) => {
        const binding = bindingService.createBinding({
          task_id: taskId,
          im_provider: provisioned.im_provider,
          ...(provisioned.conversation_ref ? { conversation_ref: provisioned.conversation_ref } : {}),
          ...(provisioned.thread_ref ? { thread_ref: provisioned.thread_ref } : {}),
          ...(provisioned.message_root_ref ? { message_root_ref: provisioned.message_root_ref } : {}),
        });
        this.taskParticipationService?.attachContextBinding(taskId, binding.id);
      }).catch((err: unknown) => {
        console.error(`[TaskService] IM provisioning failed for task ${taskId}:`, err);
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
      task: task as TaskStatusDto['task'],
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

    return this.advanceSatisfiedStage(task, options.callerId);
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
    this.mirrorConversationEntry(taskId, {
      actor: options.approverId,
      body: options.comment ? `Approval passed: ${options.comment}` : 'Approval passed',
      metadata: {
        event: 'gate_passed',
        gate_type: 'approval',
      },
    });
    return this.advanceSatisfiedStage(task, options.approverId);
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
    this.mirrorConversationEntry(taskId, {
      actor: options.rejectorId,
      body: `Approval rejected: ${options.reason}`,
      metadata: {
        event: 'gate_failed',
        gate_type: 'approval',
      },
    });
    const rewound = this.rewindRejectedStage(task, stage.id, 'rejected', options.rejectorId, options.reason);
    this.flowLogRepository.insertFlowLog({
      task_id: taskId,
      kind: 'flow',
      event: 'rejected',
      stage_id: stage.id,
      detail: {
        reason: options.reason,
        ...(rewound ? { reject_target: rewound.current_stage } : {}),
      },
      actor: options.rejectorId,
    });
    return rewound;
  }

  archonApproveTask(taskId: string, options: ArchonDecisionOptions): StoredTask {
    const task = this.getTaskOrThrow(taskId);
    const stage = this.getCurrentStageOrThrow(task);
    this.gateService.routeGateCommand(task, stage, 'archon-approve', options.reviewerId);
    this.gateService.recordArchonReview(taskId, stage.id, 'approved', options.reviewerId, options.comment ?? '');
    this.flowLogRepository.insertFlowLog({
      task_id: taskId,
      kind: 'flow',
      event: 'gate_passed',
      stage_id: stage.id,
      detail: { gate_type: 'archon_review', passed: true, comment: options.comment ?? '' },
      actor: options.reviewerId,
    });
    this.flowLogRepository.insertFlowLog({
      task_id: taskId,
      kind: 'archon',
      event: 'archon_approved',
      stage_id: stage.id,
      detail: { decision: 'approved', comment: options.comment ?? '' },
      actor: options.reviewerId,
    });
    this.mirrorConversationEntry(taskId, {
      actor: options.reviewerId,
      body: options.comment ? `Archon approved: ${options.comment}` : 'Archon approved',
      metadata: {
        event: 'archon_approved',
      },
    });
    return this.advanceSatisfiedStage(task, options.reviewerId);
  }

  archonRejectTask(taskId: string, options: ArchonDecisionOptions): StoredTask {
    const task = this.getTaskOrThrow(taskId);
    const stage = this.getCurrentStageOrThrow(task);
    this.gateService.routeGateCommand(task, stage, 'archon-reject', options.reviewerId);
    this.gateService.recordArchonReview(taskId, stage.id, 'rejected', options.reviewerId, options.reason ?? '');
    this.flowLogRepository.insertFlowLog({
      task_id: taskId,
      kind: 'flow',
      event: 'gate_failed',
      stage_id: stage.id,
      detail: { gate_type: 'archon_review', passed: false, reason: options.reason ?? '' },
      actor: options.reviewerId,
    });
    const rewound = this.rewindRejectedStage(task, stage.id, 'archon_rejected', options.reviewerId, options.reason ?? '');
    this.flowLogRepository.insertFlowLog({
      task_id: taskId,
      kind: 'archon',
      event: 'archon_rejected',
      stage_id: stage.id,
      detail: {
        decision: 'rejected',
        reason: options.reason ?? '',
        ...(rewound ? { reject_target: rewound.current_stage } : {}),
      },
      actor: options.reviewerId,
    });
    this.mirrorConversationEntry(taskId, {
      actor: options.reviewerId,
      body: options.reason ? `Archon rejected: ${options.reason}` : 'Archon rejected',
      metadata: {
        event: 'archon_rejected',
      },
    });
    return rewound;
  }

  private advanceSatisfiedStage(task: StoredTask, actor: string): StoredTask {
    if (task.state !== TaskState.ACTIVE) {
      throw new Error(`Task ${task.id} is in state '${task.state}', expected 'active'`);
    }
    if (!task.current_stage) {
      throw new Error(`Task ${task.id} has no current_stage set`);
    }
    const advance = this.stateMachine.advance(task.workflow, task.current_stage);
    this.exitStage(task.id, advance.currentStage.id, 'advance');

    if (advance.completesTask) {
      const done = this.taskRepository.updateTask(task.id, task.version, {
        state: TaskState.DONE,
      });
      this.ensureArchiveJobForTask(task.id);
      this.flowLogRepository.insertFlowLog({
        task_id: task.id,
        kind: 'flow',
        event: 'state_changed',
        stage_id: advance.currentStage.id,
        from_state: TaskState.ACTIVE,
        to_state: TaskState.DONE,
        actor,
      });
      this.mirrorConversationEntry(task.id, {
        actor,
        body: 'Task completed',
        metadata: {
          event: 'state_changed',
          from_state: TaskState.ACTIVE,
          to_state: TaskState.DONE,
        },
      });
      return done;
    }

    const nextStage = advance.nextStage;
    const updated = this.taskRepository.updateTask(task.id, task.version, {
      current_stage: nextStage?.id ?? null,
    });
    if (nextStage) {
      this.enterStage(task.id, nextStage.id);
    }
    this.flowLogRepository.insertFlowLog({
      task_id: task.id,
      kind: 'flow',
      event: 'stage_advanced',
      stage_id: nextStage?.id ?? null,
      detail: {
        from_stage: advance.currentStage.id,
        to_stage: nextStage?.id ?? 'done',
      },
      actor,
    });
    if (nextStage) {
      this.progressLogRepository.insertProgressLog({
        task_id: task.id,
        kind: 'progress',
        stage_id: nextStage.id,
        content: `Advanced to stage ${nextStage.id}`,
        artifacts: { from_stage: advance.currentStage.id, to_stage: nextStage.id },
        actor,
      });
      this.mirrorConversationEntry(task.id, {
        actor,
        body: `Advanced to stage ${nextStage.id}`,
        metadata: {
          event: 'stage_advanced',
          from_stage: advance.currentStage.id,
          to_stage: nextStage.id,
        },
      });
    }
    return updated;
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
    this.mirrorConversationEntry(taskId, {
      actor: options.callerId,
      body: `Subtask ${options.subtaskId} marked done`,
      metadata: {
        event: 'subtask_done',
        subtask_id: options.subtaskId,
      },
    });
    return task;
  }

  handleCraftsmanCallback(input: CraftsmanCallbackRequestDto) {
    return this.craftsmanCallbacks.handleCallback(input);
  }

  dispatchCraftsman(input: CraftsmanDispatchRequestDto) {
    if (!this.craftsmanDispatcher) {
      throw new Error('Craftsman dispatcher is not configured');
    }
    const task = this.getTaskOrThrow(input.task_id);
    if (task.state !== TaskState.ACTIVE) {
      throw new Error(`Task ${input.task_id} is in state '${task.state}', expected 'active'`);
    }
    const subtask = this.subtaskRepository.listByTask(input.task_id).find((item) => item.id === input.subtask_id);
    if (!subtask) {
      throw new NotFoundError(`Subtask ${input.subtask_id} not found in task ${input.task_id}`);
    }
    return this.craftsmanDispatcher.dispatchSubtask({
      task_id: input.task_id,
      stage_id: subtask.stage_id,
      subtask_id: input.subtask_id,
      adapter: input.adapter,
      mode: input.mode,
      workdir: input.workdir ?? subtask.craftsman_workdir,
      prompt: subtask.craftsman_prompt,
      brief_path: input.brief_path ?? null,
    });
  }

  getCraftsmanExecution(executionId: string) {
    const execution = this.craftsmanExecutions.getExecution(executionId);
    if (!execution) {
      throw new NotFoundError(`Craftsman execution ${executionId} not found`);
    }
    return execution;
  }

  listCraftsmanExecutions(taskId: string, subtaskId: string) {
    return this.craftsmanExecutions.listBySubtask(taskId, subtaskId);
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
      this.ensureArchiveJobForTask(taskId);
      this.flowLogRepository.insertFlowLog({
        task_id: taskId,
        kind: 'flow',
        event: 'state_changed',
        stage_id: advance.currentStage.id,
        from_state: TaskState.ACTIVE,
        to_state: TaskState.DONE,
        actor: 'archon',
      });
      this.mirrorConversationEntry(taskId, {
        actor: 'archon',
        body: 'Force advanced task to done',
        metadata: {
          event: 'force_advance',
          to_state: TaskState.DONE,
        },
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
      this.mirrorConversationEntry(taskId, {
        actor: 'archon',
        body: `Force advanced to stage ${nextStage.id}`,
        metadata: {
          event: 'force_advance',
          to_stage: nextStage.id,
        },
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
    this.mirrorConversationEntry(taskId, {
      actor: options.voterId,
      body: `Quorum vote ${options.vote} (${quorum.approved}/${quorum.total})`,
      metadata: {
        event: 'quorum_vote',
        vote: options.vote,
        approved: quorum.approved,
        total: quorum.total,
      },
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
    const schedulerSnapshot = this.buildSchedulerSnapshot(task, options.reason);
    const errorDetail = newState === TaskState.ACTIVE ? null : (options.reason ?? task.error_detail);
    const actionEvent = this.getStateActionEvent(task.state as TaskState, newState as TaskState);

    this.db.exec('BEGIN');
    try {
      const actionDetail = this.applyStateTransitionSideEffects(task, newState as TaskState, options);
      const updated = this.taskRepository.updateTask(taskId, task.version, {
        state: newState,
        scheduler_snapshot: schedulerSnapshot,
        error_detail: errorDetail,
      });

      if (newState === TaskState.CANCELLED) {
        this.cancelOpenWork(taskId, options.reason);
      }
      if (newState === TaskState.DONE) {
        this.ensureArchiveJobForTask(taskId);
      }

      this.flowLogRepository.insertFlowLog({
        task_id: taskId,
        kind: 'flow',
        event: 'state_changed',
        stage_id: task.current_stage,
        from_state: task.state,
        to_state: newState,
        detail: this.buildStateChangeDetail(options, actionDetail),
        actor: 'system',
      });
      if (actionEvent) {
        this.flowLogRepository.insertFlowLog({
          task_id: taskId,
          kind: 'flow',
          event: actionEvent,
          stage_id: task.current_stage,
          from_state: task.state,
          to_state: newState,
          detail: this.buildStateChangeDetail(options, actionDetail),
          actor: 'system',
        });
      }
      if (task.state === TaskState.PAUSED && newState === TaskState.ACTIVE) {
        this.craftsmanCallbacks.resumeDeferredCallbacks(taskId);
        this.failMissingCraftsmanSessionsOnResume(taskId);
      }
      this.db.exec('COMMIT');
      return updated;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  promoteTodo(todoId: number, options: PromoteTodoRequestDto) {
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
      this.db.exec('BEGIN');
      try {
        this.db.prepare('DELETE FROM craftsman_executions WHERE task_id = ?').run(orphanedTaskId);
        this.db.prepare('DELETE FROM subtasks WHERE task_id = ?').run(orphanedTaskId);
        this.db.prepare('DELETE FROM flow_log WHERE task_id = ?').run(orphanedTaskId);
        this.db.prepare('DELETE FROM progress_log WHERE task_id = ?').run(orphanedTaskId);
        this.db.prepare('DELETE FROM stage_history WHERE task_id = ?').run(orphanedTaskId);
        this.db.prepare('DELETE FROM archon_reviews WHERE task_id = ?').run(orphanedTaskId);
        this.db.prepare('DELETE FROM approvals WHERE task_id = ?').run(orphanedTaskId);
        this.db.prepare('DELETE FROM quorum_votes WHERE task_id = ?').run(orphanedTaskId);
        this.db.prepare('DELETE FROM tasks WHERE id = ?').run(orphanedTaskId);
        this.db.exec('COMMIT');
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }
      count += 1;
    }
    return count;
  }

  startupRecoveryScan(): StartupRecoveryScanResult {
    const result: StartupRecoveryScanResult = {
      scanned_tasks: 0,
      blocked_tasks: 0,
      failed_subtasks: 0,
      failed_executions: 0,
    };

    for (const task of this.taskRepository.listTasks(TaskState.ACTIVE)) {
      result.scanned_tasks += 1;
      const schedulerSnapshot = this.buildSchedulerSnapshot(task, 'startup_recovery_scan');

      this.db.exec('BEGIN');
      try {
        const impacts = this.failMissingCraftsmanSessions(task.id, {
          event: 'craftsman_session_missing_on_startup',
          messagePrefix: 'Craftsman session not alive on startup recovery',
        });

        if (impacts.length === 0) {
          this.db.exec('COMMIT');
          continue;
        }

        const reason = 'startup recovery blocked task after missing craftsmen sessions';
        this.taskRepository.updateTask(task.id, task.version, {
          state: TaskState.BLOCKED,
          error_detail: reason,
          scheduler_snapshot: schedulerSnapshot,
        });
        this.flowLogRepository.insertFlowLog({
          task_id: task.id,
          kind: 'flow',
          event: 'state_changed',
          stage_id: task.current_stage,
          from_state: task.state,
          to_state: TaskState.BLOCKED,
          detail: {
            reason,
            recovered_subtasks: impacts.map((impact) => impact.subtask_id),
          },
          actor: 'system',
        });
        this.flowLogRepository.insertFlowLog({
          task_id: task.id,
          kind: 'flow',
          event: 'blocked',
          stage_id: task.current_stage,
          from_state: task.state,
          to_state: TaskState.BLOCKED,
          detail: {
            reason,
            recovered_subtasks: impacts.map((impact) => impact.subtask_id),
          },
          actor: 'system',
        });
        this.db.exec('COMMIT');

        result.blocked_tasks += 1;
        result.failed_subtasks += impacts.length;
        result.failed_executions += impacts.reduce((sum, impact) => sum + impact.execution_ids.length, 0);
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }
    }

    return result;
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

  private rewindRejectedStage(
    task: StoredTask,
    currentStageId: string,
    decisionEvent: 'rejected' | 'archon_rejected',
    actor: string,
    reason: string,
  ): StoredTask {
    const rejectStage = this.stateMachine.getRejectStage(task.workflow, currentStageId);
    if (!rejectStage) {
      return task;
    }

    this.exitStage(task.id, currentStageId, decisionEvent);
    const updated = this.taskRepository.updateTask(task.id, task.version, {
      current_stage: rejectStage.id,
    });
    this.enterStage(task.id, rejectStage.id);
    this.flowLogRepository.insertFlowLog({
      task_id: task.id,
      kind: 'flow',
      event: 'stage_rewound',
      stage_id: rejectStage.id,
      detail: {
        from_stage: currentStageId,
        to_stage: rejectStage.id,
        reason,
        decision_event: decisionEvent,
      },
      actor,
    });
    this.progressLogRepository.insertProgressLog({
      task_id: task.id,
      kind: 'progress',
      stage_id: rejectStage.id,
      content: `Rewound to stage ${rejectStage.id} after ${decisionEvent}`,
      artifacts: {
        from_stage: currentStageId,
        to_stage: rejectStage.id,
        reason,
      },
      actor,
    });
    return updated;
  }

  private getApproverRole(stage: NonNullable<StoredTask['workflow']['stages']>[number]) {
    const raw = stage.gate?.approver_role ?? stage.gate?.approver;
    return typeof raw === 'string' && raw.length > 0 ? raw : 'reviewer';
  }

  private buildSchedulerSnapshot(task: StoredTask, reason: string) {
    const pendingSubtasks = this.subtaskRepository
      .listByTask(task.id)
      .filter((subtask) => !TERMINAL_SUBTASK_STATES.has(subtask.status))
      .map((subtask) => ({
        id: subtask.id,
        stage_id: subtask.stage_id,
        status: subtask.status,
        dispatch_status: subtask.dispatch_status,
      }));

    const inflightExecutions = pendingSubtasks.flatMap((subtask) => this.craftsmanExecutions
      .listBySubtask(task.id, subtask.id)
      .filter((execution) => !TERMINAL_EXECUTION_STATUSES.has(execution.status))
      .map((execution) => ({
        execution_id: execution.execution_id,
        subtask_id: execution.subtask_id,
        status: execution.status,
        adapter: execution.adapter,
      })));

    return {
      captured_at: new Date().toISOString(),
      reason,
      state: task.state,
      current_stage: task.current_stage,
      error_detail: task.error_detail,
      pending_subtasks: pendingSubtasks,
      inflight_executions: inflightExecutions,
    };
  }

  private applyStateTransitionSideEffects(task: StoredTask, newState: TaskState, options: UpdateTaskStateOptions) {
    if (task.state === TaskState.BLOCKED && newState === TaskState.ACTIVE) {
      if (options.action === 'retry') {
        return {
          action: 'retry',
          retried_subtasks: this.retryFailedSubtasks(task),
        };
      }
      if (options.action === 'skip') {
        return {
          action: 'skip',
          skipped_subtasks: this.skipFailedSubtasks(task, options.reason),
        };
      }
      if (options.action === 'reassign') {
        if (!options.assignee) {
          throw new Error('unblock action=reassign requires assignee');
        }
        return {
          action: 'reassign',
          reassigned_subtasks: this.reassignFailedSubtasks(task, options.assignee, options.craftsman_type),
          assignee: options.assignee,
          craftsman_type: options.craftsman_type ?? null,
        };
      }
    }
    return options.action ? { action: options.action } : undefined;
  }

  private failMissingCraftsmanSessionsOnResume(taskId: string) {
    if (!this.isCraftsmanSessionAlive) {
      return;
    }
    this.failMissingCraftsmanSessions(taskId, {
      event: 'craftsman_session_missing_on_resume',
      messagePrefix: 'Craftsman session not alive on resume',
    });
  }

  private isSubtaskRunning(status: string, dispatchStatus: string | null) {
    return status === 'in_progress' || dispatchStatus === 'running';
  }

  private failMissingCraftsmanSessions(
    taskId: string,
    options: { event: string; messagePrefix: string },
  ) {
    if (!this.isCraftsmanSessionAlive) {
      return [] as Array<{ subtask_id: string; execution_ids: string[] }>;
    }

    const now = new Date().toISOString();
    const impacts: Array<{ subtask_id: string; execution_ids: string[] }> = [];
    for (const subtask of this.subtaskRepository.listByTask(taskId)) {
      if (TERMINAL_SUBTASK_STATES.has(subtask.status) || !subtask.craftsman_session) {
        continue;
      }
      if (!this.isSubtaskRunning(subtask.status, subtask.dispatch_status)) {
        continue;
      }
      if (this.isCraftsmanSessionAlive(subtask.craftsman_session)) {
        continue;
      }

      const error = `${options.messagePrefix}: ${subtask.craftsman_session}`;
      const executionIds = this.craftsmanExecutions
        .listBySubtask(taskId, subtask.id)
        .filter((execution) => !TERMINAL_EXECUTION_STATUSES.has(execution.status))
        .map((execution) => {
          this.craftsmanExecutions.updateExecution(execution.execution_id, {
            status: 'failed',
            error,
            finished_at: now,
          });
          return execution.execution_id;
        });

      this.subtaskRepository.updateSubtask(taskId, subtask.id, {
        status: 'failed',
        output: error,
        dispatch_status: 'failed',
        done_at: now,
      });
      this.flowLogRepository.insertFlowLog({
        task_id: taskId,
        kind: 'flow',
        event: options.event,
        stage_id: subtask.stage_id,
        detail: {
          subtask_id: subtask.id,
          session_id: subtask.craftsman_session,
          execution_ids: executionIds,
          reason: error,
        },
        actor: 'system',
      });
      impacts.push({
        subtask_id: subtask.id,
        execution_ids: executionIds,
      });
    }
    return impacts;
  }

  private buildStateChangeDetail(options: UpdateTaskStateOptions, actionDetail?: Record<string, unknown>) {
    const detail: Record<string, unknown> = {};
    if (options.reason) {
      detail.reason = options.reason;
    }
    if (actionDetail) {
      Object.assign(detail, actionDetail);
    }
    return Object.keys(detail).length > 0 ? detail : undefined;
  }

  private cancelOpenWork(taskId: string, reason: string) {
    const message = `Task cancelled: ${reason}`;
    const now = new Date().toISOString();
    const subtasks = this.subtaskRepository.listByTask(taskId);

    for (const subtask of subtasks) {
      if (TERMINAL_SUBTASK_STATES.has(subtask.status)) {
        continue;
      }
      this.subtaskRepository.updateSubtask(taskId, subtask.id, {
        status: 'failed',
        output: message,
        dispatch_status: subtask.dispatch_status && !TERMINAL_EXECUTION_STATUSES.has(subtask.dispatch_status)
          ? 'failed'
          : subtask.dispatch_status,
        done_at: now,
      });
    }

    for (const subtask of subtasks) {
      for (const execution of this.craftsmanExecutions.listBySubtask(taskId, subtask.id)) {
        if (TERMINAL_EXECUTION_STATUSES.has(execution.status)) {
          continue;
        }
        this.craftsmanExecutions.updateExecution(execution.execution_id, {
          status: 'cancelled',
          error: message,
          finished_at: now,
        });
      }
    }
  }

  private retryFailedSubtasks(task: StoredTask) {
    if (!task.current_stage) {
      return [] as string[];
    }

    const retried: string[] = [];
    for (const subtask of this.subtaskRepository.listByTask(task.id)) {
      if (subtask.stage_id !== task.current_stage || subtask.status !== 'failed') {
        continue;
      }
      this.subtaskRepository.updateSubtask(task.id, subtask.id, {
        status: 'not_started',
        output: null,
        craftsman_session: null,
        dispatch_status: null,
        dispatched_at: null,
        done_at: null,
      });
      retried.push(subtask.id);
    }
    return retried;
  }

  private skipFailedSubtasks(task: StoredTask, reason: string) {
    if (!task.current_stage) {
      return [] as string[];
    }

    const skipped: string[] = [];
    const output = reason ? `Skipped by archon: ${reason}` : 'Skipped by archon';
    const now = new Date().toISOString();

    for (const subtask of this.subtaskRepository.listByTask(task.id)) {
      if (subtask.stage_id !== task.current_stage || subtask.status !== 'failed') {
        continue;
      }
      this.subtaskRepository.updateSubtask(task.id, subtask.id, {
        status: 'done',
        output,
        craftsman_session: null,
        dispatch_status: 'skipped',
        done_at: now,
      });
      skipped.push(subtask.id);
    }
    return skipped;
  }

  private reassignFailedSubtasks(task: StoredTask, assignee: string, craftsmanType?: string) {
    if (!task.current_stage) {
      return [] as string[];
    }

    const reassigned: string[] = [];
    for (const subtask of this.subtaskRepository.listByTask(task.id)) {
      if (subtask.stage_id !== task.current_stage || subtask.status !== 'failed') {
        continue;
      }
      this.subtaskRepository.updateSubtask(task.id, subtask.id, {
        status: 'not_started',
        output: null,
        craftsman_type: craftsmanType ?? subtask.craftsman_type,
        craftsman_session: null,
        dispatch_status: null,
        dispatched_at: null,
        done_at: null,
      });
      this.db.prepare(`
        UPDATE subtasks
        SET assignee = ?
        WHERE task_id = ? AND id = ?
      `).run(assignee, task.id, subtask.id);
      reassigned.push(subtask.id);
    }
    return reassigned;
  }

  private ensureArchiveJobForTask(taskId: string) {
    const existing = this.archiveJobRepository.listArchiveJobs({ taskId });
    if (existing.length > 0) {
      return existing[0]!;
    }

    const task = this.getTaskOrThrow(taskId);
    return this.archiveJobRepository.insertArchiveJob({
      task_id: task.id,
      status: 'pending',
      target_path: this.buildArchiveTargetPath(task),
      payload: {
        task_id: task.id,
        title: task.title,
        type: task.type,
        state: task.state,
      },
      writer_agent: 'writer-agent',
    });
  }

  private buildArchiveTargetPath(task: StoredTask) {
    return `ZeYu-AI-Brain/agora/${task.id}-${slugify(task.title)}.md`;
  }

  private getStateActionEvent(fromState: TaskState, toState: TaskState): string | null {
    if (toState === TaskState.PAUSED) {
      return 'paused';
    }
    if (toState === TaskState.BLOCKED) {
      return 'blocked';
    }
    if (toState === TaskState.CANCELLED) {
      return 'cancelled';
    }
    if (toState === TaskState.ACTIVE && fromState === TaskState.PAUSED) {
      return 'resumed';
    }
    if (toState === TaskState.ACTIVE && fromState === TaskState.BLOCKED) {
      return 'unblocked';
    }
    return null;
  }

  private mirrorConversationEntry(taskId: string, input: {
    actor: string | null;
    body: string;
    metadata?: Record<string, unknown>;
    occurredAt?: string;
  }) {
    const binding = this.taskContextBindingRepository.getActiveByTask(taskId);
    if (!binding) {
      return;
    }
    this.taskConversationRepository.insert({
      id: randomUUID(),
      task_id: taskId,
      binding_id: binding.id,
      provider: binding.im_provider,
      direction: 'system',
      author_kind: 'system',
      author_ref: input.actor,
      display_name: input.actor,
      body: input.body,
      body_format: 'plain_text',
      occurred_at: input.occurredAt ?? new Date().toISOString(),
      metadata: input.metadata ?? null,
    });
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

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'task';
}
