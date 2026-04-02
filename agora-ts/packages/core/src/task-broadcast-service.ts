import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { IMPublishMessageInput, IMProvisioningPort } from './im-ports.js';
import type { ITaskContextBindingRepository, ITaskConversationRepository, TaskLocaleDto, TaskRecord, WorkflowDto } from '@agora-ts/contracts';
import { resolveControllerRef } from './team-member-kind.js';

export interface TaskBroadcastServiceOptions {
  taskContextBindingRepository: ITaskContextBindingRepository;
  taskConversationRepository: ITaskConversationRepository;
  imProvisioningPort?: IMProvisioningPort | undefined;
  getTaskBrainWorkspacePath?: ((taskId: string) => string | null) | undefined;
  trackBackgroundOperation?: (<T>(operation: Promise<T>) => Promise<T>) | undefined;
}

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
  control_mode: 'normal' | 'smoke_test' | 'regression_test';
  workspace_path: string | null;
  participant_refs: string[] | null;
  lines: string[];
};

type TaskStateLike = TaskRecord['state'];
type WorkflowStageLike = NonNullable<WorkflowDto['stages']>[number];

export class TaskBroadcastService {
  private readonly taskContextBindingRepository: ITaskContextBindingRepository;
  private readonly taskConversationRepository: ITaskConversationRepository;
  private readonly imProvisioningPort: IMProvisioningPort | undefined;
  private readonly getTaskBrainWorkspacePath: ((taskId: string) => string | null) | undefined;
  private readonly trackBackgroundOperation: (<T>(operation: Promise<T>) => Promise<T>) | undefined;

  constructor(options: TaskBroadcastServiceOptions) {
    this.taskContextBindingRepository = options.taskContextBindingRepository;
    this.taskConversationRepository = options.taskConversationRepository;
    this.imProvisioningPort = options.imProvisioningPort;
    this.getTaskBrainWorkspacePath = options.getTaskBrainWorkspacePath;
    this.trackBackgroundOperation = options.trackBackgroundOperation;
  }

  mirrorConversationEntry(taskId: string, input: {
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

  mirrorProvisioningConversationEntry(
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

  mirrorPublishedMessagesToConversation(
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
    if (!this.imProvisioningPort) {
      return;
    }
    const binding = this.taskContextBindingRepository.getActiveByTask(task.id);
    if (!binding) {
      return;
    }
    const refsToJoin = Array.from(new Set(input.ensureParticipantRefsJoined ?? []));
    for (const participantRef of refsToJoin) {
      this.queueBackgroundOperation(
        this.imProvisioningPort.joinParticipant({
          binding_id: binding.id,
          participant_ref: participantRef,
          ...(binding.conversation_ref ? { conversation_ref: binding.conversation_ref } : {}),
          ...(binding.thread_ref ? { thread_ref: binding.thread_ref } : {}),
        }).catch((error: unknown) => {
          console.error(`[TaskBroadcastService] Failed to ensure participant ${participantRef} is joined for task ${task.id}:`, error);
        }),
      );
    }
    const envelope = this.buildTaskStatusBroadcastEnvelope(task, input);
    this.queueBackgroundOperation(
      this.imProvisioningPort.publishMessages({
        binding_id: binding.id,
        conversation_ref: binding.conversation_ref,
        thread_ref: binding.thread_ref,
        messages: [{
          kind: input.kind,
          ...(input.participantRefs ? { participant_refs: input.participantRefs } : {}),
          body: envelope.lines.join('\n'),
        }],
      }).catch((error: unknown) => {
        console.error(`[TaskBroadcastService] Task status broadcast failed for task ${task.id}:`, error);
      }),
    );
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

  publishTaskStateBroadcast(
    task: TaskRecord,
    fromState: TaskStateLike,
    toState: TaskStateLike,
    reason?: string,
  ) {
    const bodyLines: string[] = [];
    if (toState === 'paused') {
      bodyLines.push(taskText(task, '任务已暂停。线程将被归档并锁定。', 'Task paused. Thread will be archived and locked.'));
    } else if (toState === 'cancelled') {
      bodyLines.push(taskText(task, '任务已取消。线程将被归档并锁定，直到归档流程完成。', 'Task cancelled. Thread will be archived and locked until archive finalization.'));
    } else if (toState === 'active' && fromState === 'paused') {
      bodyLines.push(taskText(task, '任务已恢复。原线程已重新打开。', 'Task resumed. Original thread has been reopened.'));
    } else if (toState === 'active' && fromState === 'blocked') {
      bodyLines.push(taskText(task, '任务已解除阻塞并恢复为活跃执行。', 'Task unblocked and returned to active execution.'));
    } else if (toState === 'blocked') {
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

  publishControllerCloseoutReminder(
    task: TaskRecord,
    input: {
      workspacePath?: string | null;
      harvestDraftPath?: string | null;
      closeoutPromptPath?: string | null;
    },
  ) {
    const controllerRef = resolveControllerRef(task.team.members);
    if (!controllerRef) {
      return;
    }
    this.publishTaskStatusBroadcast(task, {
      kind: 'controller_closeout_requested',
      participantRefs: [controllerRef],
      ensureParticipantRefsJoined: [controllerRef],
      bodyLines: [
        taskText(task, `${task.id} 已进入 closeout 收口。`, `${task.id} has entered closeout convergence.`),
        taskText(task, '请先完成主控上下文收敛，再继续 archive cleanup。', 'Complete controller-side context convergence before archive cleanup proceeds.'),
        ...(input.workspacePath ? [`${taskText(task, '任务工作区', 'Task Workspace')}: ${input.workspacePath}`] : []),
        ...(input.harvestDraftPath ? [`${taskText(task, 'Harvest Draft', 'Harvest Draft')}: ${input.harvestDraftPath}`] : []),
        ...(input.closeoutPromptPath ? [`${taskText(task, 'Closeout Prompt', 'Closeout Prompt')}: ${input.closeoutPromptPath}`] : []),
      ],
    });
  }

  private queueBackgroundOperation<T>(operation: Promise<T>) {
    if (this.trackBackgroundOperation) {
      this.trackBackgroundOperation(operation);
      return;
    }
    void operation;
  }

  private buildTaskStatusBroadcastEnvelope(
    task: TaskRecord,
    input: {
      kind: string;
      bodyLines: string[];
      participantRefs?: string[];
    },
  ): TaskStatusBroadcastEnvelope {
    const stage = task.current_stage ? getStageByIdOrThrow(task, task.current_stage) : null;
    const workspacePath = this.getTaskBrainWorkspacePath?.(task.id) ?? null;
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
      workspace_path: workspacePath,
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
        ...(workspacePath ? [`${taskText(task, '任务工作区', 'Task Workspace')}: ${workspacePath}`] : []),
        ...(workspacePath ? [`${taskText(task, '当前简报', 'Current Brief')}: ${join(workspacePath, '00-current.md')}`] : []),
      ],
    };
  }

  private buildSmokeStatusGuidance(task: TaskRecord, kind: string): string[] {
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
      case 'controller_pinged':
      case 'roster_pinged':
      case 'human_approval_pinged':
      case 'inbox_escalated':
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
}

function getStageByIdOrThrow(task: TaskRecord, stageId: string) {
  const stage = (task.workflow.stages ?? []).find((item) => item.id === stageId);
  if (!stage) {
    throw new Error(`Task ${task.id} is missing workflow stage '${stageId}'`);
  }
  return stage;
}

function taskText(task: Pick<TaskRecord, 'locale'> | TaskLocaleDto, zh: string, en: string) {
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
