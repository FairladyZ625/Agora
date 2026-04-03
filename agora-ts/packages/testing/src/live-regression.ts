import type { TaskConversationEntryDto, TaskConversationInboundActionDto } from '@agora-ts/contracts';
import {
  type IMProvisioningPort,
  TaskInboundService,
  type TaskContextBindingService,
  type TaskConversationService,
  type TaskService,
} from '@agora-ts/core';
import { StageRosterService } from '../../core/src/stage-roster-service.js';

export interface LiveRegressionActorOptions {
  taskService: TaskService;
  taskContextBindingService: TaskContextBindingService;
  taskConversationService: TaskConversationService;
  imProvisioningPort: IMProvisioningPort;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
}

export type LiveRegressionTarget =
  | { taskId: string }
  | { createTask: Parameters<TaskService['createTask']>[0] };

export interface LiveRegressionRunRequest {
  target: LiveRegressionTarget;
  actorRef: string;
  displayName?: string;
  goal: string;
  message: string;
  participantRefs?: string[] | null;
  taskAction?: TaskConversationInboundActionDto;
  waitFor?: LiveRegressionWaitFor;
}

export interface LiveRegressionWaitFor {
  currentStage?: string | null;
  state?: string;
  latestConversationBodyIncludes?: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
}

export interface LiveRegressionRunResult {
  taskId: string;
  bindingId: string;
  conversationRef: string | null;
  threadRef: string | null;
  conversationEntryId: string | null;
  state: string;
  currentStage: string | null;
  settled: boolean;
  initialStage: string | null;
  initialState: string;
  appliedTaskAction: {
    kind: TaskConversationInboundActionDto['kind'];
    actorRef: string;
    source: 'explicit' | 'auto';
  } | null;
  actionResult: {
    kind: TaskConversationInboundActionDto['kind'];
    state: string;
    currentStage: string | null;
    quorum?: {
      approved: number;
      total: number;
    };
  } | null;
  latestConversation: {
    entryId: string | null;
    direction: TaskConversationEntryDto['direction'] | null;
    displayName: string | null;
    bodyExcerpt: string | null;
  };
  goalSatisfied: boolean;
  timedOut: boolean;
  observationAttempts: number;
  stageChanged: boolean;
  failureHint: string | null;
}

export class LiveRegressionActor {
  private readonly now: () => Date;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly taskInboundService: TaskInboundService;
  private readonly stageRosterService = new StageRosterService();

  constructor(private readonly options: LiveRegressionActorOptions) {
    this.now = options.now ?? (() => new Date());
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => {
      setTimeout(resolve, ms);
    }));
    this.taskInboundService = new TaskInboundService(
      options.taskConversationService,
      options.taskContextBindingService,
      options.taskService,
    );
  }

  async run(request: LiveRegressionRunRequest): Promise<LiveRegressionRunResult> {
    const taskId = await this.resolveTaskId(request.target);
    const binding = this.options.taskContextBindingService.getActiveBinding(taskId);
    if (!binding) {
      throw new Error(`live regression requires an active task context binding for ${taskId}`);
    }
    const initialStatus = this.options.taskService.getTaskStatus(taskId);
    const selectedTaskAction = request.taskAction ?? this.selectAutomaticTaskAction(taskId);
    const taskActionSource = request.taskAction ? 'explicit' : (selectedTaskAction ? 'auto' : null);

    await this.options.imProvisioningPort.publishMessages({
      binding_id: binding.id,
      conversation_ref: binding.conversation_ref,
      thread_ref: binding.thread_ref,
      messages: [{
        kind: 'regression_operator',
        participant_refs: request.participantRefs ?? null,
        body: request.message,
      }],
    });

    const inboundResult = this.taskInboundService.ingest({
      provider: binding.im_provider,
      conversation_ref: binding.conversation_ref,
      thread_ref: binding.thread_ref,
      direction: 'outbound',
      author_kind: 'agent',
      author_ref: request.actorRef,
      display_name: request.displayName ?? request.actorRef,
      body: request.message,
      occurred_at: this.now().toISOString(),
      metadata: {
        regression_goal: request.goal,
        regression_actor: request.actorRef,
        regression_kind: 'live_operator',
        ...(selectedTaskAction ? {
          task_action_kind: selectedTaskAction.kind,
          task_action_actor: selectedTaskAction.actor_ref,
          ...(taskActionSource ? { task_action_source: taskActionSource } : {}),
        } : {}),
      },
      ...(selectedTaskAction ? { task_action: selectedTaskAction } : {}),
    });

    const actionResult = inboundResult.task_action_result
      ? {
          kind: inboundResult.task_action_result.kind,
          state: inboundResult.task_action_result.state,
          currentStage: inboundResult.task_action_result.current_stage,
          ...(inboundResult.task_action_result.quorum ? { quorum: inboundResult.task_action_result.quorum } : {}),
        }
      : null;
    const settled = selectedTaskAction ? actionResult !== null : inboundResult.entry !== null;
    const observed = settled && request.waitFor
      ? await this.observeUntil(taskId, request.waitFor, inboundResult.entry ?? null)
      : this.captureObservation(taskId, inboundResult.entry ?? null, {
          matched: settled,
          timedOut: false,
          attempts: 1,
        });
    const status = observed.status;
    const latestConversation = observed.latestConversation;
    const stageChanged = initialStatus.task.current_stage !== status.task.current_stage;
    const failureHint = !settled
      ? selectedTaskAction
        ? `Regression task action ${selectedTaskAction.kind} did not yield an inbound action result.`
        : 'Regression prompt was published but no conversation entry was recorded.'
      : request.waitFor && !observed.matched
        ? buildWaitFailureHint(request.waitFor, status, latestConversation)
        : null;
    return {
      taskId,
      bindingId: binding.id,
      conversationRef: binding.conversation_ref ?? null,
      threadRef: binding.thread_ref ?? null,
      conversationEntryId: inboundResult.entry?.id ?? null,
      state: status.task.state,
      currentStage: status.task.current_stage,
      settled,
      initialStage: initialStatus.task.current_stage,
      initialState: initialStatus.task.state,
      appliedTaskAction: selectedTaskAction && taskActionSource
        ? {
            kind: selectedTaskAction.kind,
            actorRef: selectedTaskAction.actor_ref,
            source: taskActionSource,
          }
        : null,
      actionResult,
      latestConversation: {
        entryId: latestConversation?.id ?? null,
        direction: latestConversation?.direction ?? null,
        displayName: latestConversation?.display_name ?? null,
        bodyExcerpt: latestConversation ? buildBodyExcerpt(latestConversation.body) : null,
      },
      goalSatisfied: observed.matched,
      timedOut: observed.timedOut,
      observationAttempts: observed.attempts,
      stageChanged,
      failureHint,
    };
  }

  private async resolveTaskId(target: LiveRegressionTarget): Promise<string> {
    if ('taskId' in target) {
      return target.taskId;
    }
    const task = this.options.taskService.createTask(target.createTask);
    await this.options.taskService.drainBackgroundOperations();
    return task.id;
  }

  private selectAutomaticTaskAction(taskId: string): TaskConversationInboundActionDto | null {
    const task = this.options.taskService.getTask(taskId);
    if (!task?.current_stage || !task.workflow?.stages) {
      return null;
    }
    const stage = task.workflow.stages.find((item) => item.id === task.current_stage);
    const controllerRef = task.team?.members.find((member) => member.member_kind === 'controller')?.agentId ?? null;
    if (!stage?.gate?.type) {
      return null;
    }
    if (stage.gate.type === 'command') {
      if (!controllerRef) {
        return null;
      }
      return {
        kind: 'advance_current',
        actor_ref: controllerRef,
      };
    }
    if (stage.gate.type === 'approval') {
      const approverRole = stage.gate.approver_role ?? stage.gate.approver ?? 'reviewer';
      const approverRef = task.team?.members.find((member) => member.role === approverRole)?.agentId ?? null;
      if (!approverRef) {
        return null;
      }
      return {
        kind: 'approve_current',
        actor_ref: approverRef,
        comment: 'auto approval in regression mode',
      };
    }
    if (stage.gate.type === 'archon_review') {
      return {
        kind: 'approve_current',
        actor_ref: 'archon',
        comment: 'auto archon approval in regression mode',
      };
    }
    if (stage.gate.type === 'quorum') {
      const voterRef = this.resolveAutomaticQuorumVoterRef(taskId);
      if (!voterRef) {
        return null;
      }
      return {
        kind: 'confirm_current',
        actor_ref: voterRef,
        vote: 'approve',
        comment: 'auto quorum approval in regression mode',
      };
    }
    return null;
  }

  private resolveAutomaticQuorumVoterRef(taskId: string): string | null {
    const task = this.options.taskService.getTask(taskId);
    if (!task?.current_stage || !task.workflow?.stages) {
      return null;
    }
    const stage = task.workflow.stages.find((item) => item.id === task.current_stage);
    if (!stage) {
      return null;
    }
    const decisions = this.stageRosterService.resolveExposureDecisions(task.team, stage);
    const preferred = decisions.find((decision) => (
      decision.desired_exposure === 'in_thread'
      && decision.exposure_reason !== 'controller_preserved'
    ));
    if (preferred) {
      return preferred.agent_ref;
    }
    return decisions.find((decision) => decision.desired_exposure === 'in_thread')?.agent_ref ?? null;
  }

  private captureObservation(
    taskId: string,
    fallbackConversation: TaskConversationEntryDto | null,
    state: Pick<LiveRegressionObservation, 'matched' | 'timedOut' | 'attempts'>,
  ): LiveRegressionObservation {
    return {
      status: this.options.taskService.getTaskStatus(taskId),
      latestConversation: this.options.taskConversationService.listByTask(taskId).at(-1) ?? fallbackConversation,
      matched: state.matched,
      timedOut: state.timedOut,
      attempts: state.attempts,
    };
  }

  private async observeUntil(
    taskId: string,
    waitFor: LiveRegressionWaitFor,
    fallbackConversation: TaskConversationEntryDto | null,
  ): Promise<LiveRegressionObservation> {
    const timeoutMs = waitFor.timeoutMs ?? 5_000;
    const pollIntervalMs = waitFor.pollIntervalMs ?? 250;
    const startedAt = this.now().getTime();
    let attempts = 0;

    while (true) {
      await this.options.taskService.drainBackgroundOperations();
      attempts += 1;
      const observation = this.captureObservation(taskId, fallbackConversation, {
        matched: false,
        timedOut: false,
        attempts,
      });
      if (matchesWaitTarget(observation.status, observation.latestConversation, waitFor)) {
        return {
          ...observation,
          matched: true,
        };
      }
      if (this.now().getTime() - startedAt >= timeoutMs) {
        return {
          ...observation,
          timedOut: true,
        };
      }
      await this.sleep(pollIntervalMs);
    }
  }
}

function buildBodyExcerpt(body: string, maxLength = 160): string {
  const normalized = body.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
}

interface LiveRegressionObservation {
  status: ReturnType<TaskService['getTaskStatus']>;
  latestConversation: TaskConversationEntryDto | null;
  matched: boolean;
  timedOut: boolean;
  attempts: number;
}

function matchesWaitTarget(
  status: ReturnType<TaskService['getTaskStatus']>,
  latestConversation: TaskConversationEntryDto | null,
  waitFor: LiveRegressionWaitFor,
): boolean {
  if (waitFor.currentStage !== undefined && status.task.current_stage !== waitFor.currentStage) {
    return false;
  }
  if (waitFor.state !== undefined && status.task.state !== waitFor.state) {
    return false;
  }
  if (
    waitFor.latestConversationBodyIncludes !== undefined
    && !(latestConversation?.body.includes(waitFor.latestConversationBodyIncludes))
  ) {
    return false;
  }
  return true;
}

function buildWaitFailureHint(
  waitFor: LiveRegressionWaitFor,
  status: ReturnType<TaskService['getTaskStatus']>,
  latestConversation: TaskConversationEntryDto | null,
): string {
  const mismatches: string[] = [];
  if (waitFor.currentStage !== undefined && status.task.current_stage !== waitFor.currentStage) {
    mismatches.push(`expected currentStage=${waitFor.currentStage}, got ${status.task.current_stage ?? 'null'}`);
  }
  if (waitFor.state !== undefined && status.task.state !== waitFor.state) {
    mismatches.push(`expected state=${waitFor.state}, got ${status.task.state}`);
  }
  if (
    waitFor.latestConversationBodyIncludes !== undefined
    && !(latestConversation?.body.includes(waitFor.latestConversationBodyIncludes))
  ) {
    mismatches.push(`expected latestConversation to include "${waitFor.latestConversationBodyIncludes}"`);
  }
  if (mismatches.length === 0) {
    return 'Regression observation timed out before the requested target was reached.';
  }
  return `Regression observation timed out: ${mismatches.join('; ')}.`;
}
