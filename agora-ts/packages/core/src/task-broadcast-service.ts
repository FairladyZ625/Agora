import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import type { IMPublishMessageInput, IMProvisioningPort } from './im-ports.js';
import type { ITaskContextBindingRepository, ITaskConversationRepository, TaskLocaleDto, TaskRecord, WorkflowDto } from '@agora-ts/contracts';
import type { SkillCatalogEntry } from './skill-catalog-port.js';
import { summarizeCraftsmanOutputForHuman } from './craftsman-output.js';
import { isInteractiveParticipant, resolveControllerRef } from './team-member-kind.js';

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
type SubtaskLike = {
  id: string;
  output: string | null;
};
type CraftsmanExecutionLike = {
  execution_id: string;
  adapter: string;
  status: string;
  finished_at: string | null;
  callback_payload: {
    input_request?: {
      hint?: string | null | undefined;
      choice_options?: Array<{ id: string; label: string }> | null | undefined;
    } | null | undefined;
    output?: unknown;
  } | null;
};

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

  syncImContextForTaskState(
    taskId: string,
    fromState: TaskStateLike,
    toState: TaskStateLike,
    reason?: string,
    onSuccess?: () => void,
  ) {
    if (!this.imProvisioningPort) {
      return;
    }
    const binding = this.taskContextBindingRepository.listByTask(taskId)[0];
    if (!binding) {
      return;
    }
    const mode = resolveImContextModeForStateTransition(fromState, toState);
    if (!mode) {
      return;
    }
    this.queueBackgroundOperation(this.imProvisioningPort.archiveContext({
      binding_id: binding.id,
      conversation_ref: binding.conversation_ref,
      thread_ref: binding.thread_ref,
      mode,
      reason: reason ?? null,
    }).then(() => {
      this.taskContextBindingRepository.updateStatus(
        binding.id,
        mode === 'archive' ? 'archived' : mode === 'unarchive' ? 'active' : 'destroyed',
      );
      onSuccess?.();
    }).catch((err: unknown) => {
      console.error(`[TaskBroadcastService] IM context transition failed for task ${taskId}:`, err);
      this.taskContextBindingRepository.updateStatus(binding.id, 'failed');
    }));
  }

  buildBootstrapMessages(input: {
    task: TaskRecord;
    workspacePath: string | null;
    imParticipantRefs: string[];
    skillCatalog: Map<string, SkillCatalogEntry>;
  }): IMPublishMessageInput[] {
    const { task, workspacePath, imParticipantRefs, skillCatalog } = input;
    if (!task.current_stage) {
      return [];
    }
    const stage = getStageByIdOrThrow(task, task.current_stage);
    const controllerRef = resolveControllerRef(task.team.members);
    const globalSkillLines = this.renderResolvedSkillLines(task.skill_policy?.global_refs ?? [], skillCatalog);
    const mentionMapLines = task.team.members
      .filter(isInteractiveParticipant)
      .map((member) => `- ${member.agentId}: {{participant:${member.agentId}}}`);
    const rootMessages: IMPublishMessageInput[] = [
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
          `- ${join(homedir(), '.codex', 'skills', 'agora-bootstrap', 'SKILL.md')}`,
          ...(workspacePath
            ? [
                `- ${join(workspacePath, '00-bootstrap.md')}`,
                `- ${join(workspacePath, '01-task-brief.md')}`,
                `- ${join(workspacePath, '02-roster.md')}`,
                `- ${join(workspacePath, '03-stage-state.md')}`,
              ]
            : []),
          ...(globalSkillLines.length > 0
            ? [
                '',
                `${taskText(task, 'Task Skills', 'Task Skills')}:`,
                ...globalSkillLines,
              ]
            : []),
        ].join('\n'),
      },
      {
        kind: 'bootstrap_runbook',
        participant_refs: imParticipantRefs,
        body: [
          `${taskText(task, '快速决策表', 'Quick decision table')}:`,
          `- ${taskText(task, '只想一轮给出结果 -> `one_shot`', 'Need a single prompt -> result run -> `one_shot`')}`,
          `- ${taskText(task, '预计会 `needs_input` / `awaiting_choice` -> `interactive`', 'Expect `needs_input` / `awaiting_choice` -> `interactive`')}`,
          `- ${taskText(task, '可能出现 plan mode / 菜单选择 -> `interactive`', 'Expect plan mode / menu choices -> `interactive`')}`,
          '',
          `${taskText(task, '常用命令', 'Common commands')}:`,
          `- agora subtasks list ${task.id}`,
          `- agora subtasks create ${task.id} --caller-id ${controllerRef ?? '<controller>'} --file subtasks.json`,
          `- agora craftsman input-text <executionId> "<text>"`,
          `- agora craftsman input-keys <executionId> Down Enter`,
          `- agora craftsman submit-choice <executionId> Down`,
          `- agora craftsman probe <executionId>`,
          '',
          `${taskText(task, 'Craftsman 循环', 'Craftsman loop')}:`,
          `- ${taskText(task, '在当前任务线程内，使用 subtask 作为正式执行绑定对象。', 'Use subtasks as the formal execution binding object inside this task thread.')}`,
          `- ${taskText(task, '每个 subtask 都必须显式声明 `execution_target`：`manual` 或 `craftsman`。', 'Every subtask must declare `execution_target` explicitly: `manual` or `craftsman`.')}`,
          `- ${taskText(task, '仅当活动阶段允许 `craftsman_dispatch` 时，才从 subtask 调度 craftsman。', 'Dispatch craftsmen from subtasks only when the active stage allows `craftsman_dispatch`.')}`,
          `- ${taskText(task, '执行模式优先使用 `one_shot`（单次结果）或 `interactive`（持续交互）。', 'Prefer `one_shot` (single result) or `interactive` (continued dialogue) as the execution mode.')}`,
          `- ${taskText(task, '如果 craftsman 进入 `needs_input` 或 `awaiting_choice`，通过它的 `execution_id` 继续同一个执行。', 'If a craftsman pauses with `needs_input` or `awaiting_choice`, continue the same execution through its `execution_id`.')}`,
          `- ${taskText(task, '继续执行后，用 `agora craftsman probe <executionId>` 同步最新状态；只有 probe 无法推断结果时，才回退到 `agora craftsman callback ...`。', 'After a continued execution, sync the latest state with `agora craftsman probe <executionId>`; only fall back to `agora craftsman callback ...` if probe cannot infer the result.')}`,
          `- ${taskText(task, '把原始 tmux pane 命令视为调试 transport，不要当成默认产品流程。', 'Treat raw tmux pane commands as debug-only transport tools, not as the default product workflow.')}`,
        ].join('\n'),
      },
      {
        kind: 'bootstrap_mentions',
        participant_refs: imParticipantRefs,
        body: [
          `${taskText(task, 'Discord 提及规则', 'Discord mention rule')}:`,
          `- ${taskText(task, '要可靠唤醒 bot 或人类，请使用真实的 Discord mention 语法 `<@USER_ID>`。', 'To wake a bot or human reliably, use the real Discord mention syntax `<@USER_ID>`.')}`,
          `- ${taskText(task, '不要输入显示名，例如 `@Opus` 或 `@Sonnet`。', 'Do not type display names like `@Opus` or `@Sonnet`.')}`,
          `- ${taskText(task, '尽量复用本线程里已经出现过的真实 mention。', 'Reuse the real mentions already shown in this thread whenever possible.')}`,
          `- ${taskText(task, '如果本机找不到 `~/.agora/skills/agora-bootstrap/SKILL.md`，再尝试 `~/.codex/skills/agora-bootstrap/SKILL.md`。', 'If `~/.agora/skills/agora-bootstrap/SKILL.md` is missing, fall back to `~/.codex/skills/agora-bootstrap/SKILL.md`.')}`,
          ...(mentionMapLines.length > 0
            ? [
                `${taskText(task, '成员 mention 对照表', 'Roster mention map')}:`,
                ...mentionMapLines,
              ]
            : []),
          ...(task.control?.mode === 'smoke_test'
            ? [
                '',
                `${taskText(task, '冒烟测试模式', 'Smoke Test Mode')}:`,
                `- ${taskText(task, '当前任务运行在 smoke/test 模式下。', 'This task is running in smoke/test mode.')}`,
                `- ${taskText(task, '额外测试引导仅用于验证。', 'Extra testing guidance may appear for validation only.')}`,
                `- ${taskText(task, '这不是默认的终端用户产品流程。', 'This is not the default end-user product flow.')}`,
              ]
            : task.control?.mode === 'regression_test'
              ? [
                  '',
                  `${taskText(task, '回归代理模式', 'Regression Proxy Mode')}:`,
                  `- ${taskText(task, '当前任务运行在开发期 regression mode 下。', 'This task is running in developer regression mode.')}`,
                  `- ${taskText(task, 'AgoraBot 在当前线程里代表开发者执行回归，并可主动牵引任务推进。', 'AgoraBot represents the developer in this thread for regression and may actively steer task progression.')}`,
                  `- ${taskText(task, '这套代理语义仅用于开发验证，不代表正式终端用户产品权限。', 'This proxy contract is for development validation only and does not represent normal end-user permissions.')}`,
                ]
              : []),
        ].join('\n'),
      },
    ];
    const messages: IMPublishMessageInput[] = [...rootMessages];
    const initialBriefRecipients = new Set(imParticipantRefs);

    for (const member of task.team.members.filter((candidate) => (
      isInteractiveParticipant(candidate) && initialBriefRecipients.has(candidate.agentId)
    ))) {
      const roleBriefPath = workspacePath ? join(workspacePath, '05-agents', member.agentId, '00-role-brief.md') : null;
      const citizenScaffoldPath = workspacePath ? join(workspacePath, '05-agents', member.agentId, '03-citizen-scaffold.md') : null;
      const roleDocPath = workspacePath ? resolve(workspacePath, '..', '..', 'roles', `${member.role}.md`) : null;
      const roleSkillLines = this.renderResolvedSkillLines(task.skill_policy?.role_refs?.[member.role] ?? [], skillCatalog);
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
          taskText(task, '快速决策：一次性结果用 `one_shot`；需要后续输入或菜单选择用 `interactive`。', 'Quick decision: use `one_shot` for one-pass results; use `interactive` when you expect more input or menu choices.'),
          taskText(task, 'subtask 意图：显式写 `execution_target: "manual"` 或 `execution_target: "craftsman"`。', 'Subtask intent: explicitly write `execution_target: "manual"` or `execution_target: "craftsman"`.'),
          `agora subtasks create ${task.id} --caller-id ${controllerRef ?? '<controller>'} --file subtasks.json`,
          `agora subtasks list ${task.id}`,
          taskText(task, 'Craftsman 循环：使用正式 subtask 绑定 craftsman，等待中的执行通过 `execution_id` 继续，而不是靠原始 pane 名。', 'Craftsman Loop: use formal subtasks and continue waiting craftsmen through `execution_id`, not raw pane names.'),
          'agora craftsman input-text <executionId> "<text>"',
          'agora craftsman input-keys <executionId> Down Enter',
          'agora craftsman submit-choice <executionId> Down',
          taskText(task, '继续规则：继续 craftsman execution 后，用 `agora craftsman probe <executionId>` 同步；只有必要时才回退到 `agora craftsman callback ...`。', 'Continuation Rule: after continuing a craftsman execution, sync it with `agora craftsman probe <executionId>`; use `agora craftsman callback ...` only as a fallback.'),
          taskText(task, 'Discord 提及规则：使用真实 `<@USER_ID>` mention，不要用显示名。', 'Discord Mention Rule: use real `<@USER_ID>` mentions, not display names.'),
          `${taskText(task, '成员 mention', 'Roster mention')}: {{participant:${member.agentId}}}`,
          ...(task.control?.mode === 'smoke_test'
            ? [taskText(task, '冒烟测试模式：当前线程仅用于验证，不代表默认产品体验。', 'Smoke Test Mode: this thread is being used for validation, not for the default product UX.')]
            : task.control?.mode === 'regression_test'
              ? [taskText(task, '回归代理模式：AgoraBot 在当前线程里代表开发者推进任务、执行回归牵引；这只在开发环境中生效。', 'Regression Proxy Mode: AgoraBot represents the developer in this thread to drive the task and perform regression steering; this only applies in developer environments.')]
              : []),
          ...(member.briefing_mode !== 'overlay_delta' && roleDocPath ? [`${taskText(task, '阅读角色文档', 'Read role doc')}: ${roleDocPath}`] : []),
          ...(member.briefing_mode === 'overlay_delta'
            ? [taskText(task, '该 Agent 已自带 Agora 托管的基础角色上下文；以下 role brief 只提供本任务增量。', 'This agent already carries Agora-managed base role context; use the role brief below as task delta.')]
            : [taskText(task, '该 Agent 应在行动前加载完整的 Agora 角色覆盖上下文。', 'This agent should load the full Agora role overlay before acting.')]),
          ...(citizenScaffoldPath ? [`${taskText(task, '阅读 Citizen Scaffold', 'Read citizen scaffold')}: ${citizenScaffoldPath}`] : []),
          ...(roleBriefPath ? [`${taskText(task, '阅读角色简报', 'Read role brief')}: ${roleBriefPath}`] : []),
          ...(roleSkillLines.length > 0
            ? [
                `${taskText(task, 'Role Skills', 'Role Skills')}:`,
                ...roleSkillLines,
              ]
            : []),
        ].join('\n'),
      });
    }

    return messages;
  }

  buildSmokeExecutionCommandsForTask(task: TaskRecord, executionId: string, status: string) {
    return this.buildSmokeExecutionCommands(task, executionId, status);
  }

  buildSmokePostInputCommandsForTask(task: TaskRecord, executionId: string) {
    return this.buildSmokePostInputCommands(task, executionId);
  }

  publishCraftsmanExecutionUpdate(input: {
    task: TaskRecord;
    subtask: SubtaskLike;
    execution: CraftsmanExecutionLike;
  }) {
    const { task, subtask, execution } = input;
    const eventType = execution.status === 'succeeded'
      ? 'craftsman_completed'
      : execution.status === 'running'
        ? 'craftsman_running'
      : execution.status === 'needs_input'
        ? 'craftsman_needs_input'
      : execution.status === 'awaiting_choice'
        ? 'craftsman_awaiting_choice'
        : 'craftsman_failed';
    const payload = execution.callback_payload;
    this.publishTaskStatusBroadcast(task, {
      kind: eventType,
      bodyLines: [
        `Craftsman callback settled for subtask ${subtask.id}.`,
        `Adapter: ${execution.adapter}`,
        `Execution: ${execution.execution_id}`,
        `Status: ${execution.status}`,
        ...(subtask.output ? [`Output: ${summarizeCraftsmanOutputForHuman(subtask.output, execution.status)}`] : []),
        ...(payload?.input_request?.hint ? [`Input Hint: ${payload.input_request.hint}`] : []),
        ...((payload?.input_request?.choice_options?.length ?? 0) > 0
          ? [`Choices: ${payload?.input_request?.choice_options?.map((option) => `${option.id}:${option.label}`).join(', ')}`]
          : []),
        ...this.buildSmokeExecutionCommands(task, execution.execution_id, execution.status),
      ],
      ...(execution.finished_at ? { occurredAt: execution.finished_at } : {}),
    });
  }

  publishCraftsmanInputUpdate(input: {
    task: TaskRecord;
    actor: string;
    subtaskId: string;
    executionId: string;
    inputType: 'text' | 'keys' | 'choice';
    detail: string;
  }) {
    const { task, actor, subtaskId, executionId, inputType, detail } = input;
    this.mirrorConversationEntry(task.id, {
      actor,
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

  private buildSmokeExecutionCommands(task: TaskRecord, executionId: string, status: string): string[] {
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

  private buildSmokePostInputCommands(task: TaskRecord, executionId: string): string[] {
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

  private renderResolvedSkillLines(skillRefs: string[], catalog: Map<string, SkillCatalogEntry>) {
    if (skillRefs.length === 0) {
      return [];
    }
    return skillRefs.map((skillRef) => {
      const resolved = catalog.get(skillRef);
      return resolved
        ? `- ${skillRef} -> ${resolved.resolved_path}`
        : `- ${skillRef} -> (unresolved)`;
    });
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

function resolveImContextModeForStateTransition(
  fromState: TaskStateLike,
  toState: TaskStateLike,
): 'archive' | 'unarchive' | null {
  if (toState === 'paused' || toState === 'cancelled') {
    return 'archive';
  }
  if (fromState === 'paused' && toState === 'active') {
    return 'unarchive';
  }
  return null;
}
