import type {
  DatabasePort,
  IFlowLogRepository,
  IInboxRepository,
  ITaskContextBindingRepository,
  ITaskRepository,
  LiveSessionDto,
  RuntimeDiagnosisResultDto,
  RuntimeRecoveryActionDto,
  RuntimeRecoveryRequestDto,
  TaskRecord,
  UnifiedHealthSnapshotDto,
} from '@agora-ts/contracts';
import { TaskState } from './enums.js';
import type { RuntimeRecoveryPort } from './runtime-recovery-port.js';
import { isInteractiveParticipant, resolveControllerRef } from './team-member-kind.js';

type EscalationPolicy = {
  controllerAfterMs: number;
  rosterAfterMs: number;
  inboxAfterMs: number;
};

type ApprovalWaitProbe = {
  request: {
    id: string;
  };
  participantRefs: string[];
} | null;

interface InactiveTaskProbeOptions {
  controllerAfterMs?: number;
  rosterAfterMs?: number;
  inboxAfterMs?: number;
  now?: Date;
}

interface InactiveTaskProbeResult {
  scanned_tasks: number;
  controller_pings: number;
  roster_pings: number;
  human_pings: number;
  inbox_items: number;
}

interface StartupRecoveryScanResult {
  scanned_tasks: number;
  blocked_tasks: number;
  failed_subtasks: number;
  failed_executions: number;
}

type TaskStatusBroadcastInput = {
  kind: string;
  participantRefs?: string[];
  ensureParticipantRefsJoined?: string[];
  bodyLines: string[];
};

type MirrorConversationInput = {
  actor: string;
  body: string;
  metadata?: Record<string, unknown>;
};

type GovernanceSnapshot = {
  active_executions: number;
  active_by_assignee: Array<{ assignee: string; count: number }>;
  active_execution_details: Array<{
    execution_id: string;
    task_id: string;
    subtask_id: string;
    assignee: string;
    adapter: string;
    status: string;
    session_id: string | null;
    workdir: string | null;
  }>;
  host_pressure_status: string;
  warnings: string[];
  host: UnifiedHealthSnapshotDto['host']['snapshot'];
};

export interface TaskRecoveryServiceOptions {
  databasePort: DatabasePort;
  taskRepository: ITaskRepository;
  taskContextBindingRepository: ITaskContextBindingRepository;
  flowLogRepository: IFlowLogRepository;
  inboxRepository: IInboxRepository;
  escalationPolicy: EscalationPolicy;
  runtimeRecoveryPort?: RuntimeRecoveryPort | undefined;
  listLiveSessions?: (() => LiveSessionDto[]) | undefined;
  getRuntimeStaleAfterMs?: (() => number | null) | undefined;
  getCraftsmanGovernanceSnapshot: () => GovernanceSnapshot;
  assertTaskRuntimeControl: (task: TaskRecord, callerId: string, action: string) => void;
  resolveTaskRuntimeParticipant: (
    task: TaskRecord,
    agentRef: string,
  ) => { runtime_provider: string | null; runtime_actor_ref: string | null };
  getCraftsmanExecution: (executionId: string) => {
    execution_id: string;
    task_id: string;
    subtask_id: string;
    adapter: string;
    session_id: string | null;
    workdir: string | null;
    status: string;
  };
  getSubtaskOrThrow: (taskId: string, subtaskId: string) => { id: string; assignee: string; stage_id: string };
  assertSubtaskControl: (task: TaskRecord, subtask: { id: string; assignee: string }, callerId: string) => void;
  publishTaskStatusBroadcast: (task: TaskRecord, input: TaskStatusBroadcastInput) => void;
  mirrorConversationEntry: (taskId: string, input: MirrorConversationInput) => void;
  buildSchedulerSnapshot: (task: TaskRecord, reason: string) => TaskRecord['scheduler_snapshot'];
  failMissingCraftsmanSessions: (
    taskId: string,
    options: { event: string; messagePrefix: string },
  ) => Array<{ subtask_id: string; execution_ids: string[] }>;
  resolveLatestBusinessActivityMs: (task: TaskRecord) => number;
  getProbeState: (
    taskId: string,
    latestActivityMs: number,
  ) => {
    controllerNotified: boolean;
    rosterNotified: boolean;
    humanApprovalNotified: boolean;
    inboxRaised: boolean;
  };
  resolveApprovalWaitProbe: (task: TaskRecord) => ApprovalWaitProbe;
}

export class TaskRecoveryService {
  private readonly db: DatabasePort;
  private readonly taskRepository: ITaskRepository;
  private readonly taskContextBindingRepository: ITaskContextBindingRepository;
  private readonly flowLogRepository: IFlowLogRepository;
  private readonly inboxRepository: IInboxRepository;
  private readonly escalationPolicy: EscalationPolicy;
  private readonly runtimeRecoveryPort: RuntimeRecoveryPort | undefined;
  private readonly listLiveSessions: (() => LiveSessionDto[]) | undefined;
  private readonly getRuntimeStaleAfterMs: (() => number | null) | undefined;
  private readonly getCraftsmanGovernanceSnapshot: () => GovernanceSnapshot;
  private readonly assertTaskRuntimeControl: TaskRecoveryServiceOptions['assertTaskRuntimeControl'];
  private readonly resolveTaskRuntimeParticipant: TaskRecoveryServiceOptions['resolveTaskRuntimeParticipant'];
  private readonly getCraftsmanExecution: TaskRecoveryServiceOptions['getCraftsmanExecution'];
  private readonly getSubtaskOrThrow: TaskRecoveryServiceOptions['getSubtaskOrThrow'];
  private readonly assertSubtaskControl: TaskRecoveryServiceOptions['assertSubtaskControl'];
  private readonly publishTaskStatusBroadcast: (task: TaskRecord, input: TaskStatusBroadcastInput) => void;
  private readonly mirrorConversationEntry: (taskId: string, input: MirrorConversationInput) => void;
  private readonly buildSchedulerSnapshot: (task: TaskRecord, reason: string) => TaskRecord['scheduler_snapshot'];
  private readonly failMissingCraftsmanSessions: TaskRecoveryServiceOptions['failMissingCraftsmanSessions'];
  private readonly resolveLatestBusinessActivityMs: (task: TaskRecord) => number;
  private readonly getProbeState: TaskRecoveryServiceOptions['getProbeState'];
  private readonly resolveApprovalWaitProbe: (task: TaskRecord) => ApprovalWaitProbe;

  constructor(options: TaskRecoveryServiceOptions) {
    this.db = options.databasePort;
    this.taskRepository = options.taskRepository;
    this.taskContextBindingRepository = options.taskContextBindingRepository;
    this.flowLogRepository = options.flowLogRepository;
    this.inboxRepository = options.inboxRepository;
    this.escalationPolicy = options.escalationPolicy;
    this.runtimeRecoveryPort = options.runtimeRecoveryPort;
    this.listLiveSessions = options.listLiveSessions;
    this.getRuntimeStaleAfterMs = options.getRuntimeStaleAfterMs;
    this.getCraftsmanGovernanceSnapshot = options.getCraftsmanGovernanceSnapshot;
    this.assertTaskRuntimeControl = options.assertTaskRuntimeControl;
    this.resolveTaskRuntimeParticipant = options.resolveTaskRuntimeParticipant;
    this.getCraftsmanExecution = options.getCraftsmanExecution;
    this.getSubtaskOrThrow = options.getSubtaskOrThrow;
    this.assertSubtaskControl = options.assertSubtaskControl;
    this.publishTaskStatusBroadcast = options.publishTaskStatusBroadcast;
    this.mirrorConversationEntry = options.mirrorConversationEntry;
    this.buildSchedulerSnapshot = options.buildSchedulerSnapshot;
    this.failMissingCraftsmanSessions = options.failMissingCraftsmanSessions;
    this.resolveLatestBusinessActivityMs = options.resolveLatestBusinessActivityMs;
    this.getProbeState = options.getProbeState;
    this.resolveApprovalWaitProbe = options.resolveApprovalWaitProbe;
  }

  getHealthSnapshot(): UnifiedHealthSnapshotDto {
    const generatedAt = new Date().toISOString();
    const tasks = this.taskRepository.listTasks();
    const taskCounts = {
      total_tasks: tasks.length,
      active_tasks: tasks.filter((task) => task.state === 'active').length,
      paused_tasks: tasks.filter((task) => task.state === 'paused').length,
      blocked_tasks: tasks.filter((task) => task.state === 'blocked').length,
      done_tasks: tasks.filter((task) => task.state === 'done').length,
    };

    const activeBindings = tasks
      .map((task) => this.taskContextBindingRepository.getActiveByTask(task.id))
      .filter((binding): binding is NonNullable<typeof binding> => binding !== null);
    const bindingsByProvider = Array.from(
      activeBindings.reduce((map, binding) => {
        map.set(binding.im_provider, (map.get(binding.im_provider) ?? 0) + 1);
        return map;
      }, new Map<string, number>()),
    ).map(([label, count]) => ({ label, count })).sort((a, b) => a.label.localeCompare(b.label));

    const sessions = this.listLiveSessions?.() ?? [];
    const runtimeAgents = Array.from(
      sessions.reduce((map, session) => {
        const current = map.get(session.agent_id) ?? {
          agent_id: session.agent_id,
          status: session.status,
          session_count: 0,
          last_event_at: session.last_event_at,
        };
        current.session_count += 1;
        if (current.last_event_at === null || current.last_event_at < session.last_event_at) {
          current.status = session.status;
          current.last_event_at = session.last_event_at;
        }
        map.set(session.agent_id, current);
        return map;
      }, new Map<string, { agent_id: string; status: 'active' | 'idle' | 'closed'; session_count: number; last_event_at: string | null }>()),
    ).map(([, agent]) => agent).sort((a, b) => a.agent_id.localeCompare(b.agent_id));

    const governance = this.getCraftsmanGovernanceSnapshot();
    const activeExecutions = governance.active_execution_details;
    const hostSnapshot = governance.host;
    const hostStatus = !hostSnapshot
      ? 'unavailable'
      : governance.host_pressure_status === 'healthy'
        ? 'healthy'
        : 'degraded';
    const escalationSnapshot = this.buildEscalationSnapshot(tasks, runtimeAgents);

    return {
      generated_at: generatedAt,
      tasks: {
        status: taskCounts.blocked_tasks > 0 ? 'degraded' : 'healthy',
        ...taskCounts,
      },
      im: {
        status: activeBindings.length > 0 ? 'healthy' : 'unavailable',
        active_bindings: activeBindings.length,
        active_threads: activeBindings.filter((binding) => binding.thread_ref !== null).length,
        bindings_by_provider: bindingsByProvider,
      },
      runtime: {
        status: !this.listLiveSessions
          ? 'unavailable'
          : runtimeAgents.some((agent) => agent.status === 'closed')
            ? 'degraded'
            : 'healthy',
        available: !!this.listLiveSessions,
        stale_after_ms: this.getRuntimeStaleAfterMs?.() ?? null,
        active_sessions: sessions.filter((session) => session.status === 'active').length,
        idle_sessions: sessions.filter((session) => session.status === 'idle').length,
        closed_sessions: sessions.filter((session) => session.status === 'closed').length,
        agents: runtimeAgents,
      },
      craftsman: {
        status: activeExecutions.length === 0
          ? 'healthy'
          : activeExecutions.some((execution) => execution.status === 'needs_input' || execution.status === 'awaiting_choice')
            ? 'degraded'
            : 'healthy',
        active_executions: activeExecutions.length,
        queued_executions: activeExecutions.filter((execution) => execution.status === 'queued').length,
        running_executions: activeExecutions.filter((execution) => execution.status === 'running').length,
        waiting_input_executions: activeExecutions.filter((execution) => execution.status === 'needs_input').length,
        awaiting_choice_executions: activeExecutions.filter((execution) => execution.status === 'awaiting_choice').length,
        active_by_assignee: governance.active_by_assignee.map((item) => ({
          label: item.assignee,
          count: item.count,
        })),
      },
      host: {
        status: hostStatus,
        snapshot: hostSnapshot,
      },
      escalation: escalationSnapshot,
    };
  }

  requestRuntimeDiagnosis(taskId: string, options: RuntimeRecoveryRequestDto): RuntimeDiagnosisResultDto {
    const task = this.requireTask(taskId);
    this.assertTaskRuntimeControl(task, options.caller_id, `runtime diagnosis for agent '${options.agent_ref}'`);
    if (!this.runtimeRecoveryPort) {
      throw new Error('Runtime recovery port is not configured');
    }
    const runtimeResolution = this.resolveTaskRuntimeParticipant(task, options.agent_ref);
    const result = this.runtimeRecoveryPort.requestRuntimeDiagnosis({
      taskId,
      agentRef: options.agent_ref,
      runtimeProvider: runtimeResolution.runtime_provider,
      runtimeActorRef: runtimeResolution.runtime_actor_ref,
      reason: options.reason ?? null,
    });
    this.flowLogRepository.insertFlowLog({
      task_id: taskId,
      kind: 'system',
      event: 'runtime_diagnosis_requested',
      stage_id: task.current_stage,
      detail: {
        agent_ref: options.agent_ref,
        caller_id: options.caller_id,
        status: result.status,
        health: result.health,
      },
      actor: options.caller_id,
    });
    this.mirrorConversationEntry(taskId, {
      actor: options.caller_id,
      body: `Runtime diagnosis requested for ${options.agent_ref}.`,
      metadata: {
        event: 'runtime_diagnosis_requested',
        status: result.status,
        health: result.health,
        summary: result.summary,
      },
    });
    this.publishTaskStatusBroadcast(task, {
      kind: 'runtime_diagnosis_requested',
      participantRefs: [options.agent_ref],
      bodyLines: [
        `Agent: ${options.agent_ref}`,
        `Caller: ${options.caller_id}`,
        `Status: ${result.status}`,
        `Health: ${result.health}`,
        `Summary: ${result.summary}`,
      ],
    });
    return result;
  }

  restartCitizenRuntime(taskId: string, options: RuntimeRecoveryRequestDto): RuntimeRecoveryActionDto {
    const task = this.requireTask(taskId);
    this.assertTaskRuntimeControl(task, options.caller_id, `runtime restart for agent '${options.agent_ref}'`);
    if (!this.runtimeRecoveryPort) {
      throw new Error('Runtime recovery port is not configured');
    }
    const runtimeResolution = this.resolveTaskRuntimeParticipant(task, options.agent_ref);
    const result = this.runtimeRecoveryPort.restartCitizenRuntime({
      taskId,
      agentRef: options.agent_ref,
      runtimeProvider: runtimeResolution.runtime_provider,
      runtimeActorRef: runtimeResolution.runtime_actor_ref,
      reason: options.reason ?? null,
    });
    this.flowLogRepository.insertFlowLog({
      task_id: taskId,
      kind: 'system',
      event: 'runtime_restart_requested',
      stage_id: task.current_stage,
      detail: {
        agent_ref: options.agent_ref,
        caller_id: options.caller_id,
        status: result.status,
      },
      actor: options.caller_id,
    });
    this.mirrorConversationEntry(taskId, {
      actor: options.caller_id,
      body: `Runtime restart requested for ${options.agent_ref}.`,
      metadata: {
        event: 'runtime_restart_requested',
        status: result.status,
        summary: result.summary,
      },
    });
    this.publishTaskStatusBroadcast(task, {
      kind: 'runtime_restart_requested',
      participantRefs: [options.agent_ref],
      bodyLines: [
        `Agent: ${options.agent_ref}`,
        `Caller: ${options.caller_id}`,
        `Status: ${result.status}`,
        `Summary: ${result.summary}`,
      ],
    });
    return result;
  }

  stopCraftsmanExecution(
    executionId: string,
    options: {
      caller_id: string;
      reason?: string | null | undefined;
    },
  ): RuntimeRecoveryActionDto {
    const execution = this.getCraftsmanExecution(executionId);
    if (['succeeded', 'failed', 'cancelled'].includes(execution.status)) {
      throw new Error(`Craftsman execution ${executionId} is already terminal (status=${execution.status})`);
    }
    const task = this.requireTask(execution.task_id);
    const subtask = this.getSubtaskOrThrow(execution.task_id, execution.subtask_id);
    this.assertSubtaskControl(task, subtask, options.caller_id);
    if (!this.runtimeRecoveryPort) {
      throw new Error('Runtime recovery port is not configured');
    }
    const result = this.runtimeRecoveryPort.stopExecution({
      taskId: execution.task_id,
      subtaskId: execution.subtask_id,
      executionId: execution.execution_id,
      adapter: execution.adapter,
      sessionId: execution.session_id,
      workdir: execution.workdir,
      reason: options.reason ?? null,
    });
    this.flowLogRepository.insertFlowLog({
      task_id: execution.task_id,
      kind: 'system',
      event: 'craftsman_stop_requested',
      stage_id: subtask.stage_id,
      detail: {
        execution_id: execution.execution_id,
        subtask_id: execution.subtask_id,
        caller_id: options.caller_id,
        status: result.status,
      },
      actor: options.caller_id,
    });
    this.mirrorConversationEntry(execution.task_id, {
      actor: options.caller_id,
      body: `Craftsman stop requested for execution ${execution.execution_id}.`,
      metadata: {
        event: 'craftsman_stop_requested',
        execution_id: execution.execution_id,
        subtask_id: execution.subtask_id,
        status: result.status,
        summary: result.summary,
      },
    });
    this.publishTaskStatusBroadcast(task, {
      kind: 'craftsman_stop_requested',
      participantRefs: [subtask.assignee],
      bodyLines: [
        `Execution: ${execution.execution_id}`,
        `Subtask: ${execution.subtask_id}`,
        `Caller: ${options.caller_id}`,
        `Status: ${result.status}`,
        `Summary: ${result.summary}`,
      ],
    });
    return result;
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
    const thresholds = this.resolveEscalationPolicy(options);
    const now = options.now ?? new Date();
    const result: InactiveTaskProbeResult = {
      scanned_tasks: 0,
      controller_pings: 0,
      roster_pings: 0,
      human_pings: 0,
      inbox_items: 0,
    };

    for (const task of this.taskRepository.listTasks(TaskState.ACTIVE)) {
      result.scanned_tasks += 1;
      const latestActivityMs = this.resolveLatestBusinessActivityMs(task);
      const idleMs = now.getTime() - latestActivityMs;
      const controllerRef = resolveControllerRef(task.team.members);
      const interactiveRefs = task.team.members.filter(isInteractiveParticipant).map((member) => member.agentId);
      const probeState = this.getProbeState(task.id, latestActivityMs);
      const approvalWaitProbe = this.resolveApprovalWaitProbe(task);

      if (approvalWaitProbe) {
        if (idleMs >= thresholds.controllerAfterMs && !probeState.humanApprovalNotified && approvalWaitProbe.participantRefs.length > 0) {
          this.publishTaskStatusBroadcast(task, {
            kind: 'human_approval_pinged',
            participantRefs: approvalWaitProbe.participantRefs,
            ensureParticipantRefsJoined: approvalWaitProbe.participantRefs,
            bodyLines: [
              `Task is waiting for human approval and has remained idle for ${Math.round(idleMs / 1000)} seconds.`,
              `Approval Request: ${approvalWaitProbe.request.id}`,
              'Please review the pending approval and decide in Dashboard or the task thread.',
            ],
          });
          this.flowLogRepository.insertFlowLog({
            task_id: task.id,
            kind: 'flow',
            event: 'human_approval_pinged',
            stage_id: task.current_stage,
            detail: {
              idle_ms: idleMs,
              approval_request_id: approvalWaitProbe.request.id,
              participant_refs: approvalWaitProbe.participantRefs,
            },
            actor: 'system',
          });
          result.human_pings += 1;
          continue;
        }

        if (idleMs >= thresholds.inboxAfterMs && !probeState.inboxRaised) {
          this.inboxRepository.insertInboxItem({
            text: `Task ${task.id} is awaiting human approval`,
            source: 'inbox_escalated',
            notes: `Task ${task.id} has waited ${Math.round(idleMs / 1000)} seconds for human approval at stage ${task.current_stage ?? '-'}.`,
            tags: ['task', 'approval_waiting'],
            metadata: {
              task_id: task.id,
              kind: 'inbox_escalated',
              current_stage: task.current_stage,
              idle_ms: idleMs,
              reason: 'approval_waiting',
              approval_request_id: approvalWaitProbe.request.id,
            },
          });
          this.flowLogRepository.insertFlowLog({
            task_id: task.id,
            kind: 'flow',
            event: 'inbox_escalated',
            stage_id: task.current_stage,
            detail: {
              idle_ms: idleMs,
              reason: 'approval_waiting',
              approval_request_id: approvalWaitProbe.request.id,
            },
            actor: 'system',
          });
          result.inbox_items += 1;
        }
        continue;
      }

      if (idleMs < thresholds.controllerAfterMs) {
        continue;
      }

      if (!probeState.controllerNotified && controllerRef) {
        this.publishTaskStatusBroadcast(task, {
          kind: 'controller_pinged',
          participantRefs: [controllerRef],
          bodyLines: [
            `Task appears inactive for ${Math.round(idleMs / 1000)} seconds.`,
            'No meaningful progress has been detected. Please inspect the thread and continue orchestration.',
          ],
        });
        this.flowLogRepository.insertFlowLog({
          task_id: task.id,
          kind: 'flow',
          event: 'controller_pinged',
          stage_id: task.current_stage,
          detail: { idle_ms: idleMs, controller_ref: controllerRef },
          actor: 'system',
        });
        result.controller_pings += 1;
        continue;
      }

      if (idleMs >= thresholds.rosterAfterMs && probeState.controllerNotified && !probeState.rosterNotified && interactiveRefs.length > 0) {
        this.publishTaskStatusBroadcast(task, {
          kind: 'roster_pinged',
          participantRefs: interactiveRefs,
          bodyLines: [
            `Task remains inactive for ${Math.round(idleMs / 1000)} seconds after controller probe.`,
            'Interactive roster should check the thread, unblock the current stage, and continue execution.',
          ],
        });
        this.flowLogRepository.insertFlowLog({
          task_id: task.id,
          kind: 'flow',
          event: 'roster_pinged',
          stage_id: task.current_stage,
          detail: { idle_ms: idleMs, participant_refs: interactiveRefs },
          actor: 'system',
        });
        result.roster_pings += 1;
        continue;
      }

      if (idleMs >= thresholds.inboxAfterMs && probeState.rosterNotified && !probeState.inboxRaised) {
        this.inboxRepository.insertInboxItem({
          text: `Task ${task.id} appears stuck`,
          source: 'inbox_escalated',
          notes: `Task ${task.id} has remained inactive for ${Math.round(idleMs / 1000)} seconds at stage ${task.current_stage ?? '-'}.`,
          tags: ['task', 'stuck'],
          metadata: {
            task_id: task.id,
            kind: 'inbox_escalated',
            current_stage: task.current_stage,
            idle_ms: idleMs,
          },
        });
        this.flowLogRepository.insertFlowLog({
          task_id: task.id,
          kind: 'flow',
          event: 'inbox_escalated',
          stage_id: task.current_stage,
          detail: { idle_ms: idleMs },
          actor: 'system',
        });
        result.inbox_items += 1;
      }
    }

    return result;
  }

  private resolveEscalationPolicy(options: InactiveTaskProbeOptions) {
    return {
      controllerAfterMs: options.controllerAfterMs ?? this.escalationPolicy.controllerAfterMs,
      rosterAfterMs: options.rosterAfterMs ?? this.escalationPolicy.rosterAfterMs,
      inboxAfterMs: options.inboxAfterMs ?? this.escalationPolicy.inboxAfterMs,
    };
  }

  private buildEscalationSnapshot(
    tasks: TaskRecord[],
    runtimeAgents: Array<{ agent_id: string; status: 'active' | 'idle' | 'closed'; session_count: number; last_event_at: string | null }>,
  ): UnifiedHealthSnapshotDto['escalation'] {
    const activeTasks = tasks.filter((task) => task.state === TaskState.ACTIVE);
    let controllerPingedTasks = 0;
    let rosterPingedTasks = 0;
    let inboxEscalatedTasks = 0;

    for (const task of activeTasks) {
      const latestActivityMs = this.resolveLatestBusinessActivityMs(task);
      const probeState = this.getProbeState(task.id, latestActivityMs);
      if (probeState.inboxRaised) {
        inboxEscalatedTasks += 1;
      } else if (probeState.rosterNotified) {
        rosterPingedTasks += 1;
      } else if (probeState.controllerNotified) {
        controllerPingedTasks += 1;
      }
    }

    const unhealthyRuntimeAgents = runtimeAgents.filter((agent) => agent.status === 'closed').length;
    const runtimeUnhealthy = !!this.listLiveSessions && unhealthyRuntimeAgents > 0;

    return {
      status: controllerPingedTasks > 0 || rosterPingedTasks > 0 || inboxEscalatedTasks > 0 || runtimeUnhealthy
        ? 'degraded'
        : 'healthy',
      policy: {
        controller_after_ms: this.escalationPolicy.controllerAfterMs,
        roster_after_ms: this.escalationPolicy.rosterAfterMs,
        inbox_after_ms: this.escalationPolicy.inboxAfterMs,
      },
      controller_pinged_tasks: controllerPingedTasks,
      roster_pinged_tasks: rosterPingedTasks,
      inbox_escalated_tasks: inboxEscalatedTasks,
      unhealthy_runtime_agents: unhealthyRuntimeAgents,
      runtime_unhealthy: runtimeUnhealthy,
    };
  }

  private requireTask(taskId: string) {
    const task = this.taskRepository.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    return task;
  }
}
