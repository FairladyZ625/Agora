import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  CraftsmanCallbackRequestDto,
  CraftsmanDispatchRequestDto,
  CreateTaskRequestDto,
  PromoteTodoRequestDto,
  TaskBlueprintDto,
  TaskStatusDto,
  WorkflowDto,
} from '@agora-ts/contracts';
import {
  ApprovalRequestRepository,
  ArchiveJobRepository,
  CraftsmanExecutionRepository,
  FlowLogRepository,
  ProgressLogRepository,
  SubtaskRepository,
  TaskContextBindingRepository,
  TaskConversationRepository,
  TaskRepository,
  TemplateRepository,
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
import type { IMMessagingPort, IMPublishMessageInput, IMProvisioningPort } from './im-ports.js';
import type { AgentRuntimePort } from './runtime-ports.js';
import type { TaskBrainWorkspacePort } from './task-brain-port.js';
import type { TaskBrainBindingService } from './task-brain-binding-service.js';
import type { TaskContextBindingService } from './task-context-binding-service.js';
import type { TaskParticipationService } from './task-participation-service.js';
import { isInteractiveParticipant, resolveControllerRef } from './team-member-kind.js';

const TERMINAL_SUBTASK_STATES = new Set(['done', 'failed']);
const TERMINAL_EXECUTION_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);

type TaskTemplate = {
  name: string;
  defaultWorkflow?: string;
  defaultTeam?: Record<
    string,
    {
      member_kind?: 'controller' | 'citizen' | 'craftsman';
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
  imMessagingPort?: IMMessagingPort;
  taskBrainWorkspacePort?: TaskBrainWorkspacePort;
  taskBrainBindingService?: TaskBrainBindingService;
  taskContextBindingService?: TaskContextBindingService;
  taskParticipationService?: TaskParticipationService;
  agentRuntimePort?: AgentRuntimePort;
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
  private readonly approvalRequestRepository: ApprovalRequestRepository;
  private readonly stateMachine: StateMachine;
  private readonly permissions: PermissionService;
  private readonly gateService: GateService;
  private readonly craftsmanCallbacks: CraftsmanCallbackService;
  private readonly craftsmanExecutions: CraftsmanExecutionRepository;
  private readonly craftsmanDispatcher: CraftsmanDispatcher | undefined;
  private readonly isCraftsmanSessionAlive: ((sessionId: string) => boolean) | undefined;
  private readonly templateRepository: TemplateRepository;
  private readonly templatesDir: string;
  private readonly taskIdGenerator: () => string;
  private readonly imProvisioningPort: IMProvisioningPort | undefined;
  private readonly imMessagingPort: IMMessagingPort | undefined;
  private readonly taskBrainWorkspacePort: TaskBrainWorkspacePort | undefined;
  private readonly taskBrainBindingService: TaskBrainBindingService | undefined;
  private readonly taskContextBindingService: TaskContextBindingService | undefined;
  private readonly taskParticipationService: TaskParticipationService | undefined;
  private readonly agentRuntimePort: AgentRuntimePort | undefined;

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
    this.approvalRequestRepository = new ApprovalRequestRepository(db);
    this.craftsmanExecutions = new CraftsmanExecutionRepository(db);
    this.templateRepository = new TemplateRepository(db);
    this.stateMachine = new StateMachine();
    this.permissions = options.archonUsers
      ? new PermissionService({ archonUsers: options.archonUsers, allowAgents: options.allowAgents })
      : new PermissionService({ allowAgents: options.allowAgents });
    this.gateService = new GateService(db, this.permissions);
    this.craftsmanCallbacks = new CraftsmanCallbackService(db);
    this.craftsmanDispatcher = options.craftsmanDispatcher;
    this.isCraftsmanSessionAlive = options.isCraftsmanSessionAlive;
    this.templatesDir = options.templatesDir ?? defaultTemplatesDir();
    this.templateRepository.seedFromDir(this.templatesDir);
    this.templateRepository.repairMemberKindsFromDir(this.templatesDir);
    this.templateRepository.repairStageSemanticsFromDir(this.templatesDir);
    this.taskIdGenerator = options.taskIdGenerator ?? defaultTaskIdGenerator;
    this.imProvisioningPort = options.imProvisioningPort;
    this.imMessagingPort = options.imMessagingPort;
    this.taskBrainWorkspacePort = options.taskBrainWorkspacePort;
    this.taskBrainBindingService = options.taskBrainBindingService;
    this.taskContextBindingService = options.taskContextBindingService;
    this.taskParticipationService = options.taskParticipationService;
    this.agentRuntimePort = options.agentRuntimePort;
  }

  createTask(input: CreateTaskRequestDto): StoredTask {
    const template = this.loadTemplate(input.type);
    const workflow = input.workflow_override ?? this.buildWorkflow(template);
    const team = this.enrichTeam(this.resolveRequestedTeam(input, template));
    const taskId = this.taskIdGenerator();
    const firstStageId = workflow.stages?.[0]?.id ?? null;
    let active: StoredTask;
    let brainWorkspaceBinding: ReturnType<NonNullable<TaskBrainWorkspacePort['createWorkspace']>> | null = null;

    this.db.exec('BEGIN');
    try {
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

      active = this.taskRepository.updateTask(taskId, created.version, {
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
      if (this.taskBrainWorkspacePort && this.taskBrainBindingService) {
        brainWorkspaceBinding = this.taskBrainWorkspacePort.createWorkspace(this.buildTaskBrainWorkspaceRequest(active, input.type));
        this.taskBrainBindingService.createBinding({
          task_id: taskId,
          brain_pack_ref: brainWorkspaceBinding.brain_pack_ref,
          brain_task_id: brainWorkspaceBinding.brain_task_id,
          workspace_path: brainWorkspaceBinding.workspace_path,
          metadata: brainWorkspaceBinding.metadata ?? null,
        });
      }

      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      if (brainWorkspaceBinding && this.taskBrainWorkspacePort) {
        try {
          this.taskBrainWorkspacePort.destroyWorkspace(brainWorkspaceBinding);
        } catch {
          // Ignore cleanup errors on rollback; DB remains canonical.
        }
      }
      throw error;
    }

    const imParticipantRefs = this.collectImParticipantRefs(team, input.im_target?.participant_refs);
    const createdTask = active!;
    const brainWorkspace = brainWorkspaceBinding;

    // Fire-and-forget: provision IM thread (non-blocking, failure doesn't block task creation)
    if (this.imProvisioningPort && this.taskContextBindingService) {
      const bindingService = this.taskContextBindingService;
      const provisioningPort = this.imProvisioningPort;
      void provisioningPort.provisionContext({
        task_id: taskId,
        title: input.title,
        target: input.im_target
          ? {
              ...(input.im_target.provider ? { provider: input.im_target.provider } : {}),
              ...(input.im_target.conversation_ref ? { conversation_ref: input.im_target.conversation_ref } : {}),
              ...(input.im_target.thread_ref ? { thread_ref: input.im_target.thread_ref } : {}),
              ...(input.im_target.visibility ? { visibility: input.im_target.visibility } : {}),
              ...(input.im_target.participant_refs ? { participant_refs: input.im_target.participant_refs } : {}),
            }
          : null,
        participant_refs: imParticipantRefs,
      }).then(async (provisioned) => {
        const binding = bindingService.createBinding({
          task_id: taskId,
          im_provider: provisioned.im_provider,
          ...(provisioned.conversation_ref ? { conversation_ref: provisioned.conversation_ref } : {}),
          ...(provisioned.thread_ref ? { thread_ref: provisioned.thread_ref } : {}),
          ...(provisioned.message_root_ref ? { message_root_ref: provisioned.message_root_ref } : {}),
        });
        this.taskParticipationService?.attachContextBinding(taskId, binding.id);
        await Promise.all(imParticipantRefs.map(async (participantRef) => {
          try {
            await provisioningPort.joinParticipant({
              binding_id: binding.id,
              participant_ref: participantRef,
              ...(binding.conversation_ref ? { conversation_ref: binding.conversation_ref } : {}),
              ...(binding.thread_ref ? { thread_ref: binding.thread_ref } : {}),
            });
          } catch (err: unknown) {
            console.error(
              `[TaskService] IM participant join failed for task ${taskId} participant ${participantRef}:`,
              err,
            );
          }
        }));
        const bootstrapMessages = this.buildBootstrapMessages(createdTask, brainWorkspace, imParticipantRefs);
        if (bootstrapMessages.length > 0) {
          await provisioningPort.publishMessages({
            binding_id: binding.id,
            ...(binding.conversation_ref ? { conversation_ref: binding.conversation_ref } : {}),
            ...(binding.thread_ref ? { thread_ref: binding.thread_ref } : {}),
            messages: bootstrapMessages,
          });
        }
      }).catch((err: unknown) => {
        console.error(`[TaskService] IM provisioning failed for task ${taskId}:`, err);
      });
    }

    return createdTask;
  }

  getTask(taskId: string): StoredTask | null {
    const task = this.taskRepository.getTask(taskId);
    return task ? this.withControllerRef(task) : null;
  }

  listTasks(state?: string): StoredTask[] {
    return this.taskRepository.listTasks(state).map((task) => this.withControllerRef(task));
  }

  getTaskStatus(taskId: string): TaskStatusDto {
    const task = this.getTaskOrThrow(taskId);
    return {
      task: this.withControllerRef(task) as TaskStatusDto['task'],
      task_blueprint: this.buildTaskBlueprint(task),
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
      const approvalRequest = this.ensureApprovalRequestForGate(task, currentStage, options.callerId);
      if (approvalRequest) {
        this.publishTaskStatusBroadcast(task, {
          kind: 'gate_waiting',
          bodyLines: [
            `Gate ${approvalRequest.gate_type} is waiting for human decision.`,
            `Approval Request: ${approvalRequest.id}`,
            ...(approvalRequest.summary_path ? [`Summary Path: ${approvalRequest.summary_path}`] : []),
          ],
        });
      }
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
    this.resolvePendingApprovalRequest(taskId, stage.id, 'approved', options.approverId, options.comment);
    const advanced = this.advanceSatisfiedStage(task, options.approverId);
    this.publishGateDecisionBroadcast(advanced, {
      decision: 'approved',
      reviewer: options.approverId,
      comment: options.comment,
      gateType: 'approval',
    });
    return advanced;
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
    this.resolvePendingApprovalRequest(taskId, stage.id, 'rejected', options.rejectorId, options.reason);
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
    this.publishGateDecisionBroadcast(rewound, {
      decision: 'rejected',
      reviewer: options.rejectorId,
      reason: options.reason,
      gateType: 'approval',
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
    this.resolvePendingApprovalRequest(taskId, stage.id, 'approved', options.reviewerId, options.comment ?? '');
    const advanced = this.advanceSatisfiedStage(task, options.reviewerId);
    this.publishGateDecisionBroadcast(advanced, {
      decision: 'approved',
      reviewer: options.reviewerId,
      comment: options.comment ?? '',
      gateType: 'archon_review',
    });
    return advanced;
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
    this.resolvePendingApprovalRequest(taskId, stage.id, 'rejected', options.reviewerId, options.reason ?? '');
    this.publishGateDecisionBroadcast(rewound, {
      decision: 'rejected',
      reviewer: options.reviewerId,
      reason: options.reason ?? '',
      gateType: 'archon_review',
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
      this.refreshTaskBrainWorkspace(done);
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
      this.publishTaskStatusBroadcast(done, {
        kind: 'task_completed',
        bodyLines: ['Task reached done state and has been queued for archive handling.'],
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
    this.refreshTaskBrainWorkspace(updated);
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
      this.publishTaskStatusBroadcast(updated, {
        kind: 'stage_entered',
        bodyLines: [
          `Advanced from ${advance.currentStage.id} to ${nextStage.id}.`,
          ...this.describeGateState(nextStage),
        ],
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
    const result = this.craftsmanCallbacks.handleCallback(input);
    if (result.task.state !== TaskState.PAUSED && (result.subtask.status === 'done' || result.subtask.status === 'failed')) {
      this.sendImmediateCraftsmanNotification(result.task.id, result.execution.execution_id, result.subtask.id);
    }
    return result;
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
    if (task.current_stage !== subtask.stage_id) {
      throw new Error(
        `Craftsman dispatch requires the active stage '${task.current_stage ?? 'null'}' to match subtask stage '${subtask.stage_id}'`,
      );
    }
    const stage = this.getStageByIdOrThrow(task, subtask.stage_id);
    if (!stageAllowsCraftsmanDispatch(stage)) {
      throw new Error(`Stage '${stage.id}' does not allow craftsman dispatch`);
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
      if (newState === TaskState.DONE || newState === TaskState.CANCELLED) {
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
      const conversationBody = this.buildStateConversationBody(task.state as TaskState, newState as TaskState, options);
      if (conversationBody) {
        this.mirrorConversationEntry(taskId, {
          actor: 'system',
          body: conversationBody,
          metadata: {
            event: actionEvent ?? 'state_changed',
            from_state: task.state,
            to_state: newState,
            ...(options.reason ? { reason: options.reason } : {}),
          },
        });
      }
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
      this.refreshTaskBrainWorkspace(updated);
      const broadcast = () => this.publishTaskStateBroadcast(updated, task.state as TaskState, newState as TaskState, options.reason);
      if (task.state === TaskState.PAUSED && newState === TaskState.ACTIVE) {
        this.syncImContextForTaskState(taskId, task.state as TaskState, newState as TaskState, options.reason, broadcast);
      } else {
        broadcast();
        this.syncImContextForTaskState(taskId, task.state as TaskState, newState as TaskState, options.reason);
      }
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
        this.mirrorConversationEntry(task.id, {
          actor: 'system',
          body: `Task blocked: ${reason}`,
          metadata: {
            event: 'blocked',
            from_state: task.state,
            to_state: TaskState.BLOCKED,
            reason,
            recovered_subtasks: impacts.map((impact) => impact.subtask_id),
          },
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

  private buildTaskBlueprint(task: StoredTask): TaskBlueprintDto {
    const stages = task.workflow.stages ?? [];
    const nodes: TaskBlueprintDto['nodes'] = stages.map((stage) => ({
      id: stage.id,
      name: stage.name ?? null,
      mode: stage.mode ?? null,
      execution_kind: resolveStageExecutionKind(stage),
      ...(resolveAllowedActions(stage).length > 0 ? { allowed_actions: resolveAllowedActions(stage) } : {}),
      gate_type: stage.gate?.type ?? null,
    }));

    const edges: TaskBlueprintDto['edges'] = [];
    for (let index = 0; index < stages.length; index += 1) {
      const stage = stages[index]!;
      const nextStageId = stages[index + 1]?.id;
      if (nextStageId) {
        edges.push({
          from: stage.id,
          to: nextStageId,
          kind: 'advance',
        });
      }
      if (stage.reject_target) {
        edges.push({
          from: stage.id,
          to: stage.reject_target,
          kind: 'reject',
        });
      }
    }

    return {
      graph_version: 1,
      entry_nodes: stages[0] ? [stages[0].id] : [],
      controller_ref: resolveControllerRef(task.team.members),
      nodes,
      edges,
      artifact_contracts: stages
        .filter((stage) => stage.mode === 'execute')
        .map((stage) => ({
          node_id: stage.id,
          artifact_type: 'stage_output',
        })),
      role_bindings: task.team.members,
    };
  }

  private buildTeam(template: TaskTemplate): StoredTask['team'] {
    const members = Object.entries(template.defaultTeam ?? {}).map(([role, config]) => ({
      role,
      agentId: config.suggested?.[0] ?? role,
      ...(config.member_kind ? { member_kind: config.member_kind } : {}),
      model_preference: config.model_preference ?? '',
    }));
    return { members };
  }

  private resolveRequestedTeam(input: CreateTaskRequestDto, template: TaskTemplate): StoredTask['team'] {
    return input.team_override ?? this.buildTeam(template);
  }

  private buildTaskBrainWorkspaceRequest(task: StoredTask, templateId: string) {
    return {
      task_id: task.id,
      title: task.title,
      description: task.description ?? '',
      type: task.type,
      priority: task.priority,
      creator: task.creator,
      template_id: templateId,
      state: task.state,
      controller_ref: resolveControllerRef(task.team.members),
      current_stage: task.current_stage,
      workflow_stages: (task.workflow.stages ?? []).map((stage) => ({
        id: stage.id,
        ...(stage.name ? { name: stage.name } : {}),
        ...(stage.mode ? { mode: stage.mode } : {}),
        ...(stage.execution_kind ? { execution_kind: stage.execution_kind } : {}),
        ...(stage.allowed_actions ? { allowed_actions: stage.allowed_actions } : {}),
        ...(stage.gate ? { gate: { ...(stage.gate.type ? { type: stage.gate.type } : {}) } } : {}),
      })),
      team_members: task.team.members.map((member) => ({
        role: member.role,
        agentId: member.agentId,
        ...(member.member_kind ? { member_kind: member.member_kind } : {}),
        model_preference: member.model_preference,
        ...(member.agent_origin ? { agent_origin: member.agent_origin } : {}),
        ...(member.briefing_mode ? { briefing_mode: member.briefing_mode } : {}),
      })),
    } satisfies Parameters<NonNullable<TaskBrainWorkspacePort>['createWorkspace']>[0];
  }

  private refreshTaskBrainWorkspace(task: StoredTask) {
    if (!this.taskBrainWorkspacePort || !this.taskBrainBindingService) {
      return;
    }
    const binding = this.taskBrainBindingService.getActiveBinding(task.id);
    if (!binding) {
      return;
    }
    this.taskBrainWorkspacePort.updateWorkspace({
      brain_pack_ref: binding.brain_pack_ref,
      brain_task_id: binding.brain_task_id,
      workspace_path: binding.workspace_path,
      metadata: binding.metadata,
    }, this.buildTaskBrainWorkspaceRequest(task, task.type));
  }

  private enrichTeam(team: StoredTask['team']): StoredTask['team'] {
    return {
      members: team.members.map((member) => {
        const resolved = this.agentRuntimePort?.resolveAgent(member.agentId);
        const agentOrigin: 'agora_managed' | 'user_managed' = member.agent_origin
          ?? resolved?.agent_origin
          ?? 'user_managed';
        const briefingMode: 'overlay_full' | 'overlay_delta' = member.briefing_mode
          ?? resolved?.briefing_mode
          ?? (agentOrigin === 'agora_managed' ? 'overlay_delta' : 'overlay_full');
        return {
          ...member,
          agent_origin: agentOrigin,
          briefing_mode: briefingMode,
        };
      }),
    };
  }

  private loadTemplate(taskType: string): TaskTemplate {
    const stored = this.templateRepository.getTemplate(taskType);
    if (!stored) {
      throw new NotFoundError(`Template not found: ${taskType}`);
    }
    return stored.template as TaskTemplate;
  }

  private getTaskOrThrow(taskId: string): StoredTask {
    const task = this.taskRepository.getTask(taskId);
    if (!task) {
      throw new NotFoundError(`Task ${taskId} not found`);
    }
    return task;
  }

  private withControllerRef(task: StoredTask): StoredTask & { controller_ref: string | null } {
    return {
      ...task,
      controller_ref: resolveControllerRef(task.team.members),
    };
  }

  private getCurrentStageOrThrow(task: StoredTask) {
    if (!task.current_stage) {
      throw new Error(`Task ${task.id} has no current_stage set`);
    }
    return this.stateMachine.getCurrentStage(task.workflow, task.current_stage);
  }

  private getStageByIdOrThrow(task: StoredTask, stageId: string) {
    const stage = (task.workflow.stages ?? []).find((item) => item.id === stageId);
    if (!stage) {
      throw new Error(`Task ${task.id} is missing workflow stage '${stageId}'`);
    }
    return stage;
  }

  private buildBootstrapMessages(
    task: StoredTask,
    brainWorkspace: ReturnType<NonNullable<TaskBrainWorkspacePort['createWorkspace']>> | null,
    imParticipantRefs: string[],
  ): IMPublishMessageInput[] {
    if (!task.current_stage) {
      return [];
    }
    const stage = this.getStageByIdOrThrow(task, task.current_stage);
    const controllerRef = resolveControllerRef(task.team.members);
    const workspacePath = brainWorkspace?.workspace_path ?? null;
    const messages: IMPublishMessageInput[] = [
      {
        kind: 'bootstrap_root',
        participant_refs: imParticipantRefs,
        body: [
          'Agora task bootstrap',
          `Task: ${task.id} — ${task.title}`,
          `Task Goal: ${task.description?.trim() || task.title}`,
          `Controller: ${controllerRef ?? '-'}`,
          `Current Stage: ${task.current_stage}`,
          `Execution Kind: ${resolveStageExecutionKind(stage) ?? '-'}`,
          `Allowed Actions: ${resolveAllowedActions(stage).join(', ') || '-'}`,
          '',
          'Roster:',
          ...task.team.members.map((member) => (
            `- ${member.agentId} | ${member.role} | ${member.member_kind ?? 'citizen'} | ${member.agent_origin ?? 'user_managed'} | ${member.briefing_mode ?? 'overlay_full'}`
          )),
          '',
          'Read first:',
          `- ${join(homedir(), '.agora', 'skills', 'agora-bootstrap', 'SKILL.md')}`,
          ...(workspacePath
            ? [
                `- ${join(workspacePath, '00-bootstrap.md')}`,
                `- ${join(workspacePath, '01-task-brief.md')}`,
                `- ${join(workspacePath, '02-roster.md')}`,
                `- ${join(workspacePath, '03-stage-state.md')}`,
              ]
            : []),
        ].join('\n'),
      },
    ];

    for (const member of task.team.members.filter(isInteractiveParticipant)) {
      const roleBriefPath = workspacePath ? join(workspacePath, '05-agents', member.agentId, '00-role-brief.md') : null;
      const roleDocPath = workspacePath ? resolve(workspacePath, '..', '..', 'roles', `${member.role}.md`) : null;
      messages.push({
        kind: 'role_brief',
        participant_refs: [member.agentId],
        body: [
          `Role briefing for ${member.agentId}`,
          `Agora Role: ${member.role}`,
          `Member Kind: ${member.member_kind ?? 'citizen'}`,
          `Agent Origin: ${member.agent_origin ?? 'user_managed'}`,
          `Briefing Mode: ${member.briefing_mode ?? 'overlay_full'}`,
          `Controller: ${controllerRef ?? '-'}`,
          `Current Stage: ${task.current_stage}`,
          `Task Goal: ${task.description?.trim() || task.title}`,
          ...(member.briefing_mode !== 'overlay_delta' && roleDocPath ? [`Read role doc: ${roleDocPath}`] : []),
          ...(member.briefing_mode === 'overlay_delta'
            ? ['This agent already carries Agora-managed base role context; use the role brief below as task delta.']
            : ['This agent should load the full Agora role overlay before acting.']),
          ...(roleBriefPath ? [`Read role brief: ${roleBriefPath}`] : []),
        ].join('\n'),
      });
    }

    return messages;
  }

  private publishGateDecisionBroadcast(
    task: StoredTask,
    input: {
      decision: 'approved' | 'rejected';
      reviewer: string;
      gateType: 'approval' | 'archon_review';
      comment?: string;
      reason?: string;
    },
  ) {
    const baseLines = [
      `Gate ${input.decision}: ${input.gateType}`,
      `Reviewer: ${input.reviewer}`,
      ...(input.comment ? [`Comment: ${input.comment}`] : []),
      ...(input.reason ? [`Reason: ${input.reason}`] : []),
    ];
    this.publishTaskStatusBroadcast(task, {
      kind: `gate_${input.decision}`,
      bodyLines: [
        ...baseLines,
        ...(input.decision === 'rejected'
          ? [`Task rewound to ${task.current_stage ?? '-'}. Controller must reorganize work and resubmit.`]
          : [`Task advanced to ${task.current_stage ?? '-'}.`]),
      ],
    });
    const controllerRef = resolveControllerRef(task.team.members);
    if (!controllerRef) {
      return;
    }
    this.publishTaskStatusBroadcast(task, {
      kind: `controller_gate_${input.decision}`,
      participantRefs: [controllerRef],
      bodyLines: input.decision === 'rejected'
        ? [
            `Controller action required for ${task.id}.`,
            `Human rejected the current handoff via ${input.gateType}.`,
            `Reason: ${input.reason ?? '(no reason provided)'}`,
            `Current Stage: ${task.current_stage ?? '-'}`,
            'Re-plan with the roster, address the feedback, and resubmit when ready.',
          ]
        : [
            `Controller update for ${task.id}.`,
            `Human approved the current handoff via ${input.gateType}.`,
            `Current Stage: ${task.current_stage ?? '-'}`,
            'Resume orchestration and drive the next stage.',
          ],
    });
  }

  private ensureApprovalRequestForGate(
    task: StoredTask,
    stage: NonNullable<StoredTask['workflow']['stages']>[number],
    requester: string,
  ) {
    const gateType = stage.gate?.type;
    if (gateType !== 'approval' && gateType !== 'archon_review') {
      return null;
    }
    const existing = this.approvalRequestRepository.getLatestPending(task.id, stage.id);
    if (existing) {
      return existing;
    }
    const brainBinding = this.taskBrainBindingService?.getActiveBinding(task.id) ?? null;
    return this.approvalRequestRepository.insert({
      task_id: task.id,
      stage_id: stage.id,
      gate_type: gateType,
      requested_by: requester,
      summary_path: brainBinding ? join(brainBinding.workspace_path, '00-current.md') : null,
      metadata: {
        controller_ref: resolveControllerRef(task.team.members),
        current_stage: task.current_stage,
      },
    });
  }

  private resolvePendingApprovalRequest(
    taskId: string,
    stageId: string,
    status: 'approved' | 'rejected',
    resolvedBy: string,
    resolutionComment: string,
  ) {
    const pending = this.approvalRequestRepository.getLatestPending(taskId, stageId);
    if (!pending) {
      return null;
    }
    return this.approvalRequestRepository.resolve(pending.id, {
      status,
      resolved_by: resolvedBy,
      resolution_comment: resolutionComment,
      metadata: {
        ...(pending.metadata ?? {}),
        resolution_source: 'task_action',
      },
    });
  }

  private publishTaskStateBroadcast(
    task: StoredTask,
    fromState: TaskState,
    toState: TaskState,
    reason?: string,
  ) {
    const bodyLines: string[] = [];
    if (toState === TaskState.PAUSED) {
      bodyLines.push('Task paused. Thread will be archived and locked.');
    } else if (toState === TaskState.CANCELLED) {
      bodyLines.push('Task cancelled. Thread will be archived and locked until archive finalization.');
    } else if (toState === TaskState.ACTIVE && fromState === TaskState.PAUSED) {
      bodyLines.push('Task resumed. Original thread has been reopened.');
    } else if (toState === TaskState.ACTIVE && fromState === TaskState.BLOCKED) {
      bodyLines.push('Task unblocked and returned to active execution.');
    } else if (toState === TaskState.BLOCKED) {
      bodyLines.push('Task blocked and requires intervention.');
    } else {
      return;
    }
    if (reason) {
      bodyLines.push(`Reason: ${reason}`);
    }
    this.publishTaskStatusBroadcast(task, {
      kind: `task_state_${toState}`,
      bodyLines,
    });
  }

  private publishTaskStatusBroadcast(
    task: StoredTask,
    input: {
      kind: string;
      bodyLines: string[];
      participantRefs?: string[];
    },
  ) {
    if (!this.imProvisioningPort || !this.taskContextBindingService) {
      return;
    }
    const binding = this.taskContextBindingService.getLatestBinding(task.id);
    if (!binding) {
      return;
    }
    const stage = task.current_stage ? this.getStageByIdOrThrow(task, task.current_stage) : null;
    const brainBinding = this.taskBrainBindingService?.getActiveBinding(task.id) ?? null;
    const lines = [
      'Agora status update',
      `Task: ${task.id} — ${task.title}`,
      `Task State: ${task.state}`,
      `Current Stage: ${task.current_stage ?? '-'}`,
      `Execution Kind: ${resolveStageExecutionKind(stage) ?? '-'}`,
      `Allowed Actions: ${resolveAllowedActions(stage).join(', ') || '-'}`,
      `Controller: ${resolveControllerRef(task.team.members) ?? '-'}`,
      ...input.bodyLines,
      ...(brainBinding ? [`Task Workspace: ${brainBinding.workspace_path}`] : []),
      ...(brainBinding ? [`Current Brief: ${join(brainBinding.workspace_path, '00-current.md')}`] : []),
    ];
    void this.imProvisioningPort.publishMessages({
      binding_id: binding.id,
      conversation_ref: binding.conversation_ref,
      thread_ref: binding.thread_ref,
      messages: [{
        kind: input.kind,
        ...(input.participantRefs ? { participant_refs: input.participantRefs } : {}),
        body: lines.join('\n'),
      }],
    }).catch((error: unknown) => {
      console.error(`[TaskService] Task status broadcast failed for task ${task.id}:`, error);
    });
  }

  private sendImmediateCraftsmanNotification(taskId: string, executionId: string, subtaskId: string) {
    if (!this.imMessagingPort) {
      return;
    }
    const binding = this.taskContextBindingRepository.getActiveByTask(taskId);
    const targetRef = binding?.thread_ref ?? binding?.conversation_ref ?? null;
    if (!binding || !targetRef) {
      return;
    }
    const execution = this.craftsmanExecutions.getExecution(executionId);
    const subtask = this.subtaskRepository.listByTask(taskId).find((item) => item.id === subtaskId);
    if (!execution || !subtask) {
      return;
    }
    const eventType = execution.status === 'succeeded' ? 'craftsman_completed' : 'craftsman_failed';
    void this.imMessagingPort.sendNotification(targetRef, {
      task_id: taskId,
      event_type: eventType,
      data: {
        execution_id: execution.execution_id,
        subtask_id: subtask.id,
        adapter: execution.adapter,
        status: execution.status,
        output: subtask.output,
      },
    }).catch((error: unknown) => {
      console.error(`[TaskService] Immediate craftsman notify failed for task ${taskId}:`, error);
    });
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
    this.refreshTaskBrainWorkspace(updated);
    return updated;
  }

  private collectImParticipantRefs(
    team: StoredTask['team'],
    explicitRefs?: string[] | null,
  ): string[] {
    return Array.from(new Set([
      ...team.members.filter(isInteractiveParticipant).map((member) => member.agentId),
      ...(explicitRefs ?? []),
    ]));
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

  private buildStateConversationBody(
    fromState: TaskState,
    toState: TaskState,
    options: UpdateTaskStateOptions,
  ): string | null {
    if (toState === TaskState.PAUSED) {
      return options.reason ? `Task paused: ${options.reason}` : 'Task paused';
    }
    if (toState === TaskState.CANCELLED) {
      return options.reason ? `Task cancelled: ${options.reason}` : 'Task cancelled';
    }
    if (toState === TaskState.BLOCKED) {
      return options.reason ? `Task blocked: ${options.reason}` : 'Task blocked';
    }
    if (toState === TaskState.ACTIVE && fromState === TaskState.PAUSED) {
      return 'Task resumed';
    }
    if (toState === TaskState.ACTIVE && fromState === TaskState.BLOCKED) {
      return options.reason ? `Task unblocked: ${options.reason}` : 'Task unblocked';
    }
    return null;
  }

  private syncImContextForTaskState(
    taskId: string,
    fromState: TaskState,
    toState: TaskState,
    reason?: string,
    onSuccess?: () => void,
  ) {
    if (!this.imProvisioningPort || !this.taskContextBindingService) {
      return;
    }
    const binding = this.taskContextBindingService.getLatestBinding(taskId);
    if (!binding) {
      return;
    }
    const mode = this.resolveImContextModeForStateTransition(fromState, toState);
    if (!mode) {
      return;
    }
    void this.imProvisioningPort.archiveContext({
      binding_id: binding.id,
      conversation_ref: binding.conversation_ref,
      thread_ref: binding.thread_ref,
      mode,
      reason: reason ?? null,
    }).then(() => {
      this.taskContextBindingService?.updateStatus(
        binding.id,
        mode === 'archive' ? 'archived' : mode === 'unarchive' ? 'active' : 'destroyed',
      );
      onSuccess?.();
    }).catch((err: unknown) => {
      console.error(`[TaskService] IM context transition failed for task ${taskId}:`, err);
      this.taskContextBindingService?.updateStatus(binding.id, 'failed');
    });
  }

  private resolveImContextModeForStateTransition(
    fromState: TaskState,
    toState: TaskState,
  ): 'archive' | 'unarchive' | null {
    if (toState === TaskState.PAUSED || toState === TaskState.CANCELLED) {
      return 'archive';
    }
    if (fromState === TaskState.PAUSED && toState === TaskState.ACTIVE) {
      return 'unarchive';
    }
    return null;
  }

  private describeGateState(stage: WorkflowStageLike | null) {
    if (!stage?.gate?.type) {
      return [];
    }
    switch (stage.gate.type) {
      case 'approval':
        return ['Waiting human approval before further progress.'];
      case 'archon_review':
        return ['Waiting Archon review before further progress.'];
      case 'quorum':
        return ['Waiting quorum confirmation before further progress.'];
      default:
        return [`Gate: ${stage.gate.type}`];
    }
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

type WorkflowStageLike = NonNullable<WorkflowDto['stages']>[number];

function resolveStageExecutionKind(stage: WorkflowStageLike | null | undefined) {
  if (!stage) {
    return null;
  }
  if (stage.execution_kind) {
    return stage.execution_kind;
  }
  if (stage.mode === 'execute') {
    return 'citizen_execute';
  }
  if (stage.mode === 'discuss') {
    return 'citizen_discuss';
  }
  return null;
}

function resolveAllowedActions(stage: WorkflowStageLike | null | undefined) {
  if (!stage) {
    return [];
  }
  if (stage.allowed_actions?.length) {
    return stage.allowed_actions;
  }
  switch (resolveStageExecutionKind(stage)) {
    case 'craftsman_dispatch':
      return ['dispatch_craftsman'];
    case 'citizen_execute':
      return ['execute'];
    case 'human_approval':
      return ['approve', 'reject'];
    case 'citizen_discuss':
      return ['discuss'];
    default:
      return [];
  }
}

function stageAllowsCraftsmanDispatch(stage: WorkflowStageLike | null | undefined) {
  if (!stage) {
    return false;
  }
  return resolveStageExecutionKind(stage) === 'craftsman_dispatch'
    || resolveAllowedActions(stage).includes('dispatch_craftsman');
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'task';
}
