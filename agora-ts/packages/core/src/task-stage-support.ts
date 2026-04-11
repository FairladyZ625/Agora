import { join } from 'node:path';
import type {
  DatabasePort,
  IApprovalRequestRepository,
  IArchiveJobRepository,
  ICraftsmanExecutionRepository,
  IFlowLogRepository,
  IProgressLogRepository,
  ISubtaskRepository,
  ITaskRepository,
  TaskRecord,
  WorkflowDto,
} from '@agora-ts/contracts';
import type { IMPublishMessageInput } from './im-ports.js';
import { TaskState } from './enums.js';
import type { TaskBroadcastService } from './task-broadcast-service.js';
import type { TaskBrainBindingService } from './task-brain-binding-service.js';
import type { ProjectContextWriter } from './project-context-writer.js';
import type { ProjectNomosAuthoringPort } from './project-nomos-authoring-port.js';
import type { TaskParticipantSyncService } from './task-participant-sync-service.js';
import { resolveControllerRef } from './team-member-kind.js';

const TERMINAL_SUBTASK_STATES = new Set(['done', 'failed', 'cancelled', 'archived']);
const TERMINAL_EXECUTION_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);

type WorkflowStageLike = NonNullable<WorkflowDto['stages']>[number];

type UpdateTaskStateOptionsLike = {
  reason: string;
  action?: 'retry' | 'skip' | 'reassign';
  assignee?: string;
  craftsman_type?: string;
};

export interface TaskStageSupportOptions {
  databasePort: DatabasePort;
  taskRepository: ITaskRepository;
  flowLogRepository: IFlowLogRepository;
  progressLogRepository: IProgressLogRepository;
  subtaskRepository: ISubtaskRepository;
  archiveJobRepository: IArchiveJobRepository;
  approvalRequestRepository: IApprovalRequestRepository;
  craftsmanExecutions: ICraftsmanExecutionRepository;
  taskBroadcastService: TaskBroadcastService;
  taskParticipantSyncService: TaskParticipantSyncService;
  taskBrainBindingService: TaskBrainBindingService | undefined;
  projectContextWriter: ProjectContextWriter;
  projectNomosAuthoringPort: ProjectNomosAuthoringPort | undefined;
}

export class TaskStageSupport {
  private readonly db: DatabasePort;
  private readonly taskRepository: ITaskRepository;
  private readonly flowLogRepository: IFlowLogRepository;
  private readonly progressLogRepository: IProgressLogRepository;
  private readonly subtaskRepository: ISubtaskRepository;
  private readonly archiveJobRepository: IArchiveJobRepository;
  private readonly approvalRequestRepository: IApprovalRequestRepository;
  private readonly craftsmanExecutions: ICraftsmanExecutionRepository;
  private readonly taskBroadcastService: TaskBroadcastService;
  private readonly taskParticipantSyncService: TaskParticipantSyncService;
  private readonly taskBrainBindingService: TaskBrainBindingService | undefined;
  private readonly projectContextWriter: ProjectContextWriter;
  private readonly projectNomosAuthoringPort: ProjectNomosAuthoringPort | undefined;

  constructor(options: TaskStageSupportOptions) {
    this.db = options.databasePort;
    this.taskRepository = options.taskRepository;
    this.flowLogRepository = options.flowLogRepository;
    this.progressLogRepository = options.progressLogRepository;
    this.subtaskRepository = options.subtaskRepository;
    this.archiveJobRepository = options.archiveJobRepository;
    this.approvalRequestRepository = options.approvalRequestRepository;
    this.craftsmanExecutions = options.craftsmanExecutions;
    this.taskBroadcastService = options.taskBroadcastService;
    this.taskParticipantSyncService = options.taskParticipantSyncService;
    this.taskBrainBindingService = options.taskBrainBindingService;
    this.projectContextWriter = options.projectContextWriter;
    this.projectNomosAuthoringPort = options.projectNomosAuthoringPort;
  }

  publishGateDecisionBroadcast(
    task: TaskRecord,
    input: {
      decision: 'approved' | 'rejected';
      reviewer: string;
      gateType: 'approval' | 'archon_review';
      comment?: string;
      reason?: string;
    },
  ) {
    this.taskBroadcastService.publishGateDecisionBroadcast(task, input);
  }

  materializeTaskCloseRecap(task: TaskRecord, actor: string, reason?: string) {
    if (!task.project_id || !this.taskBrainBindingService) {
      return;
    }
    const binding = this.taskBrainBindingService.getActiveBinding(task.id);
    if (!binding) {
      return;
    }
    const proposal = this.projectContextWriter.buildTaskCloseoutProposal({
      task,
      binding,
      actor,
      ...(reason ? { reason } : {}),
    });
    this.projectContextWriter.applyTaskCloseoutProposal(proposal);
  }

  ensureApprovalRequestForGate(
    task: TaskRecord,
    stage: NonNullable<TaskRecord['workflow']['stages']>[number],
    requester: string,
  ) {
    const gateType = stage.gate?.type;
    if (gateType !== 'approval' && gateType !== 'archon_review') {
      return null;
    }
    const existing = this.approvalRequestRepository.getLatestPending(task.id, stage.id);
    if (existing) {
      return {
        request: existing,
        shouldBroadcast: false,
      };
    }
    const brainBinding = this.taskBrainBindingService?.getActiveBinding(task.id) ?? null;
    return {
      request: this.approvalRequestRepository.insert({
        task_id: task.id,
        stage_id: stage.id,
        gate_type: gateType,
        requested_by: requester,
        summary_path: brainBinding ? join(brainBinding.workspace_path, '00-current.md') : null,
        metadata: {
          controller_ref: resolveControllerRef(task.team.members),
          current_stage: task.current_stage,
          waiting_broadcasted_at: new Date().toISOString(),
        },
      }),
      shouldBroadcast: true,
    };
  }

  resolvePendingApprovalRequest(
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

  publishTaskStateBroadcast(
    task: TaskRecord,
    fromState: TaskState,
    toState: TaskState,
    reason?: string,
  ) {
    this.taskBroadcastService.publishTaskStateBroadcast(task, fromState, toState, reason);
  }

  publishControllerCloseoutReminder(task: TaskRecord, archiveJob: { payload?: unknown }) {
    const closeout = (archiveJob.payload as Record<string, unknown> | null)?.closeout_review as Record<string, unknown> | undefined;
    const workspacePath = typeof closeout?.workspace_path === 'string' ? closeout.workspace_path : null;
    const harvestDraftPath = typeof closeout?.harvest_draft_path === 'string' ? closeout.harvest_draft_path : null;
    const nomosRuntime = closeout?.nomos_runtime && typeof closeout.nomos_runtime === 'object'
      ? closeout.nomos_runtime as Record<string, unknown>
      : null;
    const closeoutPromptPath = typeof nomosRuntime?.closeout_review_prompt_path === 'string'
      ? nomosRuntime.closeout_review_prompt_path
      : null;
    this.taskBroadcastService.publishControllerCloseoutReminder(task, {
      workspacePath,
      harvestDraftPath,
      closeoutPromptPath,
    });
  }

  publishTaskStatusBroadcast(
    task: TaskRecord,
    input: {
      kind: string;
      bodyLines: string[];
      participantRefs?: string[];
      occurredAt?: string;
      ensureParticipantRefsJoined?: string[];
    },
  ) {
    this.taskBroadcastService.publishTaskStatusBroadcast(task, input);
  }

  buildSmokeStageEntryCommands(task: TaskRecord, stage: WorkflowStageLike): string[] {
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
      '- Every subtask must declare `execution_target` explicitly: use `craftsman` for auto-dispatch or `manual` for purely human/agent work.',
      '- In smoke mode, craftsman-capable stages should use `execution_target: "craftsman"` plus a full `craftsman` block.',
    ];
  }

  buildSmokeSubtaskCommands(
    task: TaskRecord,
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
      lines.push('- No execution was auto-dispatched. If this was supposed to be a craftsman run, recreate the subtask with `execution_target: "craftsman"` and a full `craftsman` block.');
    }
    return lines;
  }

  sendImmediateCraftsmanNotification(taskId: string, executionId: string, subtaskId: string) {
    const task = this.taskRepository.getTask(taskId);
    if (!task) {
      return;
    }
    const execution = this.craftsmanExecutions.getExecution(executionId);
    const subtask = this.subtaskRepository.listByTask(taskId).find((item) => item.id === subtaskId);
    if (!execution || !subtask) {
      return;
    }
    this.taskBroadcastService.publishCraftsmanExecutionUpdate({
      task,
      subtask,
      execution,
    });
  }

  getApproverRole(stage: NonNullable<TaskRecord['workflow']['stages']>[number]) {
    const raw = stage.gate?.approver_role ?? stage.gate?.approver;
    return typeof raw === 'string' && raw.length > 0 ? raw : 'reviewer';
  }

  buildSchedulerSnapshot(task: TaskRecord, reason: string) {
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

  applyStateTransitionSideEffects(task: TaskRecord, newState: TaskState, options: UpdateTaskStateOptionsLike) {
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

  buildStateChangeDetail(options: UpdateTaskStateOptionsLike, actionDetail?: Record<string, unknown>) {
    const detail: Record<string, unknown> = {};
    if (options.reason) {
      detail.reason = options.reason;
    }
    if (actionDetail) {
      Object.assign(detail, actionDetail);
    }
    return Object.keys(detail).length > 0 ? detail : undefined;
  }

  cancelOpenWork(taskId: string, reason: string) {
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

  archiveOpenSubtasks(taskId: string, reason: string) {
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

  resumeArchivedSubtasks(task: TaskRecord) {
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

  reconcileStageExitSubtasks(
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

  retryFailedSubtasks(task: TaskRecord) {
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

  skipFailedSubtasks(task: TaskRecord, reason: string) {
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

  reassignFailedSubtasks(task: TaskRecord, assignee: string, craftsmanType?: string) {
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

  ensureArchiveJobForTask(taskId: string) {
    const existing = this.archiveJobRepository.listArchiveJobs({ taskId });
    if (existing.length > 0) {
      return existing[0]!;
    }

    const task = this.taskRepository.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    const binding = this.taskBrainBindingService?.getActiveBinding(task.id);
    const nomosRuntime = task.project_id && this.projectNomosAuthoringPort?.resolveProjectNomosRuntimeContext
      ? this.projectNomosAuthoringPort.resolveProjectNomosRuntimeContext(task.project_id)
      : null;
    return this.archiveJobRepository.insertArchiveJob({
      task_id: task.id,
      status: 'pending',
      target_path: this.buildArchiveTargetPath(task),
      payload: {
        task_id: task.id,
        title: task.title,
        type: task.type,
        state: task.state,
        ...(task.project_id ? { project_id: task.project_id } : {}),
        closeout_review: {
          required: true,
          state: 'advisory',
          task_state: task.state,
          candidate_updates: [
            ...(task.project_id ? [{
              kind: 'recap',
              slug: task.id,
              project_id: task.project_id,
            }] : []),
          ],
          ...(binding?.workspace_path ? { workspace_path: binding.workspace_path } : {}),
          ...(binding?.workspace_path ? { harvest_draft_path: join(binding.workspace_path, '07-outputs', 'project-harvest-draft.md') } : {}),
          ...(nomosRuntime ? { nomos_runtime: nomosRuntime } : {}),
        },
      },
      writer_agent: 'writer-agent',
    });
  }

  getStateActionEvent(fromState: TaskState, toState: TaskState): string | null {
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

  buildStateConversationBody(
    fromState: TaskState,
    toState: TaskState,
    options: UpdateTaskStateOptionsLike,
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

  syncImContextForTaskState(
    taskId: string,
    fromState: TaskState,
    toState: TaskState,
    reason?: string,
    onSuccess?: () => void,
  ) {
    this.taskBroadcastService.syncImContextForTaskState(taskId, fromState, toState, reason, onSuccess);
  }

  describeGateState(stage: WorkflowStageLike | null) {
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

  mirrorConversationEntry(
    taskId: string,
    input: {
      actor: string | null;
      body: string;
      metadata?: Record<string, unknown>;
      occurredAt?: string;
    },
  ) {
    this.taskBroadcastService.mirrorConversationEntry(taskId, input);
  }

  mirrorProvisioningConversationEntry(
    taskId: string,
    binding: {
      id: string;
      im_provider: string;
    },
    body: string,
  ) {
    this.taskBroadcastService.mirrorProvisioningConversationEntry(taskId, binding, body);
  }

  mirrorPublishedMessagesToConversation(
    taskId: string,
    binding: {
      id: string;
      im_provider: string;
    },
    messages: IMPublishMessageInput[],
  ) {
    this.taskBroadcastService.mirrorPublishedMessagesToConversation(taskId, binding, messages);
  }

  reconcileStageParticipants(task: TaskRecord, stage: WorkflowStageLike | null) {
    this.taskParticipantSyncService.reconcileStageParticipants(task, stage);
  }

  enterStage(taskId: string, stageId: string) {
    this.db.prepare(`
      INSERT INTO stage_history (task_id, stage_id)
      VALUES (?, ?)
    `).run(taskId, stageId);
  }

  exitStage(taskId: string, stageId: string, reason: string) {
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

  private restoreSubtaskStatus(dispatchStatus: string | null) {
    if (dispatchStatus === 'needs_input' || dispatchStatus === 'awaiting_choice') {
      return 'waiting_input';
    }
    if (dispatchStatus === 'running' || dispatchStatus === 'queued') {
      return 'in_progress';
    }
    return 'pending';
  }

  private buildArchiveTargetPath(task: TaskRecord) {
    return `ZeYu-AI-Brain/agora/${task.id}-${slugify(task.title)}.md`;
  }
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

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'task';
}
