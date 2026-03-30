import type { TaskConversationInboundActionDto } from '@agora-ts/contracts';
import {
  type IMProvisioningPort,
  TaskInboundService,
  type TaskContextBindingService,
  type TaskConversationService,
  type TaskService,
} from '@agora-ts/core';

export interface LiveRegressionActorOptions {
  taskService: TaskService;
  taskContextBindingService: TaskContextBindingService;
  taskConversationService: TaskConversationService;
  imProvisioningPort: IMProvisioningPort;
  now?: () => Date;
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
}

export interface LiveRegressionRunResult {
  taskId: string;
  bindingId: string;
  conversationRef: string | null;
  threadRef: string | null;
  conversationEntryId: string | null;
  state: string;
  currentStage: string | null;
}

export class LiveRegressionActor {
  private readonly now: () => Date;
  private readonly taskInboundService: TaskInboundService;

  constructor(private readonly options: LiveRegressionActorOptions) {
    this.now = options.now ?? (() => new Date());
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

    const status = this.options.taskService.getTaskStatus(taskId);
    return {
      taskId,
      bindingId: binding.id,
      conversationRef: binding.conversation_ref ?? null,
      threadRef: binding.thread_ref ?? null,
      conversationEntryId: inboundResult.entry?.id ?? null,
      state: status.task.state,
      currentStage: status.task.current_stage,
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
    if (!stage?.gate?.type || !controllerRef) {
      return null;
    }
    if (stage.gate.type === 'command') {
      return {
        kind: 'advance_current',
        actor_ref: controllerRef,
      };
    }
    return null;
  }
}
