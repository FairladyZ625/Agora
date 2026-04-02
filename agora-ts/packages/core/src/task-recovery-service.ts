import type { DatabasePort, IFlowLogRepository, IInboxRepository, ITaskRepository, TaskRecord } from '@agora-ts/contracts';
import { TaskState } from './enums.js';
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

export interface TaskRecoveryServiceOptions {
  databasePort: DatabasePort;
  taskRepository: ITaskRepository;
  flowLogRepository: IFlowLogRepository;
  inboxRepository: IInboxRepository;
  escalationPolicy: EscalationPolicy;
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
  private readonly flowLogRepository: IFlowLogRepository;
  private readonly inboxRepository: IInboxRepository;
  private readonly escalationPolicy: EscalationPolicy;
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
    this.flowLogRepository = options.flowLogRepository;
    this.inboxRepository = options.inboxRepository;
    this.escalationPolicy = options.escalationPolicy;
    this.publishTaskStatusBroadcast = options.publishTaskStatusBroadcast;
    this.mirrorConversationEntry = options.mirrorConversationEntry;
    this.buildSchedulerSnapshot = options.buildSchedulerSnapshot;
    this.failMissingCraftsmanSessions = options.failMissingCraftsmanSessions;
    this.resolveLatestBusinessActivityMs = options.resolveLatestBusinessActivityMs;
    this.getProbeState = options.getProbeState;
    this.resolveApprovalWaitProbe = options.resolveApprovalWaitProbe;
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
}
