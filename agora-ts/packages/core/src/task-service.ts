import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  CraftsmanCallbackRequestDto,
  CraftsmanDispatchRequestDto,
  CraftsmanInputKeyDto,
  CreateSubtasksRequestDto,
  CreateSubtasksResponseDto,
  CreateTaskRequestDto,
  PromoteTodoRequestDto,
  TaskBlueprintDto,
  TaskLocaleDto,
  TaskStatusDto,
  WorkflowDto,
} from '@agora-ts/contracts';
import { craftsmanExecutionSchema } from '@agora-ts/contracts';
import {
  ApprovalRequestRepository,
  ArchiveJobRepository,
  CraftsmanExecutionRepository,
  FlowLogRepository,
  InboxRepository,
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
import { ModeController } from './mode-controller.js';
import { TaskState } from './enums.js';
import { PermissionService } from './permission-service.js';
import { StateMachine } from './state-machine.js';
import type { IMMessagingPort, IMPublishMessageInput, IMProvisioningPort } from './im-ports.js';
import type { AgentRuntimePort } from './runtime-ports.js';
import type { CraftsmanInputPort } from './craftsman-input-port.js';
import type { CraftsmanExecutionProbePort } from './craftsman-probe-port.js';
import type { HostResourcePort } from './host-resource-port.js';
import type { TaskBrainWorkspacePort } from './task-brain-port.js';
import type { TaskBrainBindingService } from './task-brain-binding-service.js';
import type { TaskContextBindingService } from './task-context-binding-service.js';
import type { TaskParticipationService } from './task-participation-service.js';
import { isInteractiveParticipant, resolveControllerRef } from './team-member-kind.js';

const TERMINAL_SUBTASK_STATES = new Set(['done', 'failed', 'cancelled', 'archived']);
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
  graph?: WorkflowDto['graph'];
};

type CreateTaskInputLike = Omit<CreateTaskRequestDto, 'locale'> & {
  locale?: TaskLocaleDto;
};

type CraftsmanGovernanceLimits = {
  maxConcurrentRunning: number | null;
  maxConcurrentPerAgent: number | null;
  hostMemoryUtilizationLimit: number | null;
  hostSwapUtilizationLimit: number | null;
  hostLoadPerCpuLimit: number | null;
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
  craftsmanInputPort?: CraftsmanInputPort;
  craftsmanExecutionProbePort?: CraftsmanExecutionProbePort;
  hostResourcePort?: HostResourcePort;
  craftsmanGovernance?: {
    maxConcurrentRunning?: number | null;
    maxConcurrentPerAgent?: number | null;
    hostMemoryUtilizationLimit?: number | null;
    hostSwapUtilizationLimit?: number | null;
    hostLoadPerCpuLimit?: number | null;
  };
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

export interface SubtaskLifecycleOptions {
  subtaskId: string;
  callerId: string;
  note: string;
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

export interface InactiveTaskProbeOptions {
  controllerAfterMs: number;
  rosterAfterMs: number;
  inboxAfterMs: number;
  now?: Date;
}

export interface InactiveTaskProbeResult {
  scanned_tasks: number;
  controller_pings: number;
  roster_pings: number;
  inbox_items: number;
}

export interface ObserveCraftsmanExecutionsOptions {
  runningAfterMs: number;
  waitingAfterMs: number;
  now?: Date;
}

export interface ObserveCraftsmanExecutionsResult {
  scanned: number;
  probed: number;
  progressed: number;
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
  private readonly inboxRepository: InboxRepository;
  private readonly stateMachine: StateMachine;
  private readonly permissions: PermissionService;
  private readonly gateService: GateService;
  private readonly craftsmanCallbacks: CraftsmanCallbackService;
  private readonly craftsmanExecutions: CraftsmanExecutionRepository;
  private readonly craftsmanDispatcher: CraftsmanDispatcher | undefined;
  private readonly craftsmanInputPort: CraftsmanInputPort | undefined;
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
  private readonly craftsmanExecutionProbePort: CraftsmanExecutionProbePort | undefined;
  private readonly hostResourcePort: HostResourcePort | undefined;
  private readonly craftsmanGovernance: CraftsmanGovernanceLimits;

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
    this.inboxRepository = new InboxRepository(db);
    this.craftsmanExecutions = new CraftsmanExecutionRepository(db);
    this.templateRepository = new TemplateRepository(db);
    this.stateMachine = new StateMachine();
    this.permissions = options.archonUsers
      ? new PermissionService({ archonUsers: options.archonUsers, allowAgents: options.allowAgents })
      : new PermissionService({ allowAgents: options.allowAgents });
    this.gateService = new GateService(db, this.permissions);
    this.craftsmanCallbacks = new CraftsmanCallbackService(db);
    this.craftsmanDispatcher = options.craftsmanDispatcher;
    this.craftsmanInputPort = options.craftsmanInputPort;
    this.isCraftsmanSessionAlive = options.isCraftsmanSessionAlive;
    this.templatesDir = options.templatesDir ?? defaultTemplatesDir();
    this.templateRepository.seedFromDir(this.templatesDir);
    this.templateRepository.repairMemberKindsFromDir(this.templatesDir);
    this.templateRepository.repairStageSemanticsFromDir(this.templatesDir);
    this.templateRepository.repairGraphsFromDir(this.templatesDir);
    this.taskIdGenerator = options.taskIdGenerator ?? defaultTaskIdGenerator;
    this.imProvisioningPort = options.imProvisioningPort;
    this.imMessagingPort = options.imMessagingPort;
    this.taskBrainWorkspacePort = options.taskBrainWorkspacePort;
    this.taskBrainBindingService = options.taskBrainBindingService;
    this.taskContextBindingService = options.taskContextBindingService;
    this.taskParticipationService = options.taskParticipationService;
    this.agentRuntimePort = options.agentRuntimePort;
    this.craftsmanExecutionProbePort = options.craftsmanExecutionProbePort;
    this.hostResourcePort = options.hostResourcePort;
    this.craftsmanGovernance = {
      maxConcurrentRunning: options.craftsmanGovernance?.maxConcurrentRunning ?? null,
      maxConcurrentPerAgent: options.craftsmanGovernance?.maxConcurrentPerAgent ?? null,
      hostMemoryUtilizationLimit: options.craftsmanGovernance?.hostMemoryUtilizationLimit ?? null,
      hostSwapUtilizationLimit: options.craftsmanGovernance?.hostSwapUtilizationLimit ?? null,
      hostLoadPerCpuLimit: options.craftsmanGovernance?.hostLoadPerCpuLimit ?? null,
    };
  }

  createTask(input: CreateTaskInputLike): StoredTask {
    const template = this.tryLoadTemplate(input.type);
    const workflow = input.workflow_override ?? (template ? this.buildWorkflow(template) : null);
    const requestedTeam = input.team_override ?? (template ? this.buildTeam(template) : null);
    if (!workflow || !requestedTeam) {
      throw new NotFoundError(`Template not found: ${input.type}`);
    }
    const team = this.enrichTeam(requestedTeam);
    const taskId = this.taskIdGenerator();
    const firstStageId = workflow.stages?.[0]?.id ?? null;
    const templateLabel = template?.name ?? input.type;
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
        locale: resolveTaskLocale(input.locale),
        team,
        workflow,
        control: input.control ?? { mode: 'normal' },
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
        detail: { template: templateLabel, task_type: input.type },
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
        this.mirrorProvisioningConversationEntry(taskId, binding, `Task **${taskId}** created: ${input.title}`);
        await Promise.all(imParticipantRefs.map(async (participantRef) => {
          try {
            const result = await provisioningPort.joinParticipant({
              binding_id: binding.id,
              participant_ref: participantRef,
              ...(binding.conversation_ref ? { conversation_ref: binding.conversation_ref } : {}),
              ...(binding.thread_ref ? { thread_ref: binding.thread_ref } : {}),
            });
            if (result.status === 'joined' || result.status === 'ignored') {
              this.markParticipantBindingJoined(taskId, participantRef);
            }
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
          this.mirrorPublishedMessagesToConversation(taskId, binding, bootstrapMessages);
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
    this.reconcileStageExitSubtasks(task.id, advance.currentStage.id, 'archived', 'stage_advanced');
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
          ...this.buildSmokeStageEntryCommands(updated, nextStage),
        ],
      });
    }
    return updated;
  }

  completeSubtask(taskId: string, options: CompleteSubtaskOptions): StoredTask {
    const task = this.getTaskOrThrow(taskId);
    const subtask = this.getSubtaskOrThrow(taskId, options.subtaskId);
    this.assertSubtaskControl(task, subtask, options.callerId);
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

  archiveSubtask(taskId: string, options: SubtaskLifecycleOptions): StoredTask {
    const task = this.getTaskOrThrow(taskId);
    const subtask = this.getSubtaskOrThrow(taskId, options.subtaskId);
    this.assertSubtaskControl(task, subtask, options.callerId);
    if (TERMINAL_SUBTASK_STATES.has(subtask.status)) {
      throw new Error(`Subtask ${options.subtaskId} is already terminal (${subtask.status})`);
    }
    const now = new Date().toISOString();
    this.subtaskRepository.updateSubtask(taskId, options.subtaskId, {
      status: 'archived',
      output: options.note || subtask.output || `Subtask archived by ${options.callerId}`,
      done_at: now,
    });
    this.flowLogRepository.insertFlowLog({
      task_id: taskId,
      kind: 'system',
      event: 'subtask_archived',
      stage_id: subtask.stage_id,
      detail: { subtask_id: options.subtaskId, note: options.note || null },
      actor: options.callerId,
    });
    this.mirrorConversationEntry(taskId, {
      actor: options.callerId,
      body: `Subtask ${options.subtaskId} archived`,
      metadata: {
        event: 'subtask_archived',
        subtask_id: options.subtaskId,
        note: options.note || null,
      },
    });
    this.publishTaskStatusBroadcast(task, {
      kind: 'subtask_archived',
      bodyLines: [
        `Subtask ${options.subtaskId} archived by ${options.callerId}.`,
        ...(options.note ? [`Note: ${options.note}`] : []),
      ],
    });
    return task;
  }

  cancelSubtask(taskId: string, options: SubtaskLifecycleOptions): StoredTask {
    const task = this.getTaskOrThrow(taskId);
    const subtask = this.getSubtaskOrThrow(taskId, options.subtaskId);
    this.assertSubtaskControl(task, subtask, options.callerId);
    if (TERMINAL_SUBTASK_STATES.has(subtask.status)) {
      throw new Error(`Subtask ${options.subtaskId} is already terminal (${subtask.status})`);
    }
    const now = new Date().toISOString();
    const reason = options.note || `Subtask cancelled by ${options.callerId}`;
    this.subtaskRepository.updateSubtask(taskId, options.subtaskId, {
      status: 'cancelled',
      output: reason,
      dispatch_status: subtask.dispatch_status && !TERMINAL_EXECUTION_STATUSES.has(subtask.dispatch_status)
        ? 'failed'
        : subtask.dispatch_status,
      done_at: now,
    });
    for (const execution of this.craftsmanExecutions.listBySubtask(taskId, subtask.id)) {
      if (TERMINAL_EXECUTION_STATUSES.has(execution.status)) {
        continue;
      }
      this.craftsmanExecutions.updateExecution(execution.execution_id, {
        status: 'cancelled',
        error: reason,
        finished_at: now,
      });
    }
    this.flowLogRepository.insertFlowLog({
      task_id: taskId,
      kind: 'system',
      event: 'subtask_cancelled',
      stage_id: subtask.stage_id,
      detail: { subtask_id: options.subtaskId, note: options.note || null },
      actor: options.callerId,
    });
    this.mirrorConversationEntry(taskId, {
      actor: options.callerId,
      body: `Subtask ${options.subtaskId} cancelled`,
      metadata: {
        event: 'subtask_cancelled',
        subtask_id: options.subtaskId,
        note: options.note || null,
      },
    });
    this.publishTaskStatusBroadcast(task, {
      kind: 'subtask_cancelled',
      bodyLines: [
        `Subtask ${options.subtaskId} cancelled by ${options.callerId}.`,
        ...(options.note ? [`Reason: ${options.note}`] : []),
      ],
    });
    return task;
  }

  createSubtasks(taskId: string, options: CreateSubtasksRequestDto): CreateSubtasksResponseDto {
    const task = this.getTaskOrThrow(taskId);
    if (task.state !== TaskState.ACTIVE) {
      throw new Error(`Task ${taskId} is in state '${task.state}', expected 'active'`);
    }
    if (!task.current_stage) {
      throw new Error(`Task ${taskId} has no current_stage set`);
    }
    const controllerRef = resolveControllerRef(task.team.members);
    if (controllerRef && options.caller_id !== controllerRef) {
      throw new Error(`Subtask creation requires controller ownership: expected '${controllerRef}', received '${options.caller_id}'`);
    }
    const stage = this.getCurrentStageOrThrow(task);
    const executionKind = resolveStageExecutionKind(stage);
    if (executionKind !== 'citizen_execute' && executionKind !== 'craftsman_dispatch') {
      throw new Error(`Stage '${stage.id}' does not allow execute-mode subtasks`);
    }
    const duplicateIds = new Set<string>();
    const existingIds = new Set(this.subtaskRepository.listByTask(taskId).map((subtask) => subtask.id));
    for (const subtask of options.subtasks) {
      if (duplicateIds.has(subtask.id) || existingIds.has(subtask.id)) {
        throw new Error(`Subtask id '${subtask.id}' already exists in task ${taskId}`);
      }
      duplicateIds.add(subtask.id);
      if (subtask.craftsman && !stageAllowsCraftsmanDispatch(stage)) {
        throw new Error(`Stage '${stage.id}' does not allow craftsman dispatch`);
      }
    }
    this.assertCraftsmanGovernanceForSubtasks(options.subtasks);

    const executeDefs = options.subtasks.map((subtask) => ({
      id: subtask.id,
      title: subtask.title,
      assignee: subtask.assignee,
      ...(subtask.craftsman ? {
        craftsman: {
          adapter: subtask.craftsman.adapter,
          mode: subtask.craftsman.mode,
          workdir: subtask.craftsman.workdir ?? null,
          prompt: subtask.craftsman.prompt ?? null,
          brief_path: subtask.craftsman.brief_path ?? null,
        },
      } : {}),
    }));

    const controller = new ModeController(
      this.db,
      this.craftsmanDispatcher ? { dispatcher: this.craftsmanDispatcher } : {},
    );
    controller.enterExecuteMode(taskId, stage.id, executeDefs);

    const createdSubtasks = this.subtaskRepository
      .listByTask(taskId)
      .filter((subtask) => duplicateIds.has(subtask.id));
    const dispatchedExecutions = createdSubtasks
      .flatMap((subtask) => this.craftsmanExecutions.listBySubtask(taskId, subtask.id))
      .map((execution) => craftsmanExecutionSchema.parse(execution));

    this.publishTaskStatusBroadcast(task, {
      kind: 'subtasks_created',
      bodyLines: [
        `Controller ${options.caller_id} created ${createdSubtasks.length} subtasks in stage ${stage.id}.`,
        ...createdSubtasks.map((subtask) => `- ${subtask.id} | ${subtask.assignee} | ${subtask.craftsman_type ?? 'citizen_only'}`),
        ...(dispatchedExecutions.length > 0
          ? [`Auto-dispatched executions: ${dispatchedExecutions.map((execution) => `${execution.subtask_id}:${execution.execution_id}`).join(', ')}`]
          : []),
        ...this.buildSmokeSubtaskCommands(task, options.caller_id, createdSubtasks, dispatchedExecutions),
      ],
    });

    return {
      task: this.withControllerRef(this.getTaskOrThrow(taskId)) as CreateSubtasksResponseDto['task'],
      subtasks: createdSubtasks,
      dispatched_executions: dispatchedExecutions,
    };
  }

  listSubtasks(taskId: string) {
    this.getTaskOrThrow(taskId);
    return this.subtaskRepository.listByTask(taskId);
  }

  handleCraftsmanCallback(input: CraftsmanCallbackRequestDto) {
    const result = this.craftsmanCallbacks.handleCallback(input);
    if (
      result.task.state !== TaskState.PAUSED
      && ['done', 'failed', 'in_progress', 'waiting_input'].includes(result.subtask.status)
      && ['running', 'succeeded', 'failed', 'cancelled', 'needs_input', 'awaiting_choice'].includes(result.execution.status)
    ) {
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
    const controllerRef = resolveControllerRef(task.team.members);
    if (controllerRef && input.caller_id !== controllerRef) {
      throw new Error(`Craftsman dispatch requires controller ownership: expected '${controllerRef}', received '${input.caller_id}'`);
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
    this.assertCraftsmanDispatchAllowed(subtask.assignee);
    const dispatched = this.craftsmanDispatcher.dispatchSubtask({
      task_id: input.task_id,
      stage_id: subtask.stage_id,
      subtask_id: input.subtask_id,
      adapter: input.adapter,
      mode: input.mode,
      workdir: input.workdir ?? subtask.craftsman_workdir,
      prompt: subtask.craftsman_prompt,
      brief_path: input.brief_path ?? null,
    });
    this.publishTaskStatusBroadcast(task, {
      kind: 'craftsman_started',
      bodyLines: [
        `Craftsman dispatch started for subtask ${subtask.id}.`,
        `Caller: ${input.caller_id}`,
        `Adapter: ${input.adapter}`,
        `Execution: ${dispatched.execution.execution_id}`,
        ...this.buildSmokeExecutionCommands(task, dispatched.execution.execution_id, dispatched.execution.status),
      ],
    });
    return dispatched;
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

  getCraftsmanGovernanceSnapshot() {
    return {
      limits: {
        max_concurrent_running: this.craftsmanGovernance.maxConcurrentRunning,
        max_concurrent_per_agent: this.craftsmanGovernance.maxConcurrentPerAgent,
        host_memory_utilization_limit: this.craftsmanGovernance.hostMemoryUtilizationLimit,
        host_swap_utilization_limit: this.craftsmanGovernance.hostSwapUtilizationLimit,
        host_load_per_cpu_limit: this.craftsmanGovernance.hostLoadPerCpuLimit,
      },
      active_executions: this.craftsmanExecutions.countActiveExecutions(),
      active_by_assignee: this.craftsmanExecutions.listActiveExecutionCountsByAssignee(),
      host: this.hostResourcePort?.readSnapshot() ?? null,
    };
  }

  sendCraftsmanInputText(executionId: string, text: string, submit = true) {
    const execution = this.requireInteractiveExecution(executionId);
    this.craftsmanInputPort?.sendText(execution, text, submit);
    this.recordCraftsmanInput(execution.taskId, execution.subtaskId, execution.executionId, 'text', text);
    this.probeCraftsmanExecution(execution.executionId);
    return execution;
  }

  sendCraftsmanInputKeys(executionId: string, keys: CraftsmanInputKeyDto[]) {
    const execution = this.requireInteractiveExecution(executionId);
    this.craftsmanInputPort?.sendKeys(execution, keys);
    this.recordCraftsmanInput(execution.taskId, execution.subtaskId, execution.executionId, 'keys', keys.join(','));
    this.probeCraftsmanExecution(execution.executionId);
    return execution;
  }

  submitCraftsmanChoice(executionId: string, keys: CraftsmanInputKeyDto[] = []) {
    const execution = this.requireInteractiveExecution(executionId);
    this.craftsmanInputPort?.submitChoice(execution, keys);
    this.recordCraftsmanInput(execution.taskId, execution.subtaskId, execution.executionId, 'choice', keys.join(','));
    this.probeCraftsmanExecution(execution.executionId);
    return execution;
  }

  probeCraftsmanExecution(executionId: string) {
    const execution = this.getCraftsmanExecution(executionId);
    if (!this.craftsmanExecutionProbePort) {
      return { execution, probed: false as const };
    }
    const callback = this.craftsmanExecutionProbePort.probe({
      executionId: execution.execution_id,
      adapter: execution.adapter,
      sessionId: execution.session_id,
      status: execution.status,
    });
    if (!callback) {
      return { execution, probed: false as const };
    }
    return {
      ...this.handleCraftsmanCallback(callback),
      probed: true as const,
    };
  }

  observeCraftsmanExecutions(options: ObserveCraftsmanExecutionsOptions): ObserveCraftsmanExecutionsResult {
    const nowMs = (options.now ?? new Date()).getTime();
    const result: ObserveCraftsmanExecutionsResult = {
      scanned: 0,
      probed: 0,
      progressed: 0,
    };
    for (const execution of this.craftsmanExecutions.listActiveExecutions()) {
      result.scanned += 1;
      const lastActivityMs = Date.parse(execution.updated_at ?? execution.started_at ?? execution.created_at);
      if (!Number.isFinite(lastActivityMs)) {
        continue;
      }
      const thresholdMs = execution.status === 'needs_input' || execution.status === 'awaiting_choice'
        ? options.waitingAfterMs
        : options.runningAfterMs;
      if (nowMs - lastActivityMs < thresholdMs) {
        continue;
      }
      this.flowLogRepository.insertFlowLog({
        task_id: execution.task_id,
        kind: 'system',
        event: 'craftsman_auto_probe',
        stage_id: this.subtaskRepository.listByTask(execution.task_id).find((item) => item.id === execution.subtask_id)?.stage_id ?? null,
        detail: {
          execution_id: execution.execution_id,
          status: execution.status,
        },
        actor: 'system',
      });
      const probeResult = this.probeCraftsmanExecution(execution.execution_id);
      if (probeResult.probed) {
        result.probed += 1;
        if (probeResult.execution.status !== execution.status) {
          result.progressed += 1;
        }
      }
    }
    return result;
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
    this.reconcileStageExitSubtasks(taskId, advance.currentStage.id, 'archived', 'force_advanced');
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
      locale: 'zh-CN',
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

  probeInactiveTasks(options: InactiveTaskProbeOptions): InactiveTaskProbeResult {
    const now = options.now ?? new Date();
    const result: InactiveTaskProbeResult = {
      scanned_tasks: 0,
      controller_pings: 0,
      roster_pings: 0,
      inbox_items: 0,
    };

    for (const task of this.taskRepository.listTasks(TaskState.ACTIVE)) {
      result.scanned_tasks += 1;
      const latestActivityMs = this.resolveLatestBusinessActivityMs(task);
      const idleMs = now.getTime() - latestActivityMs;
      const controllerRef = resolveControllerRef(task.team.members);
      const interactiveRefs = task.team.members.filter(isInteractiveParticipant).map((member) => member.agentId);
      if (idleMs < options.controllerAfterMs) {
        continue;
      }
      const probeState = this.getProbeState(task.id, latestActivityMs);

      if (!probeState.controllerNotified && controllerRef) {
        this.publishTaskStatusBroadcast(task, {
          kind: 'thread_probe_controller',
          participantRefs: [controllerRef],
          bodyLines: [
            `Task appears inactive for ${Math.round(idleMs / 1000)} seconds.`,
            'No meaningful progress has been detected. Please inspect the thread and continue orchestration.',
          ],
        });
        this.flowLogRepository.insertFlowLog({
          task_id: task.id,
          kind: 'flow',
          event: 'thread_probe_controller',
          stage_id: task.current_stage,
          detail: { idle_ms: idleMs, controller_ref: controllerRef },
          actor: 'system',
        });
        result.controller_pings += 1;
        continue;
      }

      if (idleMs >= options.rosterAfterMs && probeState.controllerNotified && !probeState.rosterNotified && interactiveRefs.length > 0) {
        this.publishTaskStatusBroadcast(task, {
          kind: 'thread_probe_roster',
          participantRefs: interactiveRefs,
          bodyLines: [
            `Task remains inactive for ${Math.round(idleMs / 1000)} seconds after controller probe.`,
            'Interactive roster should check the thread, unblock the current stage, and continue execution.',
          ],
        });
        this.flowLogRepository.insertFlowLog({
          task_id: task.id,
          kind: 'flow',
          event: 'thread_probe_roster',
          stage_id: task.current_stage,
          detail: { idle_ms: idleMs, participant_refs: interactiveRefs },
          actor: 'system',
        });
        result.roster_pings += 1;
        continue;
      }

      if (idleMs >= options.inboxAfterMs && probeState.rosterNotified && !probeState.inboxRaised) {
        this.inboxRepository.insertInboxItem({
          text: `Task ${task.id} appears stuck`,
          source: 'thread_probe',
          notes: `Task ${task.id} has remained inactive for ${Math.round(idleMs / 1000)} seconds at stage ${task.current_stage ?? '-'}.`,
          tags: ['task', 'stuck'],
          metadata: {
            task_id: task.id,
            kind: 'thread_probe_inbox',
            current_stage: task.current_stage,
            idle_ms: idleMs,
          },
        });
        this.flowLogRepository.insertFlowLog({
          task_id: task.id,
          kind: 'flow',
          event: 'thread_probe_inbox',
          stage_id: task.current_stage,
          detail: { idle_ms: idleMs },
          actor: 'system',
        });
        result.inbox_items += 1;
      }
    }

    return result;
  }

  private buildWorkflow(template: TaskTemplate): WorkflowDto {
    return {
      type: template.defaultWorkflow ?? 'linear',
      stages: template.stages ?? [],
      ...(template.graph ? { graph: template.graph } : {}),
    };
  }

  private buildTaskBlueprint(task: StoredTask): TaskBlueprintDto {
    if (task.workflow.graph) {
      const graph = task.workflow.graph;
      return {
        graph_version: graph.graph_version,
        entry_nodes: [...graph.entry_nodes],
        controller_ref: resolveControllerRef(task.team.members),
        nodes: graph.nodes.map((node) => ({
          id: node.id,
          name: node.name ?? null,
          mode: resolveStageModeFromExecutionKind(node.execution_kind ?? null),
          execution_kind: node.execution_kind ?? null,
          ...(node.allowed_actions?.length ? { allowed_actions: node.allowed_actions } : {}),
          gate_type: node.gate?.type ?? null,
        })),
        edges: graph.edges
          .filter((edge): edge is typeof edge & { kind: 'advance' | 'reject' } => edge.kind === 'advance' || edge.kind === 'reject')
          .map((edge) => ({
            from: edge.from,
            to: edge.to,
            kind: edge.kind,
          })),
        artifact_contracts: graph.nodes
          .filter((node) => node.execution_kind === 'citizen_execute' || node.execution_kind === 'craftsman_dispatch')
          .map((node) => ({
            node_id: node.id,
            artifact_type: 'stage_output',
          })),
        role_bindings: task.team.members,
      };
    }
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

  private buildTaskBrainWorkspaceRequest(task: StoredTask, templateId: string) {
    return {
      task_id: task.id,
      locale: task.locale,
      title: task.title,
      description: task.description ?? '',
      type: task.type,
      priority: task.priority,
      creator: task.creator,
      template_id: templateId,
      control_mode: task.control?.mode ?? 'normal',
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

  private tryLoadTemplate(taskType: string): TaskTemplate | null {
    const stored = this.templateRepository.getTemplate(taskType);
    return stored ? stored.template as TaskTemplate : null;
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
          taskText(task, 'Agora 任务启动简报', 'Agora task bootstrap'),
          `${taskText(task, '任务', 'Task')}: ${task.id} — ${task.title}`,
          `${taskText(task, '任务目标', 'Task Goal')}: ${task.description?.trim() || task.title}`,
          `${taskText(task, '主控', 'Controller')}: ${controllerRef ?? '-'}`,
          `${taskText(task, '当前阶段', 'Current Stage')}: ${task.current_stage}`,
          `${taskText(task, '执行语义', 'Execution Kind')}: ${resolveStageExecutionKind(stage) ?? '-'}`,
          `${taskText(task, '允许动作', 'Allowed Actions')}: ${resolveAllowedActions(stage).join(', ') || '-'}`,
          '',
          `${taskText(task, '成员清单', 'Roster')}:`,
          ...task.team.members.map((member) => (
            `- ${member.agentId} | ${member.role} | ${member.member_kind ?? 'citizen'} | ${member.agent_origin ?? 'user_managed'} | ${member.briefing_mode ?? 'overlay_full'}`
          )),
          '',
          `${taskText(task, '首先阅读', 'Read first')}:`,
          `- ${join(homedir(), '.agora', 'skills', 'agora-bootstrap', 'SKILL.md')}`,
          ...(workspacePath
            ? [
                `- ${join(workspacePath, '00-bootstrap.md')}`,
                `- ${join(workspacePath, '01-task-brief.md')}`,
                `- ${join(workspacePath, '02-roster.md')}`,
                `- ${join(workspacePath, '03-stage-state.md')}`,
              ]
            : []),
          '',
          `${taskText(task, 'Craftsman 循环', 'Craftsman loop')}:`,
          `- ${taskText(task, '在当前任务线程内，使用 subtask 作为正式执行绑定对象。', 'Use subtasks as the formal execution binding object inside this task thread.')}`,
          `- ${taskText(task, '仅当活动阶段允许 `craftsman_dispatch` 时，才从 subtask 调度 craftsman。', 'Dispatch craftsmen from subtasks only when the active stage allows `craftsman_dispatch`.')}`,
          `- ${taskText(task, '执行模式优先使用 `one_shot`（单次结果）或 `interactive`（持续交互）。', 'Prefer `one_shot` (single result) or `interactive` (continued dialogue) as the execution mode.')}`,
          `- ${taskText(task, '如果 craftsman 进入 `needs_input` 或 `awaiting_choice`，通过它的 `execution_id` 继续同一个执行。', 'If a craftsman pauses with `needs_input` or `awaiting_choice`, continue the same execution through its `execution_id`.')}`,
          `- ${taskText(task, '继续执行后，用 `agora craftsman probe <executionId>` 同步最新状态；只有 probe 无法推断结果时，才回退到 `agora craftsman callback ...`。', 'After a continued execution, sync the latest state with `agora craftsman probe <executionId>`; only fall back to `agora craftsman callback ...` if probe cannot infer the result.')}`,
          `- ${taskText(task, '把原始 tmux pane 命令视为调试 transport，不要当成默认产品流程。', 'Treat raw tmux pane commands as debug-only transport tools, not as the default product workflow.')}`,
          '',
          `${taskText(task, 'Discord 提及规则', 'Discord mention rule')}:`,
          `- ${taskText(task, '要可靠唤醒 bot 或人类，请使用真实的 Discord mention 语法 `<@USER_ID>`。', 'To wake a bot or human reliably, use the real Discord mention syntax `<@USER_ID>`.')}`,
          `- ${taskText(task, '不要输入显示名，例如 `@Opus` 或 `@Sonnet`。', 'Do not type display names like `@Opus` or `@Sonnet`.')}`,
          `- ${taskText(task, '尽量复用本线程里已经出现过的真实 mention。', 'Reuse the real mentions already shown in this thread whenever possible.')}`,
          ...(task.control?.mode === 'smoke_test'
            ? [
                '',
                `${taskText(task, '冒烟测试模式', 'Smoke Test Mode')}:`,
                `- ${taskText(task, '当前任务运行在 smoke/test 模式下。', 'This task is running in smoke/test mode.')}`,
                `- ${taskText(task, '额外测试引导仅用于验证。', 'Extra testing guidance may appear for validation only.')}`,
                `- ${taskText(task, '这不是默认的终端用户产品流程。', 'This is not the default end-user product flow.')}`,
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
          `${taskText(task, '角色简报', 'Role briefing')} ${member.agentId}`,
          `${taskText(task, 'Agora 角色', 'Agora Role')}: ${member.role}`,
          `${taskText(task, '成员类型', 'Member Kind')}: ${member.member_kind ?? 'citizen'}`,
          `${taskText(task, 'Agent 来源', 'Agent Origin')}: ${member.agent_origin ?? 'user_managed'}`,
          `${taskText(task, '简报模式', 'Briefing Mode')}: ${member.briefing_mode ?? 'overlay_full'}`,
          `${taskText(task, '主控', 'Controller')}: ${controllerRef ?? '-'}`,
          `${taskText(task, '当前阶段', 'Current Stage')}: ${task.current_stage}`,
          `${taskText(task, '任务目标', 'Task Goal')}: ${task.description?.trim() || task.title}`,
          taskText(task, '执行模式：优先 `one_shot`（单次结果）或 `interactive`（持续交互）。', 'Execution Mode: prefer `one_shot` (single result) or `interactive` (continued dialogue).'),
          taskText(task, 'Craftsman 循环：使用正式 subtask 绑定 craftsman，等待中的执行通过 `execution_id` 继续，而不是靠原始 pane 名。', 'Craftsman Loop: use formal subtasks and continue waiting craftsmen through `execution_id`, not raw pane names.'),
          taskText(task, '继续规则：继续 craftsman execution 后，用 `agora craftsman probe <executionId>` 同步；只有必要时才回退到 `agora craftsman callback ...`。', 'Continuation Rule: after continuing a craftsman execution, sync it with `agora craftsman probe <executionId>`; use `agora craftsman callback ...` only as a fallback.'),
          taskText(task, 'Discord 提及规则：使用真实 `<@USER_ID>` mention，不要用显示名。', 'Discord Mention Rule: use real `<@USER_ID>` mentions, not display names.'),
          ...(task.control?.mode === 'smoke_test'
            ? [taskText(task, '冒烟测试模式：当前线程仅用于验证，不代表默认产品体验。', 'Smoke Test Mode: this thread is being used for validation, not for the default product UX.')]
            : []),
          ...(member.briefing_mode !== 'overlay_delta' && roleDocPath ? [`${taskText(task, '阅读角色文档', 'Read role doc')}: ${roleDocPath}`] : []),
          ...(member.briefing_mode === 'overlay_delta'
            ? [taskText(task, '该 Agent 已自带 Agora 托管的基础角色上下文；以下 role brief 只提供本任务增量。', 'This agent already carries Agora-managed base role context; use the role brief below as task delta.')]
            : [taskText(task, '该 Agent 应在行动前加载完整的 Agora 角色覆盖上下文。', 'This agent should load the full Agora role overlay before acting.')]),
          ...(roleBriefPath ? [`${taskText(task, '阅读角色简报', 'Read role brief')}: ${roleBriefPath}`] : []),
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
            taskText(task, `${task.id} 需要主控处理。`, `Controller action required for ${task.id}.`),
            taskText(task, `人类通过 ${input.gateType} 拒绝了当前交接。`, `Human rejected the current handoff via ${input.gateType}.`),
            `${taskText(task, '原因', 'Reason')}: ${input.reason ?? taskText(task, '(未提供原因)', '(no reason provided)')}`,
            `${taskText(task, '当前阶段', 'Current Stage')}: ${task.current_stage ?? '-'}`,
            taskText(task, '请与成员重新规划、处理反馈，并在准备好后重新送审。', 'Re-plan with the roster, address the feedback, and resubmit when ready.'),
          ]
        : [
            taskText(task, `${task.id} 的主控更新。`, `Controller update for ${task.id}.`),
            taskText(task, `人类已通过 ${input.gateType} 批准当前交接。`, `Human approved the current handoff via ${input.gateType}.`),
            `${taskText(task, '当前阶段', 'Current Stage')}: ${task.current_stage ?? '-'}`,
            taskText(task, '请继续编排并推进到下一个阶段。', 'Resume orchestration and drive the next stage.'),
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
      bodyLines.push(taskText(task, '任务已暂停。线程将被归档并锁定。', 'Task paused. Thread will be archived and locked.'));
    } else if (toState === TaskState.CANCELLED) {
      bodyLines.push(taskText(task, '任务已取消。线程将被归档并锁定，直到归档流程完成。', 'Task cancelled. Thread will be archived and locked until archive finalization.'));
    } else if (toState === TaskState.ACTIVE && fromState === TaskState.PAUSED) {
      bodyLines.push(taskText(task, '任务已恢复。原线程已重新打开。', 'Task resumed. Original thread has been reopened.'));
    } else if (toState === TaskState.ACTIVE && fromState === TaskState.BLOCKED) {
      bodyLines.push(taskText(task, '任务已解除阻塞并恢复为活跃执行。', 'Task unblocked and returned to active execution.'));
    } else if (toState === TaskState.BLOCKED) {
      bodyLines.push(taskText(task, '任务已阻塞，需要介入处理。', 'Task blocked and requires intervention.'));
    } else {
      return;
    }
    if (reason) {
      bodyLines.push(`${taskText(task, '原因', 'Reason')}: ${reason}`);
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
      occurredAt?: string;
    },
  ) {
    if (!this.imProvisioningPort || !this.taskContextBindingService) {
      return;
    }
    const binding = this.taskContextBindingService.getLatestBinding(task.id);
    if (!binding) {
      return;
    }
    const envelope = this.buildTaskStatusBroadcastEnvelope(task, input);
    void this.imProvisioningPort.publishMessages({
      binding_id: binding.id,
      conversation_ref: binding.conversation_ref,
      thread_ref: binding.thread_ref,
      messages: [{
        kind: input.kind,
        ...(input.participantRefs ? { participant_refs: input.participantRefs } : {}),
        body: envelope.lines.join('\n'),
      }],
    }).catch((error: unknown) => {
      console.error(`[TaskService] Task status broadcast failed for task ${task.id}:`, error);
    });
    this.taskConversationRepository.insert({
      id: randomUUID(),
      task_id: task.id,
      binding_id: binding.id,
      provider: binding.im_provider,
      direction: 'system',
      author_kind: 'system',
      author_ref: 'agora-bot',
      display_name: 'agora-bot',
      body: envelope.lines.join('\n'),
      body_format: 'plain_text',
      occurred_at: input.occurredAt ?? new Date().toISOString(),
      metadata: envelope,
    });
  }

  private buildTaskStatusBroadcastEnvelope(
    task: StoredTask,
    input: {
      kind: string;
      bodyLines: string[];
      participantRefs?: string[];
    },
  ): TaskStatusBroadcastEnvelope {
    const stage = task.current_stage ? this.getStageByIdOrThrow(task, task.current_stage) : null;
    const brainBinding = this.taskBrainBindingService?.getActiveBinding(task.id) ?? null;
    return {
      event_type: input.kind,
      task_id: task.id,
      title: task.title,
      task_state: task.state,
      current_stage: task.current_stage,
      execution_kind: resolveStageExecutionKind(stage),
      allowed_actions: resolveAllowedActions(stage),
      controller_ref: resolveControllerRef(task.team.members),
      control_mode: task.control?.mode ?? 'normal',
      workspace_path: brainBinding?.workspace_path ?? null,
      participant_refs: input.participantRefs ?? null,
      locale: task.locale,
      lines: [
        taskText(task, 'Agora 状态更新', 'Agora status update'),
        `${taskText(task, '事件类型', 'Event Type')}: ${input.kind}`,
        `${taskText(task, '任务', 'Task')}: ${task.id} — ${task.title}`,
        `${taskText(task, '任务状态', 'Task State')}: ${task.state}`,
        `${taskText(task, '当前阶段', 'Current Stage')}: ${task.current_stage ?? '-'}`,
        `${taskText(task, '执行语义', 'Execution Kind')}: ${resolveStageExecutionKind(stage) ?? '-'}`,
        `${taskText(task, '允许动作', 'Allowed Actions')}: ${resolveAllowedActions(stage).join(', ') || '-'}`,
        `${taskText(task, '主控', 'Controller')}: ${resolveControllerRef(task.team.members) ?? '-'}`,
        ...input.bodyLines,
        ...this.buildSmokeStatusGuidance(task, input.kind),
        ...(brainBinding ? [`${taskText(task, '任务工作区', 'Task Workspace')}: ${brainBinding.workspace_path}`] : []),
        ...(brainBinding ? [`${taskText(task, '当前简报', 'Current Brief')}: ${join(brainBinding.workspace_path, '00-current.md')}`] : []),
      ],
    };
  }

  private buildSmokeStatusGuidance(task: StoredTask, kind: string): string[] {
    if (task.control?.mode !== 'smoke_test') {
      return [];
    }

    const currentStage = task.current_stage ?? '-';
    const controllerRef = resolveControllerRef(task.team.members) ?? '-';
    switch (kind) {
      case 'gate_waiting':
        return [
          '',
          `${taskText(task, '冒烟引导', 'Smoke Guidance')}:`,
          `- ${taskText(task, '现在验证人工审批链路。', 'Validate the human approval path now.')}`,
          `- ${taskText(task, '在这个任务线程里，用 IM 命令或 Dashboard 直接 approve/reject，不需要手输 task id。', 'In this task thread, use the IM command or Dashboard to approve/reject without typing the task id.')}`,
          `- ${taskText(task, `决策后确认主控 (${controllerRef}) 收到了下一步状态更新。`, `After a decision, confirm the controller (${controllerRef}) receives the next-step status update.`)}`,
        ];
      case 'gate_rejected':
      case 'controller_gate_rejected':
        return [
          '',
          `${taskText(task, '冒烟引导', 'Smoke Guidance')}:`,
          `- ${taskText(task, `当前是阶段 ${currentStage} 的 reject/rework 回环。`, `This is the reject/rework loop for stage ${currentStage}.`)}`,
          `- ${taskText(task, `主控 ${controllerRef} 应重新组织成员工作，在子线程回复修复计划，并重新送审。`, `Controller ${controllerRef} should reorganize the roster work, reply in-thread with the fix plan, and resubmit for approval.`)}`,
          `- ${taskText(task, '确认 reject 原因同时保留在 Discord 和 Agora conversation 中。', 'Validate that the reject reason is preserved in both Discord and Agora conversation.')}`,
        ];
      case 'gate_approved':
      case 'controller_gate_approved':
        return [
          '',
          `${taskText(task, '冒烟引导', 'Smoke Guidance')}:`,
          `- ${taskText(task, `阶段 ${currentStage} 已通过审批。`, `Approval passed for stage ${currentStage}.`)}`,
          `- ${taskText(task, `主控 ${controllerRef} 应继续编排循环并推动下一步允许动作。`, `Controller ${controllerRef} should continue the orchestration loop and drive the next allowed action.`)}`,
        ];
      case 'craftsman_started':
      case 'craftsman_running':
        return [
          '',
          `${taskText(task, '冒烟引导', 'Smoke Guidance')}:`,
          `- ${taskText(task, '现在验证自动循环：等待 craftsman callback，并确认状态回到这个线程。', 'Validate the automatic loop now: wait for the craftsman callback and confirm the status returns to this thread.')}`,
          `- ${taskText(task, '当前 callback 完成前，不要触发第二个 craftsman dispatch。', 'Do not trigger a second craftsman dispatch until the current callback completes.')}`,
        ];
      case 'craftsman_completed':
      case 'craftsman_failed':
        return [
          '',
          `${taskText(task, '冒烟引导', 'Smoke Guidance')}:`,
          `- ${taskText(task, '确认这个 callback 也出现在 Agora conversation 和 Dashboard timeline。', 'Confirm this callback also appears in Agora conversation and Dashboard timeline.')}`,
          `- ${taskText(task, `主控 ${controllerRef} 应根据 callback 结果决定继续、重试还是重新送审。`, `Controller ${controllerRef} should decide whether to continue, retry, or resubmit based on the callback result.`)}`,
        ];
      case 'craftsman_needs_input':
      case 'craftsman_awaiting_choice':
        return [
          '',
          `${taskText(task, '冒烟引导', 'Smoke Guidance')}:`,
          `- ${taskText(task, '现在用 execution-scoped Agora CLI 命令验证结构化输入回环。', 'Validate the structured input loop now using the execution-scoped Agora CLI commands.')}`,
          `- ${taskText(task, '确认 callback metadata 包含 input_request，并且出现在 conversation/Dashboard。', 'Confirm the callback metadata includes the input_request payload and appears in conversation/Dashboard.')}`,
        ];
      case 'thread_probe_controller':
      case 'thread_probe_roster':
      case 'thread_probe_inbox':
        return [
          '',
          `${taskText(task, '冒烟引导', 'Smoke Guidance')}:`,
          `- ${taskText(task, '这是卡住任务的升级探测。', 'This is a stuck-task escalation probe.')}`,
          `- ${taskText(task, '确认升级顺序是 controller -> roster -> inbox，并且每一步只在真实无活动后触发一次。', 'Confirm the escalation order is controller -> roster -> inbox and that each step appears only once after real inactivity.')}`,
        ];
      default:
        return [];
    }
  }

  private buildSmokeStageEntryCommands(task: StoredTask, stage: WorkflowStageLike): string[] {
    if (task.control?.mode !== 'smoke_test') {
      return [];
    }
    const executionKind = resolveStageExecutionKind(stage);
    const controllerRef = resolveControllerRef(task.team.members) ?? 'controller';
    if (executionKind !== 'citizen_execute' && executionKind !== 'craftsman_dispatch') {
      return [];
    }
    return [
      '',
      'Smoke Next Step:',
      `- Controller should create execute-mode subtasks now: \`agora subtasks create ${task.id} --caller-id ${controllerRef} --file subtasks.json\``,
      '- Put the craftsman spec inside `subtasks.json` if this stage should auto-dispatch a craftsman.',
    ];
  }

  private buildSmokeSubtaskCommands(
    task: StoredTask,
    callerId: string,
    createdSubtasks: Array<{ id: string }>,
    dispatchedExecutions: Array<{ execution_id: string }>,
  ): string[] {
    if (task.control?.mode !== 'smoke_test') {
      return [];
    }
    const lines = [
      '',
      'Smoke Next Step:',
      `- If no execution was auto-dispatched, dispatch from a subtask explicitly: \`agora craftsman dispatch ${task.id} <subtaskId> <adapter> --caller-id ${callerId}\``,
      `- Inspect subtasks now: \`agora subtasks list ${task.id}\``,
    ];
    if (dispatchedExecutions.length > 0) {
      const first = dispatchedExecutions[0]!;
      lines.push(`- First execution ready: \`${first.execution_id}\``);
      lines.push(`- If it pauses for input, continue with: \`agora craftsman input-text ${first.execution_id} "<text>"\``);
    } else if (createdSubtasks.length > 0) {
      lines.push('- After dispatch, watch the thread for `craftsman_started` and later callback events.');
    }
    return lines;
  }

  private buildSmokeExecutionCommands(task: StoredTask, executionId: string, status: string): string[] {
    if (task.control?.mode !== 'smoke_test') {
      return [];
    }
    const lines = [
      '',
      'Smoke Next Step:',
      `- Inspect task conversation: \`agora task conversation ${task.id} --json\``,
    ];
    if (status === 'needs_input') {
      lines.push(`- Continue this execution with text: \`agora craftsman input-text ${executionId} "<text>"\``);
      lines.push(`- Or send structured keys: \`agora craftsman input-keys ${executionId} Down Enter\``);
      lines.push(`- Then sync the latest state: \`agora craftsman probe ${executionId}\``);
    } else if (status === 'awaiting_choice') {
      lines.push(`- Continue this choice flow: \`agora craftsman submit-choice ${executionId} Down\``);
      lines.push(`- If needed, fall back to explicit keys: \`agora craftsman input-keys ${executionId} Down Enter\``);
      lines.push(`- Then sync the latest state: \`agora craftsman probe ${executionId}\``);
    } else if (status === 'running') {
      lines.push(`- If the pane looks finished, sync it now: \`agora craftsman probe ${executionId}\``);
      lines.push('- Do not dispatch another craftsman into the same slot until this execution settles.');
    }
    return lines;
  }

  private buildSmokePostInputCommands(task: StoredTask, executionId: string): string[] {
    if (task.control?.mode !== 'smoke_test') {
      return [];
    }
    return [
      '',
      'Smoke Next Step:',
      '- Inspect the craftsman pane or session output now.',
      `- Sync the latest execution state: \`agora craftsman probe ${executionId}\``,
      '- If it still needs input after probing, continue through the same execution_id.',
    ];
  }

  private sendImmediateCraftsmanNotification(taskId: string, executionId: string, subtaskId: string) {
    const task = this.getTask(taskId);
    if (!task) {
      return;
    }
    const execution = this.craftsmanExecutions.getExecution(executionId);
    const subtask = this.subtaskRepository.listByTask(taskId).find((item) => item.id === subtaskId);
    if (!execution || !subtask) {
      return;
    }
    const eventType = execution.status === 'succeeded'
      ? 'craftsman_completed'
      : execution.status === 'running'
        ? 'craftsman_running'
      : execution.status === 'needs_input'
        ? 'craftsman_needs_input'
        : execution.status === 'awaiting_choice'
          ? 'craftsman_awaiting_choice'
          : 'craftsman_failed';
    const payload = execution.callback_payload as { input_request?: { hint?: string | null; choice_options?: Array<{ id: string; label: string }> | null } } | null;
    this.publishTaskStatusBroadcast(task, {
      kind: eventType,
      bodyLines: [
        `Craftsman callback settled for subtask ${subtask.id}.`,
        `Adapter: ${execution.adapter}`,
        `Execution: ${execution.execution_id}`,
        `Status: ${execution.status}`,
        ...(subtask.output ? [`Output: ${subtask.output}`] : []),
        ...(payload?.input_request?.hint ? [`Input Hint: ${payload.input_request.hint}`] : []),
        ...((payload?.input_request?.choice_options?.length ?? 0) > 0
          ? [`Choices: ${payload?.input_request?.choice_options?.map((option) => `${option.id}:${option.label}`).join(', ')}`]
          : []),
        ...this.buildSmokeExecutionCommands(task, execution.execution_id, execution.status),
      ],
      ...(execution.finished_at ? { occurredAt: execution.finished_at } : {}),
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

    this.reconcileStageExitSubtasks(task.id, currentStageId, 'archived', decisionEvent);
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
    if (task.state === TaskState.PAUSED && newState === TaskState.ACTIVE) {
      return {
        action: 'resume',
        resumed_subtasks: this.resumeArchivedSubtasks(task),
      };
    }
    if (newState === TaskState.PAUSED) {
      return {
        action: 'pause',
        archived_subtasks: this.archiveOpenSubtasks(task.id, 'task_paused'),
      };
    }
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

  private assertCraftsmanGovernanceForSubtasks(subtasks: CreateSubtasksRequestDto['subtasks']) {
    const plannedByAssignee = new Map<string, number>();
    for (const subtask of subtasks) {
      if (!subtask.craftsman) {
        continue;
      }
      plannedByAssignee.set(subtask.assignee, (plannedByAssignee.get(subtask.assignee) ?? 0) + 1);
    }
    for (const [assignee, planned] of plannedByAssignee) {
      this.assertCraftsmanDispatchAllowed(assignee, planned);
    }
  }

  private assertCraftsmanDispatchAllowed(assignee: string, additionalPlanned = 1) {
    this.assertHostResourcesAllowDispatch();
    const limit = this.craftsmanGovernance.maxConcurrentPerAgent;
    if (limit === null) {
      return;
    }
    const active = this.craftsmanExecutions.countActiveExecutionsByAssignee(assignee);
    if (active + additionalPlanned > limit) {
      throw new Error(
        `Craftsman per-agent concurrency limit exceeded for ${assignee}: ${active + additionalPlanned}/${limit}`,
      );
    }
  }

  private assertHostResourcesAllowDispatch() {
    if (!this.hostResourcePort) {
      return;
    }
    const snapshot = this.hostResourcePort.readSnapshot();
    if (!snapshot) {
      return;
    }
    const memoryLimit = this.craftsmanGovernance.hostMemoryUtilizationLimit;
    if (
      memoryLimit !== null
      && snapshot.memory_utilization !== null
      && snapshot.memory_utilization > memoryLimit
    ) {
      throw new Error(
        `Host memory utilization ${snapshot.memory_utilization.toFixed(2)} exceeds limit ${memoryLimit.toFixed(2)}`,
      );
    }
    const swapLimit = this.craftsmanGovernance.hostSwapUtilizationLimit;
    if (
      swapLimit !== null
      && snapshot.swap_utilization !== null
      && snapshot.swap_utilization > swapLimit
    ) {
      throw new Error(
        `Host swap utilization ${snapshot.swap_utilization.toFixed(2)} exceeds limit ${swapLimit.toFixed(2)}`,
      );
    }
    const loadLimit = this.craftsmanGovernance.hostLoadPerCpuLimit;
    const normalizedLoad = snapshot.load_1m !== null && snapshot.cpu_count !== null && snapshot.cpu_count > 0
      ? snapshot.load_1m / snapshot.cpu_count
      : null;
    if (
      loadLimit !== null
      && normalizedLoad !== null
      && normalizedLoad > loadLimit
    ) {
      throw new Error(
        `Host load-per-cpu ${normalizedLoad.toFixed(2)} exceeds limit ${loadLimit.toFixed(2)}`,
      );
    }
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
    return status === 'in_progress'
      || status === 'waiting_input'
      || dispatchStatus === 'running'
      || dispatchStatus === 'needs_input'
      || dispatchStatus === 'awaiting_choice';
  }

  private getSubtaskOrThrow(taskId: string, subtaskId: string) {
    const subtask = this.subtaskRepository.listByTask(taskId).find((item) => item.id === subtaskId);
    if (!subtask) {
      throw new NotFoundError(`Subtask ${subtaskId} not found in task ${taskId}`);
    }
    return subtask;
  }

  private assertSubtaskControl(task: StoredTask, subtask: { id: string; assignee: string }, callerId: string) {
    const controllerRef = resolveControllerRef(task.team.members);
    const allowed = this.permissions.isArchon(callerId)
      || callerId === subtask.assignee
      || (controllerRef !== null && callerId === controllerRef);
    if (!allowed) {
      throw new PermissionDeniedError(
        `${callerId} cannot control subtask ${subtask.id} (assignee=${subtask.assignee}, controller=${controllerRef ?? '-'})`,
      );
    }
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
        status: 'cancelled',
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

  private archiveOpenSubtasks(taskId: string, reason: string) {
    const now = new Date().toISOString();
    const archived: string[] = [];
    for (const subtask of this.subtaskRepository.listByTask(taskId)) {
      if (TERMINAL_SUBTASK_STATES.has(subtask.status)) {
        continue;
      }
      this.subtaskRepository.updateSubtask(taskId, subtask.id, {
        status: 'archived',
        output: subtask.output ?? `Subtask archived: ${reason}`,
        done_at: now,
      });
      archived.push(subtask.id);
    }
    return archived;
  }

  private resumeArchivedSubtasks(task: StoredTask) {
    const resumed: string[] = [];
    if (!task.current_stage) {
      return resumed;
    }
    for (const subtask of this.subtaskRepository.listByTask(task.id)) {
      if (subtask.stage_id !== task.current_stage || subtask.status !== 'archived') {
        continue;
      }
      this.subtaskRepository.updateSubtask(task.id, subtask.id, {
        status: this.restoreSubtaskStatus(subtask.dispatch_status),
        done_at: null,
      });
      resumed.push(subtask.id);
    }
    return resumed;
  }

  private reconcileStageExitSubtasks(
    taskId: string,
    stageId: string,
    targetStatus: 'archived' | 'cancelled',
    reason: string,
  ) {
    const now = new Date().toISOString();
    const impacted: string[] = [];
    for (const subtask of this.subtaskRepository.listByTask(taskId)) {
      if (subtask.stage_id !== stageId || TERMINAL_SUBTASK_STATES.has(subtask.status)) {
        continue;
      }
      this.subtaskRepository.updateSubtask(taskId, subtask.id, {
        status: targetStatus,
        output: subtask.output ?? `Subtask ${targetStatus}: ${reason}`,
        done_at: now,
      });
      impacted.push(subtask.id);
    }
    return impacted;
  }

  private restoreSubtaskStatus(dispatchStatus: string | null) {
    if (dispatchStatus === 'needs_input' || dispatchStatus === 'awaiting_choice') {
      return 'waiting_input';
    }
    if (dispatchStatus === 'running' || dispatchStatus === 'queued') {
      return 'in_progress';
    }
    return 'pending';
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
        status: 'pending',
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
        status: 'pending',
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

  private mirrorProvisioningConversationEntry(
    taskId: string,
    binding: {
      id: string;
      im_provider: string;
    },
    body: string,
  ) {
    this.taskConversationRepository.insert({
      id: randomUUID(),
      task_id: taskId,
      binding_id: binding.id,
      provider: binding.im_provider,
      direction: 'system',
      author_kind: 'system',
      author_ref: 'agora-bot',
      display_name: 'agora-bot',
      body,
      body_format: 'plain_text',
      occurred_at: new Date().toISOString(),
      metadata: {
        event_type: 'context_created',
      },
    });
  }

  private mirrorPublishedMessagesToConversation(
    taskId: string,
    binding: {
      id: string;
      im_provider: string;
    },
    messages: IMPublishMessageInput[],
  ) {
    const occurredAt = new Date().toISOString();
    for (const message of messages) {
      this.taskConversationRepository.insert({
        id: randomUUID(),
        task_id: taskId,
        binding_id: binding.id,
        provider: binding.im_provider,
        direction: 'system',
        author_kind: 'system',
        author_ref: 'agora-bot',
        display_name: 'agora-bot',
        body: message.body,
        body_format: 'plain_text',
        occurred_at: occurredAt,
        metadata: {
          event_type: message.kind ?? 'message',
          ...(message.participant_refs ? { participant_refs: message.participant_refs } : {}),
        },
      });
    }
  }

  private markParticipantBindingJoined(taskId: string, participantRef: string) {
    this.taskParticipationService?.markParticipantJoinState(taskId, participantRef, 'joined', {
      joined_at: new Date().toISOString(),
      left_at: null,
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

  private resolveLatestBusinessActivityMs(task: StoredTask) {
    const flowMs = this.flowLogRepository.listByTask(task.id)
      .filter((entry) => !entry.event.startsWith('thread_probe_'))
      .map((entry) => Date.parse(entry.created_at))
      .filter((value) => Number.isFinite(value));
    const progressMs = this.progressLogRepository.listByTask(task.id)
      .map((entry) => Date.parse(entry.created_at))
      .filter((value) => Number.isFinite(value));
    const conversationMs = this.taskConversationRepository.listByTask(task.id)
      .filter((entry) => entry.author_kind !== 'system')
      .map((entry) => Date.parse(entry.occurred_at))
      .filter((value) => Number.isFinite(value));
    return Math.max(
      Date.parse(task.updated_at),
      ...flowMs,
      ...progressMs,
      ...conversationMs,
    );
  }

  private getProbeState(taskId: string, latestActivityMs: number) {
    const flows = this.flowLogRepository.listByTask(taskId);
    const notifiedAfterActivity = (event: string) => flows.some((entry) => entry.event === event && Date.parse(entry.created_at) > latestActivityMs);
    return {
      controllerNotified: notifiedAfterActivity('thread_probe_controller'),
      rosterNotified: notifiedAfterActivity('thread_probe_roster'),
      inboxRaised: notifiedAfterActivity('thread_probe_inbox'),
    };
  }

  private requireInteractiveExecution(executionId: string) {
    if (!this.craftsmanInputPort) {
      throw new Error('Craftsman input port is not configured');
    }
    const execution = this.getCraftsmanExecution(executionId);
    const isWaiting = ['needs_input', 'awaiting_choice'].includes(execution.status);
    const isContinuousInteractive = execution.status === 'running'
      && execution.mode === 'interactive'
      && execution.session_id?.startsWith('tmux:');
    if (!isWaiting && !isContinuousInteractive) {
      throw new Error(`Craftsman execution ${executionId} is not waiting for input or running as an interactive session (status=${execution.status})`);
    }
    return {
      executionId: execution.execution_id,
      adapter: execution.adapter,
      sessionId: execution.session_id,
      taskId: execution.task_id,
      subtaskId: execution.subtask_id,
    };
  }

  private recordCraftsmanInput(
    taskId: string,
    subtaskId: string,
    executionId: string,
    inputType: 'text' | 'keys' | 'choice',
    detail: string,
  ) {
    const task = this.getTaskOrThrow(taskId);
    this.flowLogRepository.insertFlowLog({
      task_id: taskId,
      kind: 'system',
      event: 'craftsman_input_sent',
      stage_id: task.current_stage,
      detail: {
        subtask_id: subtaskId,
        execution_id: executionId,
        input_type: inputType,
        detail,
      },
      actor: 'archon',
    });
    this.mirrorConversationEntry(taskId, {
      actor: 'archon',
      body: `Craftsman input sent for ${subtaskId}`,
      metadata: {
        event_type: 'craftsman_input_sent',
        execution_id: executionId,
        subtask_id: subtaskId,
        input_type: inputType,
        detail,
      },
    });
    this.publishTaskStatusBroadcast(task, {
      kind: 'craftsman_input_sent',
      bodyLines: [
        `Craftsman input submitted for subtask ${subtaskId}.`,
        `Execution: ${executionId}`,
        `Input Type: ${inputType}`,
        ...(detail ? [`Detail: ${detail}`] : []),
        ...this.buildSmokePostInputCommands(task, executionId),
      ],
    });
  }
}

type WorkflowStageLike = NonNullable<WorkflowDto['stages']>[number];

type TaskStatusBroadcastEnvelope = {
  event_type: string;
  task_id: string;
  title: string;
  locale: TaskLocaleDto;
  task_state: string;
  current_stage: string | null;
  execution_kind: string | null;
  allowed_actions: string[];
  controller_ref: string | null;
  control_mode: 'normal' | 'smoke_test';
  workspace_path: string | null;
  participant_refs: string[] | null;
  lines: string[];
};

function resolveTaskLocale(locale: string | null | undefined): TaskLocaleDto {
  return locale === 'en-US' ? 'en-US' : 'zh-CN';
}

function taskText(task: Pick<StoredTask, 'locale'> | TaskLocaleDto, zh: string, en: string) {
  const locale = typeof task === 'string' ? task : task.locale;
  return locale === 'en-US' ? en : zh;
}

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

function resolveStageModeFromExecutionKind(executionKind: string | null) {
  if (executionKind === 'citizen_execute' || executionKind === 'craftsman_dispatch') {
    return 'execute';
  }
  if (executionKind === 'citizen_discuss' || executionKind === 'human_approval') {
    return 'discuss';
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
