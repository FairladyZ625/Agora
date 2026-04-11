import type { TaskRecord, WorkflowDto } from '@agora-ts/contracts';
import { PermissionDeniedError } from './errors.js';
import { TaskState } from './enums.js';

type WorkflowStageLike = NonNullable<WorkflowDto['stages']>[number];
type WorkflowTerminalNodeLike = {
  id: string;
  kind?: 'stage' | 'terminal' | undefined;
  terminal?: {
    outcome: string;
    summary?: string | undefined;
  } | undefined;
};

type AdvanceResult = {
  currentStage: WorkflowStageLike;
  nextStage: WorkflowStageLike | null;
  completesTask: boolean;
  terminalNode: WorkflowTerminalNodeLike | null;
};

type UpdateTaskStateOptionsLike = {
  reason: string;
  action?: 'retry' | 'skip' | 'reassign';
  assignee?: string;
  craftsman_type?: string;
};

export interface TaskStageServiceOptions {
  getTaskOrThrow: (taskId: string) => TaskRecord;
  getCurrentStageOrThrow: (task: TaskRecord) => WorkflowStageLike;
  assertStageRosterAction: (
    task: TaskRecord,
    stage: WorkflowStageLike,
    callerId: string,
    action: 'advance',
  ) => void;
  routeGateCommand: (task: TaskRecord, stage: WorkflowStageLike, command: 'advance', callerId: string) => void;
  checkGate: (task: TaskRecord, stage: WorkflowStageLike, callerId: string) => boolean;
  ensureApprovalRequestForGate: (
    task: TaskRecord,
    stage: WorkflowStageLike,
    requester: string,
  ) => { request: { id: string; gate_type: string; summary_path?: string | null }; shouldBroadcast: boolean } | null;
  publishTaskStatusBroadcast: (
    task: TaskRecord,
    input: {
      kind: string;
      bodyLines: string[];
    },
  ) => void;
  advanceWorkflow: (task: TaskRecord, nextStageId?: string) => AdvanceResult;
  advanceTimedWorkflow: (task: TaskRecord) => AdvanceResult;
  getRejectStage: (task: TaskRecord, currentStageId: string) => WorkflowStageLike | null;
  reconcileStageExitSubtasks: (
    taskId: string,
    stageId: string,
    targetStatus: 'archived' | 'cancelled',
    reason: string,
  ) => string[];
  exitStage: (taskId: string, stageId: string, reason: string) => void;
  runTaskDoneAutomation: (task: TaskRecord) => void;
  updateTask: (
    taskId: string,
    version: number,
    patch: Partial<Pick<TaskRecord, 'state' | 'current_stage' | 'scheduler_snapshot' | 'error_detail'>>,
  ) => TaskRecord;
  refreshTaskBrainWorkspace: (task: TaskRecord) => void;
  materializeTaskCloseRecap: (task: TaskRecord, actor: string, reason?: string) => void;
  ensureArchiveJobForTask: (taskId: string) => unknown;
  insertFlowLog: (input: {
    task_id: string;
    kind: string;
    event: string;
    stage_id?: string | null;
    from_state?: string;
    to_state?: string;
    detail?: Record<string, unknown>;
    actor: string;
  }) => void;
  mirrorConversationEntry: (
    taskId: string,
    input: {
      actor: string | null;
      body: string;
      metadata?: Record<string, unknown>;
    },
  ) => void;
  publishControllerCloseoutReminder: (task: TaskRecord, archiveJob: unknown) => void;
  enterStage: (taskId: string, stageId: string) => void;
  insertProgressLog: (input: {
    task_id: string;
    kind: 'progress';
    stage_id: string;
    content: string;
    artifacts?: Record<string, unknown>;
    actor: string;
  }) => void;
  describeGateState: (stage: WorkflowStageLike | null) => string[];
  buildSmokeStageEntryCommands: (task: TaskRecord, stage: WorkflowStageLike) => string[];
  reconcileStageParticipants: (task: TaskRecord, stage: WorkflowStageLike | null) => void;
  validateTransition: (fromState: TaskState, toState: TaskState) => boolean;
  buildSchedulerSnapshot: (task: TaskRecord, reason: string) => TaskRecord['scheduler_snapshot'];
  dbBegin: () => void;
  dbCommit: () => void;
  dbRollback: () => void;
  applyStateTransitionSideEffects: (
    task: TaskRecord,
    newState: TaskState,
    options: UpdateTaskStateOptionsLike,
  ) => Record<string, unknown> | undefined;
  cancelOpenWork: (taskId: string, reason: string) => void;
  buildStateChangeDetail: (
    options: UpdateTaskStateOptionsLike,
    actionDetail?: Record<string, unknown>,
  ) => Record<string, unknown> | undefined;
  buildStateConversationBody: (
    fromState: TaskState,
    toState: TaskState,
    options: UpdateTaskStateOptionsLike,
  ) => string | null;
  getStateActionEvent: (fromState: TaskState, toState: TaskState) => string | null;
  resumeDeferredCallbacks: (taskId: string) => void;
  failMissingCraftsmanSessionsOnResume: (taskId: string) => void;
  syncImContextForTaskState: (
    taskId: string,
    fromState: TaskState,
    toState: TaskState,
    reason?: string,
    onSuccess?: () => void,
  ) => void;
  publishTaskStateBroadcast: (
    task: TaskRecord,
    fromState: TaskState,
    toState: TaskState,
    reason?: string,
  ) => void;
  getDoneStateBroadcastLines: () => string[];
}

export class TaskStageService {
  private readonly options: TaskStageServiceOptions;

  constructor(options: TaskStageServiceOptions) {
    this.options = options;
  }

  advanceTask(taskId: string, options: { callerId: string; nextStageId?: string }): TaskRecord {
    const task = this.options.getTaskOrThrow(taskId);
    if (task.state !== TaskState.ACTIVE) {
      throw new Error(`Task ${taskId} is in state '${task.state}', expected 'active'`);
    }
    if (!task.current_stage) {
      throw new Error(`Task ${taskId} has no current_stage set`);
    }

    const currentStage = this.options.getCurrentStageOrThrow(task);
    this.options.assertStageRosterAction(task, currentStage, options.callerId, 'advance');
    this.options.routeGateCommand(task, currentStage, 'advance', options.callerId);
    if (!this.options.checkGate(task, currentStage, options.callerId)) {
      const refreshed = this.options.getTaskOrThrow(taskId);
      if (
        refreshed.current_stage !== task.current_stage
        || refreshed.state !== task.state
        || refreshed.version !== task.version
      ) {
        return refreshed;
      }
      const approvalRequest = this.options.ensureApprovalRequestForGate(task, currentStage, options.callerId);
      if (approvalRequest?.shouldBroadcast) {
        this.options.publishTaskStatusBroadcast(task, {
          kind: 'gate_waiting',
          bodyLines: [
            `Gate ${approvalRequest.request.gate_type} is waiting for human decision.`,
            `Approval Request: ${approvalRequest.request.id}`,
            ...(approvalRequest.request.summary_path ? [`Summary Path: ${approvalRequest.request.summary_path}`] : []),
          ],
        });
      }
      throw new PermissionDeniedError(
        `Gate check failed for stage '${task.current_stage}' (gate type: ${currentStage.gate?.type ?? 'command'})`,
      );
    }

    const transitionKind = currentStage.gate?.type === 'auto_timeout' ? 'timeout' : 'advance';
    return this.advanceSatisfiedStage(task, options.callerId, options.nextStageId, transitionKind);
  }

  advanceSatisfiedStage(
    task: TaskRecord,
    actor: string,
    nextStageId?: string,
    transitionKind: 'advance' | 'timeout' = 'advance',
  ): TaskRecord {
    if (task.state !== TaskState.ACTIVE) {
      throw new Error(`Task ${task.id} is in state '${task.state}', expected 'active'`);
    }
    if (!task.current_stage) {
      throw new Error(`Task ${task.id} has no current_stage set`);
    }
    const advance = transitionKind === 'timeout'
      ? this.options.advanceTimedWorkflow(task)
      : this.options.advanceWorkflow(task, nextStageId);
    this.options.reconcileStageExitSubtasks(task.id, advance.currentStage.id, 'archived', 'stage_advanced');
    this.options.exitStage(task.id, advance.currentStage.id, 'advance');

    if (advance.completesTask) {
      this.options.runTaskDoneAutomation(task);
      const done = this.options.updateTask(task.id, task.version, {
        state: TaskState.DONE,
        current_stage: null,
      });
      this.options.refreshTaskBrainWorkspace(done);
      this.options.materializeTaskCloseRecap(done, actor);
      const archiveJob = this.options.ensureArchiveJobForTask(task.id);
      this.options.insertFlowLog({
        task_id: task.id,
        kind: 'flow',
        event: 'state_changed',
        stage_id: advance.currentStage.id,
        from_state: TaskState.ACTIVE,
        to_state: TaskState.DONE,
        detail: {
          transition_kind: transitionKind,
          ...(advance.terminalNode ? {
            terminal_node_id: advance.terminalNode.id,
            terminal_outcome: advance.terminalNode.terminal?.outcome ?? null,
            terminal_summary: advance.terminalNode.terminal?.summary ?? null,
          } : {}),
        },
        actor,
      });
      this.options.mirrorConversationEntry(task.id, {
        actor,
        body: 'Task completed',
        metadata: {
          event: 'state_changed',
          from_state: TaskState.ACTIVE,
          to_state: TaskState.DONE,
          transition_kind: transitionKind,
          ...(advance.terminalNode ? {
            terminal_node_id: advance.terminalNode.id,
            terminal_outcome: advance.terminalNode.terminal?.outcome ?? null,
            terminal_summary: advance.terminalNode.terminal?.summary ?? null,
          } : {}),
        },
      });
      this.options.publishTaskStatusBroadcast(done, {
        kind: 'task_completed',
        bodyLines: [
          ...this.options.getDoneStateBroadcastLines(),
          ...(advance.terminalNode?.terminal?.outcome ? [`Outcome: ${advance.terminalNode.terminal.outcome}`] : []),
          ...(advance.terminalNode?.terminal?.summary ? [`Summary: ${advance.terminalNode.terminal.summary}`] : []),
        ],
      });
      this.options.publishControllerCloseoutReminder(done, archiveJob);
      return done;
    }

    const nextStage = advance.nextStage;
    const updated = this.options.updateTask(task.id, task.version, {
      current_stage: nextStage?.id ?? null,
    });
    if (nextStage) {
      this.options.enterStage(task.id, nextStage.id);
    }
    this.options.refreshTaskBrainWorkspace(updated);
    this.options.insertFlowLog({
      task_id: task.id,
      kind: 'flow',
      event: 'stage_advanced',
      stage_id: nextStage?.id ?? null,
      detail: {
        from_stage: advance.currentStage.id,
        to_stage: nextStage?.id ?? 'done',
        transition_kind: transitionKind,
      },
      actor,
    });
    if (nextStage) {
      this.options.insertProgressLog({
        task_id: task.id,
        kind: 'progress',
        stage_id: nextStage.id,
        content: `Advanced to stage ${nextStage.id}`,
        artifacts: { from_stage: advance.currentStage.id, to_stage: nextStage.id },
        actor,
      });
      this.options.mirrorConversationEntry(task.id, {
        actor,
        body: `Advanced to stage ${nextStage.id}`,
        metadata: {
          event: 'stage_advanced',
          from_stage: advance.currentStage.id,
          to_stage: nextStage.id,
        },
      });
      this.options.publishTaskStatusBroadcast(updated, {
        kind: 'stage_entered',
        bodyLines: [
          `Advanced from ${advance.currentStage.id} to ${nextStage.id}.`,
          ...this.options.describeGateState(nextStage),
          ...this.options.buildSmokeStageEntryCommands(updated, nextStage),
        ],
      });
      this.options.reconcileStageParticipants(updated, nextStage);
    }
    return updated;
  }

  forceAdvanceTask(taskId: string, options: { reason: string }): TaskRecord {
    const task = this.options.getTaskOrThrow(taskId);
    if (task.state !== TaskState.ACTIVE) {
      throw new Error(`Task ${taskId} is in state '${task.state}', expected 'active'`);
    }
    if (!task.current_stage) {
      throw new Error(`Task ${taskId} has no current_stage set`);
    }
    const advance = this.options.advanceWorkflow(task);
    this.options.reconcileStageExitSubtasks(taskId, advance.currentStage.id, 'archived', 'force_advanced');
    this.options.exitStage(taskId, advance.currentStage.id, 'force_advance');
    this.options.insertFlowLog({
      task_id: taskId,
      kind: 'flow',
      event: 'force_advance',
      stage_id: task.current_stage,
      detail: { reason: options.reason },
      actor: 'archon',
    });

    if (advance.completesTask) {
      this.options.runTaskDoneAutomation(task);
      const done = this.options.updateTask(taskId, task.version, {
        state: TaskState.DONE,
        current_stage: null,
      });
      this.options.refreshTaskBrainWorkspace(done);
      this.options.materializeTaskCloseRecap(done, 'archon', options.reason);
      const archiveJob = this.options.ensureArchiveJobForTask(taskId);
      this.options.insertFlowLog({
        task_id: taskId,
        kind: 'flow',
        event: 'state_changed',
        stage_id: advance.currentStage.id,
        from_state: TaskState.ACTIVE,
        to_state: TaskState.DONE,
        actor: 'archon',
      });
      this.options.mirrorConversationEntry(taskId, {
        actor: 'archon',
        body: 'Force advanced task to done',
        metadata: {
          event: 'force_advance',
          to_state: TaskState.DONE,
        },
      });
      this.options.publishTaskStatusBroadcast(done, {
        kind: 'task_completed',
        bodyLines: this.options.getDoneStateBroadcastLines(),
      });
      this.options.publishControllerCloseoutReminder(done, archiveJob);
      return done;
    }

    const nextStage = advance.nextStage;
    const updated = this.options.updateTask(taskId, task.version, {
      current_stage: nextStage?.id ?? null,
    });
    if (nextStage) {
      this.options.enterStage(taskId, nextStage.id);
      this.options.insertFlowLog({
        task_id: taskId,
        kind: 'flow',
        event: 'stage_advanced',
        stage_id: nextStage.id,
        detail: { from_stage: advance.currentStage.id, to_stage: nextStage.id },
        actor: 'archon',
      });
      this.options.mirrorConversationEntry(taskId, {
        actor: 'archon',
        body: `Force advanced to stage ${nextStage.id}`,
        metadata: {
          event: 'force_advance',
          to_stage: nextStage.id,
        },
      });
      this.options.reconcileStageParticipants(updated, nextStage);
    }
    return updated;
  }

  updateTaskState(taskId: string, newState: string, options: UpdateTaskStateOptionsLike): TaskRecord {
    const task = this.options.getTaskOrThrow(taskId);
    if (!this.options.validateTransition(task.state as TaskState, newState as TaskState)) {
      throw new Error(`Invalid transition: ${task.state} -> ${newState}`);
    }
    const schedulerSnapshot = this.options.buildSchedulerSnapshot(task, options.reason);
    const errorDetail = newState === TaskState.ACTIVE ? null : (options.reason ?? task.error_detail);
    const actionEvent = this.options.getStateActionEvent(task.state as TaskState, newState as TaskState);

    this.options.dbBegin();
    try {
      const actionDetail = this.options.applyStateTransitionSideEffects(task, newState as TaskState, options);
      const detail = this.options.buildStateChangeDetail(options, actionDetail);
      const updated = this.options.updateTask(taskId, task.version, {
        state: newState,
        scheduler_snapshot: schedulerSnapshot,
        error_detail: errorDetail,
      });

      if (newState === TaskState.CANCELLED) {
        this.options.cancelOpenWork(taskId, options.reason);
      }
      if (newState === TaskState.DONE || newState === TaskState.CANCELLED) {
        this.options.ensureArchiveJobForTask(taskId);
      }

      if (detail) {
        this.options.insertFlowLog({
          task_id: taskId,
          kind: 'flow',
          event: 'state_changed',
          stage_id: task.current_stage,
          from_state: task.state,
          to_state: newState,
          detail,
          actor: 'system',
        });
      } else {
        this.options.insertFlowLog({
          task_id: taskId,
          kind: 'flow',
          event: 'state_changed',
          stage_id: task.current_stage,
          from_state: task.state,
          to_state: newState,
          actor: 'system',
        });
      }
      const conversationBody = this.options.buildStateConversationBody(task.state as TaskState, newState as TaskState, options);
      if (conversationBody) {
        this.options.mirrorConversationEntry(taskId, {
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
        if (detail) {
          this.options.insertFlowLog({
            task_id: taskId,
            kind: 'flow',
            event: actionEvent,
            stage_id: task.current_stage,
            from_state: task.state,
            to_state: newState,
            detail,
            actor: 'system',
          });
        } else {
          this.options.insertFlowLog({
            task_id: taskId,
            kind: 'flow',
            event: actionEvent,
            stage_id: task.current_stage,
            from_state: task.state,
            to_state: newState,
            actor: 'system',
          });
        }
      }
      if (task.state === TaskState.PAUSED && newState === TaskState.ACTIVE) {
        this.options.resumeDeferredCallbacks(taskId);
        this.options.failMissingCraftsmanSessionsOnResume(taskId);
      }
      this.options.dbCommit();
      this.options.refreshTaskBrainWorkspace(updated);
      const broadcast = () => this.options.publishTaskStateBroadcast(updated, task.state as TaskState, newState as TaskState, options.reason);
      if (task.state === TaskState.PAUSED && newState === TaskState.ACTIVE) {
        this.options.syncImContextForTaskState(taskId, task.state as TaskState, newState as TaskState, options.reason, broadcast);
      } else {
        broadcast();
        this.options.syncImContextForTaskState(taskId, task.state as TaskState, newState as TaskState, options.reason);
      }
      return updated;
    } catch (error) {
      this.options.dbRollback();
      throw error;
    }
  }

  rewindRejectedStage(
    task: TaskRecord,
    currentStageId: string,
    decisionEvent: 'rejected' | 'archon_rejected',
    actor: string,
    reason: string,
  ): TaskRecord {
    const rejectStage = this.options.getRejectStage(task, currentStageId);
    if (!rejectStage) {
      return task;
    }

    this.options.reconcileStageExitSubtasks(task.id, currentStageId, 'archived', decisionEvent);
    this.options.exitStage(task.id, currentStageId, decisionEvent);
    const updated = this.options.updateTask(task.id, task.version, {
      current_stage: rejectStage.id,
    });
    this.options.enterStage(task.id, rejectStage.id);
    this.options.insertFlowLog({
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
    this.options.insertProgressLog({
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
    this.options.refreshTaskBrainWorkspace(updated);
    this.options.reconcileStageParticipants(updated, rejectStage);
    return updated;
  }
}
