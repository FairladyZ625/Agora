import type {
  HostResourceSnapshotDto,
  IApprovalRequestRepository,
  ICraftsmanExecutionRepository,
  IFlowLogRepository,
  IProgressLogRepository,
  ISubtaskRepository,
  ITaskConversationRepository,
  ITaskRepository,
  TaskConversationEntryRecord,
  TaskRecord,
  WorkflowDto,
} from '@agora-ts/contracts';
import { NotFoundError, PermissionDeniedError } from './errors.js';
import type { CraftsmanInputPort } from './craftsman-input-port.js';
import type { HostResourcePort } from './host-resource-port.js';
import type { PermissionService } from './permission-service.js';
import type { StateMachine } from './state-machine.js';
import { TaskState } from './enums.js';
import type { AgentRuntimePort } from './runtime-ports.js';
import type { TaskAuthorityService } from './task-authority-service.js';
import type { TaskContextBindingService } from './task-context-binding-service.js';
import type { TaskBroadcastService } from './task-broadcast-service.js';
import type { StageRosterService } from './stage-roster-service.js';
import { resolveControllerRef } from './team-member-kind.js';
import type { HumanReminderParticipantResolverInput } from './task-service-types.js';

const TERMINAL_SUBTASK_STATES = new Set(['done', 'failed', 'cancelled', 'archived']);
const TERMINAL_EXECUTION_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);
const SYSTEM_ECHO_ACTIVITY_WINDOW_MS = 5_000;
const CRAFTSMAN_PROBE_BACKOFF_MULTIPLIERS = [1, 3, 9] as const;

type WorkflowStageLike = NonNullable<WorkflowDto['stages']>[number];

type CraftsmanProbeState = {
  activityMs: number;
  lastProbeMs: number | null;
  attempts: number;
};

type InteractiveExecution = {
  executionId: string;
  adapter: string;
  sessionId: string | null;
  workdir: string | null;
  taskId: string;
  subtaskId: string;
};

type CraftsmanGovernanceLimits = {
  maxConcurrentRunning: number | null;
  maxConcurrentPerAgent: number | null;
  hostMemoryWarningUtilizationLimit: number | null;
  hostMemoryUtilizationLimit: number | null;
  hostSwapWarningUtilizationLimit: number | null;
  hostSwapUtilizationLimit: number | null;
  hostLoadPerCpuWarningLimit: number | null;
  hostLoadPerCpuLimit: number | null;
};

export interface TaskCoreSupportOptions {
  taskRepository: ITaskRepository;
  subtaskRepository: ISubtaskRepository;
  flowLogRepository: IFlowLogRepository;
  progressLogRepository: IProgressLogRepository;
  taskConversationRepository: ITaskConversationRepository;
  approvalRequestRepository: IApprovalRequestRepository;
  craftsmanExecutions: ICraftsmanExecutionRepository;
  taskAuthorities: Pick<TaskAuthorityService, 'getTaskAuthority'>;
  permissions: PermissionService;
  stateMachine: StateMachine;
  stageRosterService: StageRosterService;
  taskBroadcastService: TaskBroadcastService;
  agentRuntimePort: AgentRuntimePort | undefined;
  taskContextBindingService: TaskContextBindingService | undefined;
  resolveHumanReminderParticipantRefs: ((input: HumanReminderParticipantResolverInput) => string[]) | undefined;
  craftsmanInputPort: CraftsmanInputPort | undefined;
  hostResourcePort: HostResourcePort | undefined;
  isCraftsmanSessionAlive: ((sessionId: string) => boolean) | undefined;
  craftsmanGovernance: CraftsmanGovernanceLimits;
}

export class TaskCoreSupport {
  private readonly taskRepository: ITaskRepository;
  private readonly subtaskRepository: ISubtaskRepository;
  private readonly flowLogRepository: IFlowLogRepository;
  private readonly progressLogRepository: IProgressLogRepository;
  private readonly taskConversationRepository: ITaskConversationRepository;
  private readonly approvalRequestRepository: IApprovalRequestRepository;
  private readonly craftsmanExecutions: ICraftsmanExecutionRepository;
  private readonly taskAuthorities: Pick<TaskAuthorityService, 'getTaskAuthority'>;
  private readonly permissions: PermissionService;
  private readonly stateMachine: StateMachine;
  private readonly stageRosterService: StageRosterService;
  private readonly taskBroadcastService: TaskBroadcastService;
  private readonly agentRuntimePort: AgentRuntimePort | undefined;
  private readonly taskContextBindingService: TaskContextBindingService | undefined;
  private readonly resolveHumanReminderParticipantRefs:
    | ((input: HumanReminderParticipantResolverInput) => string[])
    | undefined;
  private readonly craftsmanInputPort: CraftsmanInputPort | undefined;
  private readonly hostResourcePort: HostResourcePort | undefined;
  private readonly isCraftsmanSessionAlive: ((sessionId: string) => boolean) | undefined;
  private readonly craftsmanGovernance: CraftsmanGovernanceLimits;
  readonly craftsmanProbeStateByExecution = new Map<string, CraftsmanProbeState>();

  constructor(options: TaskCoreSupportOptions) {
    this.taskRepository = options.taskRepository;
    this.subtaskRepository = options.subtaskRepository;
    this.flowLogRepository = options.flowLogRepository;
    this.progressLogRepository = options.progressLogRepository;
    this.taskConversationRepository = options.taskConversationRepository;
    this.approvalRequestRepository = options.approvalRequestRepository;
    this.craftsmanExecutions = options.craftsmanExecutions;
    this.taskAuthorities = options.taskAuthorities;
    this.permissions = options.permissions;
    this.stateMachine = options.stateMachine;
    this.stageRosterService = options.stageRosterService;
    this.taskBroadcastService = options.taskBroadcastService;
    this.agentRuntimePort = options.agentRuntimePort;
    this.taskContextBindingService = options.taskContextBindingService;
    this.resolveHumanReminderParticipantRefs = options.resolveHumanReminderParticipantRefs;
    this.craftsmanInputPort = options.craftsmanInputPort;
    this.hostResourcePort = options.hostResourcePort;
    this.isCraftsmanSessionAlive = options.isCraftsmanSessionAlive;
    this.craftsmanGovernance = options.craftsmanGovernance;
  }

  getTaskOrThrow(taskId: string): TaskRecord {
    const task = this.taskRepository.getTask(taskId);
    if (!task) {
      throw new NotFoundError(`Task ${taskId} not found`);
    }
    return task;
  }

  assertApprovalAuthority(task: TaskRecord, actorAccountId: number | null) {
    const authority = this.taskAuthorities.getTaskAuthority(task.id);
    const requiredApproverAccountId = authority?.approver_account_id ?? null;
    if (requiredApproverAccountId == null) {
      return;
    }
    if (actorAccountId == null || actorAccountId !== requiredApproverAccountId) {
      throw new PermissionDeniedError(`task ${task.id} requires approver account ${requiredApproverAccountId}`);
    }
  }

  getCurrentStageOrThrow(task: TaskRecord) {
    if (!task.current_stage) {
      throw new Error(`Task ${task.id} has no current_stage set`);
    }
    return this.stateMachine.getCurrentStage(task.workflow, task.current_stage);
  }

  assertTaskActive(task: TaskRecord) {
    if (task.state !== TaskState.ACTIVE) {
      throw new Error(`Task ${task.id} is in state '${task.state}', expected 'active'`);
    }
  }

  assertStageRosterAction(
    task: TaskRecord,
    stage: WorkflowStageLike,
    callerId: string,
    action: 'advance' | 'approve' | 'reject' | 'confirm' | 'archon-approve' | 'archon-reject',
  ) {
    const controllerRef = resolveControllerRef(task.team.members);
    if (this.permissions.isArchon(callerId) || (controllerRef !== null && callerId === controllerRef)) {
      return;
    }
    const desiredRefs = this.stageRosterService.resolveDesiredRefs(task.team, stage);
    if (desiredRefs.includes(callerId)) {
      return;
    }
    throw new PermissionDeniedError(`caller ${callerId} is outside current stage roster for ${action}`);
  }

  getSubtaskOrThrow(taskId: string, subtaskId: string) {
    const subtask = this.subtaskRepository.listByTask(taskId).find((item) => item.id === subtaskId);
    if (!subtask) {
      throw new NotFoundError(`Subtask ${subtaskId} not found in task ${taskId}`);
    }
    return subtask;
  }

  assertSubtaskControl(task: TaskRecord, subtask: { id: string; assignee: string }, callerId: string) {
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

  assertTaskRuntimeControl(task: TaskRecord, callerId: string, action: string) {
    const controllerRef = resolveControllerRef(task.team.members);
    const allowed = this.permissions.isArchon(callerId)
      || (controllerRef !== null && callerId === controllerRef);
    if (!allowed) {
      throw new PermissionDeniedError(
        `${callerId} cannot request ${action} (controller=${controllerRef ?? '-'})`,
      );
    }
  }

  resolveTaskRuntimeParticipant(task: TaskRecord, agentRef: string) {
    const member = task.team.members.find((item) => item.agentId === agentRef);
    if (!member) {
      throw new NotFoundError(`Agent ${agentRef} is not part of task ${task.id}`);
    }
    return this.agentRuntimePort?.resolveAgent(agentRef) ?? {
      agent_ref: agentRef,
      runtime_provider: null,
      runtime_actor_ref: null,
    };
  }

  assertCraftsmanDispatchAllowed(assignee: string, additionalPlanned = 1) {
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

  assertCraftsmanInteractionGuard(
    mode: 'one_shot' | 'interactive',
    interactionExpectation: 'one_shot' | 'needs_input' | 'awaiting_choice',
    scope: string,
  ) {
    if (mode === 'one_shot' && interactionExpectation !== 'one_shot') {
      throw new Error(
        `${scope} declares interaction_expectation='${interactionExpectation}', but execution_mode='one_shot' only supports one-pass runs. Use execution_mode='interactive' for continued input or menu loops.`,
      );
    }
  }

  resolveHostPressureStatus(snapshot: HostResourceSnapshotDto | null) {
    if (!snapshot) {
      return 'unavailable' as const;
    }
    const memorySignal = snapshot.platform === 'darwin' && snapshot.memory_pressure != null
      ? snapshot.memory_pressure
      : snapshot.memory_utilization;
    if (memorySignal != null && this.craftsmanGovernance.hostMemoryUtilizationLimit != null && memorySignal > this.craftsmanGovernance.hostMemoryUtilizationLimit) {
      return 'hard_limit' as const;
    }
    if (
      snapshot.platform !== 'darwin'
      && snapshot.swap_utilization != null
      && this.craftsmanGovernance.hostSwapUtilizationLimit != null
      && snapshot.swap_utilization > this.craftsmanGovernance.hostSwapUtilizationLimit
    ) {
      return 'hard_limit' as const;
    }
    const loadPerCpu = snapshot.load_1m != null && snapshot.cpu_count != null && snapshot.cpu_count > 0
      ? snapshot.load_1m / snapshot.cpu_count
      : null;
    if (
      loadPerCpu != null
      && this.craftsmanGovernance.hostLoadPerCpuLimit != null
      && loadPerCpu > this.craftsmanGovernance.hostLoadPerCpuLimit
    ) {
      return 'hard_limit' as const;
    }
    if (
      memorySignal != null
      && this.craftsmanGovernance.hostMemoryWarningUtilizationLimit != null
      && memorySignal > this.craftsmanGovernance.hostMemoryWarningUtilizationLimit
    ) {
      return 'warning' as const;
    }
    if (
      snapshot.platform !== 'darwin'
      && snapshot.swap_utilization != null
      && this.craftsmanGovernance.hostSwapWarningUtilizationLimit != null
      && snapshot.swap_utilization > this.craftsmanGovernance.hostSwapWarningUtilizationLimit
    ) {
      return 'warning' as const;
    }
    if (
      loadPerCpu != null
      && this.craftsmanGovernance.hostLoadPerCpuWarningLimit != null
      && loadPerCpu > this.craftsmanGovernance.hostLoadPerCpuWarningLimit
    ) {
      return 'warning' as const;
    }
    return 'healthy' as const;
  }

  buildHostGovernanceWarnings(snapshot: HostResourceSnapshotDto | null) {
    if (!snapshot) {
      return [];
    }
    const warnings: string[] = [];
    const memorySignal = snapshot.platform === 'darwin' && snapshot.memory_pressure != null
      ? snapshot.memory_pressure
      : snapshot.memory_utilization;
    if (
      memorySignal != null
      && this.craftsmanGovernance.hostMemoryWarningUtilizationLimit != null
      && memorySignal > this.craftsmanGovernance.hostMemoryWarningUtilizationLimit
    ) {
      const label = snapshot.platform === 'darwin' && snapshot.memory_pressure != null
        ? 'memory pressure'
        : 'memory utilization';
      warnings.push(`Host ${label} warning: ${memorySignal.toFixed(2)}`);
    }
    if (
      snapshot.platform !== 'darwin'
      && snapshot.swap_utilization != null
      && this.craftsmanGovernance.hostSwapWarningUtilizationLimit != null
      && snapshot.swap_utilization > this.craftsmanGovernance.hostSwapWarningUtilizationLimit
    ) {
      warnings.push(`Host swap warning: ${snapshot.swap_utilization.toFixed(2)}`);
    }
    const loadPerCpu = snapshot.load_1m != null && snapshot.cpu_count != null && snapshot.cpu_count > 0
      ? snapshot.load_1m / snapshot.cpu_count
      : null;
    if (
      loadPerCpu != null
      && this.craftsmanGovernance.hostLoadPerCpuWarningLimit != null
      && loadPerCpu > this.craftsmanGovernance.hostLoadPerCpuWarningLimit
    ) {
      warnings.push(`Host load-per-cpu warning: ${loadPerCpu.toFixed(2)}`);
    }
    return warnings;
  }

  failMissingCraftsmanSessions(
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

  failMissingCraftsmanSessionsOnResume(taskId: string) {
    if (!this.isCraftsmanSessionAlive) {
      return;
    }
    this.failMissingCraftsmanSessions(taskId, {
      event: 'craftsman_session_missing_on_resume',
      messagePrefix: 'Craftsman session not alive on resume',
    });
  }

  resolveLatestBusinessActivityMs(task: TaskRecord) {
    const escalationEvents = new Set(['controller_pinged', 'roster_pinged', 'human_approval_pinged', 'inbox_escalated']);
    const conversationEntries = this.taskConversationRepository.listByTask(task.id);
    const systemEchoTimesByKey = new Map<string, number[]>();
    for (const entry of conversationEntries) {
      if (entry.author_kind !== 'system') {
        continue;
      }
      const occurredAtMs = parseTimestamp(entry.occurred_at);
      if (!Number.isFinite(occurredAtMs)) {
        continue;
      }
      const key = buildConversationEchoKey(entry);
      const existing = systemEchoTimesByKey.get(key);
      if (existing) {
        existing.push(occurredAtMs);
      } else {
        systemEchoTimesByKey.set(key, [occurredAtMs]);
      }
    }
    const flowMs = this.flowLogRepository.listByTask(task.id)
      .filter((entry) => !escalationEvents.has(entry.event))
      .map((entry) => parseTimestamp(entry.created_at))
      .filter((value) => Number.isFinite(value));
    const progressMs = this.progressLogRepository.listByTask(task.id)
      .map((entry) => parseTimestamp(entry.created_at))
      .filter((value) => Number.isFinite(value));
    const conversationMs = conversationEntries
      .filter((entry) => entry.author_kind !== 'system')
      .filter((entry) => !isSystemEchoConversationEntry(entry, systemEchoTimesByKey))
      .map((entry) => parseTimestamp(entry.occurred_at))
      .filter((value) => Number.isFinite(value));
    return Math.max(
      parseTimestamp(task.updated_at),
      ...flowMs,
      ...progressMs,
      ...conversationMs,
    );
  }

  getProbeState(taskId: string, latestActivityMs: number) {
    const flows = this.flowLogRepository.listByTask(taskId);
    const notifiedAfterActivity = (event: string) => flows.some((entry) => entry.event === event && parseTimestamp(entry.created_at) > latestActivityMs);
    return {
      controllerNotified: notifiedAfterActivity('controller_pinged'),
      rosterNotified: notifiedAfterActivity('roster_pinged'),
      humanApprovalNotified: notifiedAfterActivity('human_approval_pinged'),
      inboxRaised: notifiedAfterActivity('inbox_escalated'),
    };
  }

  resolveApprovalWaitProbe(task: TaskRecord) {
    if (!task.current_stage) {
      return null;
    }
    const request = this.approvalRequestRepository.getLatestPending(task.id, task.current_stage);
    if (request) {
      if (request.gate_type !== 'approval' && request.gate_type !== 'archon_review') {
        return null;
      }
    } else {
      const stage = task.workflow?.stages?.find((candidate) => candidate.id === task.current_stage);
      const gateType = stage?.gate?.type;
      if (gateType !== 'approval') {
        return null;
      }
    }
    const provider = this.taskContextBindingService?.getLatestBinding(task.id)?.im_provider;
    const participantRefs = provider && this.resolveHumanReminderParticipantRefs
      ? Array.from(new Set(
          this.resolveHumanReminderParticipantRefs({
            task,
            provider,
            reason: 'approval_waiting',
          }).filter((participantRef) => participantRef.trim().length > 0),
        ))
      : [];
    return {
      request: request ?? null,
      participantRefs,
    };
  }

  getCraftsmanProbeState(executionId: string, latestActivityMs: number): CraftsmanProbeState {
    const current = this.craftsmanProbeStateByExecution.get(executionId);
    if (!current || current.activityMs !== latestActivityMs) {
      const resetState: CraftsmanProbeState = {
        activityMs: latestActivityMs,
        lastProbeMs: null,
        attempts: 0,
      };
      this.craftsmanProbeStateByExecution.set(executionId, resetState);
      return resetState;
    }
    return current;
  }

  noteCraftsmanAutoProbe(executionId: string, latestActivityMs: number, nowMs: number) {
    this.craftsmanProbeStateByExecution.set(executionId, {
      activityMs: latestActivityMs,
      lastProbeMs: nowMs,
      attempts: (this.craftsmanProbeStateByExecution.get(executionId)?.attempts ?? 0) + 1,
    });
  }

  shouldProbeCraftsmanExecution(nowMs: number, thresholdMs: number, probeState: CraftsmanProbeState) {
    if (probeState.attempts === 0 || probeState.lastProbeMs === null) {
      return true;
    }
    const multiplierIndex = Math.min(
      probeState.attempts - 1,
      CRAFTSMAN_PROBE_BACKOFF_MULTIPLIERS.length - 1,
    );
    const cooldownMs = thresholdMs * CRAFTSMAN_PROBE_BACKOFF_MULTIPLIERS[multiplierIndex]!;
    return nowMs - probeState.lastProbeMs >= cooldownMs;
  }

  requireInteractiveExecution(executionId: string): InteractiveExecution {
    if (!this.craftsmanInputPort) {
      throw new Error('Craftsman input port is not configured');
    }
    const execution = this.craftsmanExecutions.getExecution(executionId);
    if (!execution) {
      throw new NotFoundError(`Craftsman execution ${executionId} not found`);
    }
    const isWaiting = ['needs_input', 'awaiting_choice'].includes(execution.status);
    const isContinuousInteractive = execution.status === 'running'
      && execution.mode === 'interactive'
      && execution.session_id !== null;
    if (!isWaiting && !isContinuousInteractive) {
      throw new Error(`Craftsman execution ${executionId} is not waiting for input or running as an interactive session (status=${execution.status})`);
    }
    return {
      executionId: execution.execution_id,
      adapter: execution.adapter,
      sessionId: execution.session_id,
      workdir: execution.workdir,
      taskId: execution.task_id,
      subtaskId: execution.subtask_id,
    };
  }

  recordCraftsmanInput(
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
    this.taskBroadcastService.publishCraftsmanInputUpdate({
      task,
      actor: 'archon',
      subtaskId,
      executionId,
      inputType,
      detail,
    });
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
    const memoryPressure = snapshot.memory_pressure ?? null;
    const useDarwinPressure = snapshot.platform === 'darwin' && memoryPressure !== null;
    if (
      memoryLimit !== null
      && useDarwinPressure
      && memoryPressure !== null
      && memoryPressure > memoryLimit
    ) {
      throw new Error(`Host memory pressure ${memoryPressure.toFixed(2)} exceeds limit ${memoryLimit.toFixed(2)}`);
    }
    if (
      memoryLimit !== null
      && !useDarwinPressure
      && snapshot.memory_utilization !== null
      && snapshot.memory_utilization > memoryLimit
    ) {
      throw new Error(`Host memory utilization ${snapshot.memory_utilization.toFixed(2)} exceeds limit ${memoryLimit.toFixed(2)}`);
    }
    const swapLimit = this.craftsmanGovernance.hostSwapUtilizationLimit;
    if (
      !useDarwinPressure
      && swapLimit !== null
      && snapshot.swap_utilization !== null
      && snapshot.swap_utilization > swapLimit
    ) {
      throw new Error(`Host swap utilization ${snapshot.swap_utilization.toFixed(2)} exceeds limit ${swapLimit.toFixed(2)}`);
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
      throw new Error(`Host load-per-cpu ${normalizedLoad.toFixed(2)} exceeds limit ${loadLimit.toFixed(2)}`);
    }
  }

  private isSubtaskRunning(status: string, dispatchStatus: string | null) {
    return status === 'in_progress'
      || status === 'waiting_input'
      || dispatchStatus === 'running'
      || dispatchStatus === 'needs_input'
      || dispatchStatus === 'awaiting_choice';
  }
}

function parseTimestamp(value: string | null | undefined) {
  if (!value) {
    return Number.NaN;
  }
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)) {
    return Date.parse(value.replace(' ', 'T') + 'Z');
  }
  return Date.parse(value);
}

function buildConversationEchoKey(entry: Pick<TaskConversationEntryRecord, 'provider' | 'body'>) {
  return `${entry.provider}\u0000${entry.body}`;
}

function isSystemEchoConversationEntry(
  entry: TaskConversationEntryRecord,
  systemEchoTimesByKey: Map<string, number[]>,
) {
  const occurredAtMs = parseTimestamp(entry.occurred_at);
  if (!Number.isFinite(occurredAtMs)) {
    return false;
  }
  const candidates = systemEchoTimesByKey.get(buildConversationEchoKey(entry));
  if (!candidates || candidates.length === 0) {
    return false;
  }
  return candidates.some((systemOccurredAtMs) => Math.abs(systemOccurredAtMs - occurredAtMs) <= SYSTEM_ECHO_ACTIVITY_WINDOW_MS);
}
