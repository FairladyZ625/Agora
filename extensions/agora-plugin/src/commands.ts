import { AgoraBridge } from "./bridge";
import { resolveCommandTokens } from "./command-args";
import { createWizardStore, resolveCreateWizardSessionKey } from "./create-wizard-store";
import { noopPluginTrace, type PluginTrace } from "./trace";
import type { CommandContext, CommandResult, OpenClawPluginApi } from "./types";

export { tokenize } from "./command-args";

const SUPPORTED_TASK_TYPES = ["coding", "coding_heavy", "research", "document", "quick", "brainstorm"] as const;
const TASK_SUBCOMMANDS = new Set([
  "create",
  "list",
  "status",
  "advance",
  "approve",
  "reject",
  "archon-approve",
  "archon-reject",
  "confirm",
  "subtask-done",
  "force-advance",
  "pause",
  "resume",
  "cancel",
  "unblock",
  "cleanup",
]);

export function registerTaskCommands(
  api: OpenClawPluginApi,
  bridge: AgoraBridge,
  trace: PluginTrace = noopPluginTrace,
): void {
  api.registerCommand({
    name: "task",
    description: "Agora task management",
    acceptsArgs: true,
    requireAuth: false,
    handler: async (ctx) => {
      const tokens = resolveCommandTokens("task", ctx);
      const [subcommand, ...rest] = tokens;
      const senderId = ctx.senderId || ctx.from || "unknown";
      const wizardSessionKey = resolveCreateWizardSessionKey("task", ctx);
      const wizardSession = createWizardStore.get(wizardSessionKey);
      trace.slash(ctx, {
        event: "dispatch",
        command: "task",
        subcommand,
        tokens,
        wizardSessionKey,
        wizardState: wizardSession ? `${wizardSession.kind}:${wizardSession.step}` : undefined,
      });

      try {
        const wizardResult = await maybeHandleTaskWizard({
          bridge,
          ctx,
          tokens,
          subcommand,
          senderId,
          wizardSessionKey,
          trace,
        });
        if (wizardResult) {
          return wizardResult;
        }
        switch (subcommand) {
          case "create":
            return await handleCreate(bridge, rest, senderId);
          case "list":
            return await handleList(bridge, rest);
          case "status":
            return await handleStatus(bridge, rest);
          case "advance":
            return await handleAdvance(bridge, rest, senderId);
          case "approve":
            return await handleApprove(bridge, rest, ctx);
          case "reject":
            return await handleReject(bridge, rest, ctx);
          case "archon-approve":
            return await handleArchonApprove(bridge, rest, ctx);
          case "archon-reject":
            return await handleArchonReject(bridge, rest, ctx);
          case "confirm":
            return await handleConfirm(bridge, rest, senderId);
          case "subtask-done":
            return await handleSubtaskDone(bridge, rest, senderId);
          case "force-advance":
            return await handleForceAdvance(bridge, rest);
          case "pause":
            return await handlePause(bridge, rest);
          case "resume":
            return await handleResume(bridge, rest);
          case "cancel":
            return await handleCancel(bridge, rest);
          case "unblock":
            return await handleUnblock(bridge, rest);
          case "cleanup":
            return await handleCleanup(bridge, rest);
          default:
            return { text: formatHelp(ctx) };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { text: `Task command failed: ${message}` };
      }
    },
  });
}

async function maybeHandleTaskWizard(input: {
  bridge: AgoraBridge;
  ctx: CommandContext;
  tokens: string[];
  subcommand?: string;
  senderId: string;
  wizardSessionKey: string;
  trace: PluginTrace;
}): Promise<CommandResult | null> {
  const session = createWizardStore.get(input.wizardSessionKey);
  if (input.subcommand === "create" && input.tokens.length === 1) {
    createWizardStore.set(input.wizardSessionKey, {
      kind: "task",
      step: "title",
      senderId: input.senderId,
    });
    input.trace.slash(input.ctx, {
      event: "wizard_start",
      command: "task",
      subcommand: input.subcommand,
      tokens: input.tokens,
      wizardSessionKey: input.wizardSessionKey,
      wizardState: "task:title",
    });
    return { text: formatTaskWizardTitlePrompt() };
  }
  if (!session || session.kind !== "task") {
    return null;
  }
  if (input.subcommand === "create" && input.tokens.length > 1) {
    createWizardStore.clear(input.wizardSessionKey);
    return null;
  }
  if (!shouldConsumeWizardInput(input.tokens, input.subcommand, TASK_SUBCOMMANDS)) {
    return null;
  }

  const answer = normalizeWizardAnswer(input.tokens);
  if (!answer || answer === "help") {
    input.trace.slash(input.ctx, {
      event: "wizard_prompt",
      command: "task",
      subcommand: input.subcommand,
      tokens: input.tokens,
      wizardSessionKey: input.wizardSessionKey,
      wizardState: `${session.kind}:${session.step}`,
      note: "help_or_empty",
    });
    return {
      text: session.step === "title"
        ? formatTaskWizardTitlePrompt()
        : formatTaskWizardTypePrompt(session.title ?? ""),
    };
  }
  if (answer === "cancel") {
    createWizardStore.clear(input.wizardSessionKey);
    input.trace.slash(input.ctx, {
      event: "wizard_cancel",
      command: "task",
      subcommand: input.subcommand,
      tokens: input.tokens,
      wizardSessionKey: input.wizardSessionKey,
      wizardState: `${session.kind}:${session.step}`,
    });
    return { text: "Task create wizard cancelled." };
  }

  if (session.step === "title") {
    createWizardStore.set(input.wizardSessionKey, {
      kind: "task",
      step: "type",
      senderId: input.senderId,
      title: answer,
    });
    input.trace.slash(input.ctx, {
      event: "wizard_prompt",
      command: "task",
      subcommand: input.subcommand,
      tokens: input.tokens,
      wizardSessionKey: input.wizardSessionKey,
      wizardState: "task:type",
      note: `title=${answer}`,
    });
    return { text: formatTaskWizardTypePrompt(answer) };
  }

  if (answer !== "skip" && !isTaskType(answer)) {
    input.trace.slash(input.ctx, {
      event: "wizard_invalid",
      command: "task",
      subcommand: input.subcommand,
      tokens: input.tokens,
      wizardSessionKey: input.wizardSessionKey,
      wizardState: `${session.kind}:${session.step}`,
      note: `invalid_type=${answer}`,
    });
    return { text: formatTaskWizardInvalidType(answer, session.title ?? "") };
  }

  const type = answer === "skip" ? "coding" : answer;
  const task = await input.bridge.createTask(session.title ?? "Untitled Task", type, input.senderId);
  createWizardStore.clear(input.wizardSessionKey);
  input.trace.slash(input.ctx, {
    event: "wizard_complete",
    command: "task",
    subcommand: input.subcommand,
    tokens: input.tokens,
    wizardSessionKey: input.wizardSessionKey,
    wizardState: "task:type",
    note: `task_id=${task.id}`,
  });
  return {
    text: [
      `Created ${task.id} (${task.type}) - ${task.title}`,
      "Wizard complete.",
    ].join("\n"),
  };
}

async function handleCreate(bridge: AgoraBridge, args: string[], senderId: string): Promise<CommandResult> {
  if (args.length < 1) {
    return { text: formatTaskWizardTitlePrompt() };
  }

  let type = "coding";
  let title = args.join(" ");

  if (args.length === 2 && !isTaskType(args[1]) && looksLikeTypeToken(args[1])) {
    return { text: formatInvalidTypeGuidance(args[1]) };
  }

  if (args.length > 1 && isTaskType(args[args.length - 1])) {
    type = args[args.length - 1];
    title = args.slice(0, -1).join(" ");
  }

  const task = await bridge.createTask(title, type, senderId);
  return { text: `Created ${task.id} (${task.type}) - ${task.title}` };
}

async function handleList(bridge: AgoraBridge, args: string[]): Promise<CommandResult> {
  const state = args[0];
  const tasks = await bridge.listTasks(state);
  if (!tasks.length) {
    return { text: "No tasks found." };
  }
  const lines = tasks.slice(0, 10).map((task) => `${task.id} | ${task.state} | ${task.current_stage} | ${task.title}`);
  return { text: lines.join("\n") };
}

async function handleStatus(bridge: AgoraBridge, args: string[]): Promise<CommandResult> {
  const taskId = args[0];
  if (!taskId) {
    return { text: "Usage: /task status <task_id>" };
  }
  const result = await bridge.taskStatus(taskId);
  const task = result.task;
  const flowCount = Array.isArray(result.flow_log) ? result.flow_log.length : 0;
  const subtaskCount = Array.isArray(result.subtasks) ? result.subtasks.length : 0;
  return {
    text: `${task.id} | ${task.state} | ${task.current_stage}\nflow_log=${flowCount}, subtasks=${subtaskCount}`,
  };
}

async function handleAdvance(bridge: AgoraBridge, args: string[], senderId: string): Promise<CommandResult> {
  const taskId = args[0];
  if (!taskId) {
    return { text: "Usage: /task advance <task_id>" };
  }
  const task = await bridge.advanceTask(taskId, senderId);
  return { text: `${task.id} advanced to ${task.current_stage || task.state}` };
}

async function handleApprove(
  bridge: AgoraBridge,
  args: string[],
  ctx: { senderId?: string; from?: string; threadId?: string; conversationId?: string; channelId?: string; provider?: string },
): Promise<CommandResult> {
  const senderId = ctx.senderId || ctx.from || "unknown";
  const provider = resolveProvider(ctx);
  const threadRef = ctx.threadId ?? ctx.channelId;
  const conversationRef = ctx.conversationId;
  if (!looksLikeTaskId(args[0]) && (threadRef || conversationRef)) {
    if (!provider) {
      return { text: "Provider context is required for current-thread /task approve" };
    }
    const task = await bridge.approveCurrent({
      provider,
      threadRef,
      conversationRef,
      actorId: senderId,
      comment: args.join(" "),
    });
    return { text: `${task.id} approved` };
  }
  const taskId = args[0];
  if (!taskId) {
    return { text: "Usage: /task approve [task_id] [comment]" };
  }
  const comment = args.slice(1).join(" ");
  const task = await bridge.approve(taskId, senderId, comment, provider);
  return { text: `${task.id} approved` };
}

async function handleReject(
  bridge: AgoraBridge,
  args: string[],
  ctx: { senderId?: string; from?: string; threadId?: string; conversationId?: string; channelId?: string; provider?: string },
): Promise<CommandResult> {
  const senderId = ctx.senderId || ctx.from || "unknown";
  const provider = resolveProvider(ctx);
  const threadRef = ctx.threadId ?? ctx.channelId;
  const conversationRef = ctx.conversationId;
  if (!looksLikeTaskId(args[0]) && (threadRef || conversationRef)) {
    if (!provider) {
      return { text: "Provider context is required for current-thread /task reject" };
    }
    const task = await bridge.rejectCurrent({
      provider,
      threadRef,
      conversationRef,
      actorId: senderId,
      reason: args.join(" "),
    });
    return { text: `${task.id} rejected` };
  }
  const taskId = args[0];
  if (!taskId) {
    return { text: "Usage: /task reject [task_id] [reason]" };
  }
  const reason = args.slice(1).join(" ");
  const task = await bridge.reject(taskId, senderId, reason, provider);
  return { text: `${task.id} rejected` };
}

async function handleArchonApprove(
  bridge: AgoraBridge,
  args: string[],
  ctx: { senderId?: string; from?: string; provider?: string },
): Promise<CommandResult> {
  const taskId = args[0];
  if (!taskId) {
    return { text: "Usage: /task archon-approve <task_id> [comment]" };
  }
  const senderId = ctx.senderId || ctx.from || "unknown";
  const provider = resolveProvider(ctx);
  if (!provider) {
    return { text: "Provider context is required for /task archon-approve" };
  }
  const comment = args.slice(1).join(" ");
  const task = await bridge.archonApprove(taskId, senderId, provider, comment);
  return { text: `${task.id} archon-approved` };
}

async function handleArchonReject(
  bridge: AgoraBridge,
  args: string[],
  ctx: { senderId?: string; from?: string; provider?: string },
): Promise<CommandResult> {
  const taskId = args[0];
  if (!taskId) {
    return { text: "Usage: /task archon-reject <task_id> [reason]" };
  }
  const senderId = ctx.senderId || ctx.from || "unknown";
  const provider = resolveProvider(ctx);
  if (!provider) {
    return { text: "Provider context is required for /task archon-reject" };
  }
  const reason = args.slice(1).join(" ");
  const task = await bridge.archonReject(taskId, senderId, provider, reason);
  return { text: `${task.id} archon-rejected` };
}

function resolveProvider(ctx: { provider?: string; from?: string }): string | undefined {
  if (ctx.provider?.trim()) {
    return ctx.provider.trim();
  }
  const from = ctx.from?.trim();
  if (!from) {
    return undefined;
  }
  const [provider] = from.split(":");
  return provider?.trim() || undefined;
}

async function handleConfirm(bridge: AgoraBridge, args: string[], senderId: string): Promise<CommandResult> {
  const taskId = args[0];
  const vote = args[1] === "reject" ? "reject" : "approve";
  if (!taskId) {
    return { text: "Usage: /task confirm <task_id> [approve|reject] [comment]" };
  }
  const comment = args.slice(2).join(" ");
  const task = await bridge.confirm(taskId, senderId, vote, comment);
  return { text: `${task.id} vote recorded (${vote})` };
}

async function handleSubtaskDone(bridge: AgoraBridge, args: string[], senderId: string): Promise<CommandResult> {
  const taskId = args[0];
  const subtaskId = args[1];
  if (!taskId || !subtaskId) {
    return { text: "Usage: /task subtask-done <task_id> <subtask_id> [output]" };
  }
  const output = args.slice(2).join(" ");
  await bridge.subtaskDone(taskId, subtaskId, senderId, output);
  return { text: `${taskId}/${subtaskId} done` };
}

async function handleForceAdvance(bridge: AgoraBridge, args: string[]): Promise<CommandResult> {
  const taskId = args[0];
  if (!taskId) {
    return { text: "Usage: /task force-advance <task_id> [reason]" };
  }
  const reason = args.slice(1).join(" ");
  const task = await bridge.forceAdvance(taskId, reason);
  return { text: `${task.id} force-advanced` };
}

async function handlePause(bridge: AgoraBridge, args: string[]): Promise<CommandResult> {
  const taskId = args[0];
  if (!taskId) {
    return { text: "Usage: /task pause <task_id> [reason]" };
  }
  const reason = args.slice(1).join(" ");
  const task = await bridge.pause(taskId, reason);
  return { text: `${task.id} paused` };
}

async function handleResume(bridge: AgoraBridge, args: string[]): Promise<CommandResult> {
  const taskId = args[0];
  if (!taskId) {
    return { text: "Usage: /task resume <task_id>" };
  }
  const task = await bridge.resume(taskId);
  return { text: `${task.id} resumed` };
}

async function handleCancel(bridge: AgoraBridge, args: string[]): Promise<CommandResult> {
  const taskId = args[0];
  if (!taskId) {
    return { text: "Usage: /task cancel <task_id> [reason]" };
  }
  const reason = args.slice(1).join(" ");
  const task = await bridge.cancel(taskId, reason);
  return { text: `${task.id} cancelled` };
}

async function handleUnblock(bridge: AgoraBridge, args: string[]): Promise<CommandResult> {
  const taskId = args[0];
  if (!taskId) {
    return { text: "Usage: /task unblock <task_id> [reason]" };
  }
  const reason = args.slice(1).join(" ");
  const task = await bridge.unblock(taskId, reason);
  return { text: `${task.id} unblocked` };
}

async function handleCleanup(bridge: AgoraBridge, args: string[]): Promise<CommandResult> {
  const taskId = args[0];
  const result = await bridge.cleanup(taskId);
  return { text: `cleaned ${result.cleaned || 0} task(s)` };
}

function formatHelp(ctx?: { threadId?: string; conversationId?: string }): string {
  return formatHelpWithContext(ctx);
}

function formatHelpWithContext(ctx?: { threadId?: string; conversationId?: string }): string {
  if (ctx?.threadId || ctx?.conversationId) {
    return [
      "Agora /task commands:",
      "You are in a task thread.",
      "Most relevant here:",
      "- /task status <task_id>",
      "- /task approve [comment]",
      "- /task reject [reason]",
      "- /task advance <task_id>",
      "",
      "Need to create a new task elsewhere?",
      '- /task create "fix dashboard create flow" coding',
      "",
      `Supported task types: ${SUPPORTED_TASK_TYPES.join(", ")}`,
    ].join("\n");
  }

  return [
    "Agora /task commands:",
    "Most common:",
    '- /task create "fix dashboard create flow" coding',
    "- /task list active",
    "- /task status OC-123",
    "",
    "Supported task types:",
    `- ${SUPPORTED_TASK_TYPES.join("\n- ")}`,
    "",
    "Full command list:",
    "- /task create <title> [type]",
    "- /task list [state]",
    "- /task status <task_id>",
    "- /task advance <task_id>",
    "- /task approve [task_id] [comment]",
    "- /task reject [task_id] [reason]",
    "- /task archon-approve <task_id> [comment]",
    "- /task archon-reject <task_id> [reason]",
    "- /task confirm <task_id> [approve|reject] [comment]",
    "- /task subtask-done <task_id> <subtask_id> [output]",
    "- /task force-advance <task_id> [reason]",
    "- /task pause <task_id> [reason]",
    "- /task resume <task_id>",
    "- /task cancel <task_id> [reason]",
    "- /task unblock <task_id> [reason]",
    "- /task cleanup [task_id]",
  ].join("\n");
}

function formatTaskWizardTitlePrompt(): string {
  return [
    "Task create wizard",
    "Step 1/2: send the task title.",
    'Example: /task "Fix dashboard create flow"',
    "Send `/task cancel` to exit.",
  ].join("\n");
}

function formatTaskWizardTypePrompt(title: string): string {
  return [
    "Task create wizard",
    `Title: ${title}`,
    "Step 2/2: send the task type, or `/task skip` to use the default `coding`.",
    `Supported task types: ${SUPPORTED_TASK_TYPES.join(", ")}`,
    "Example: /task coding",
  ].join("\n");
}

function formatTaskWizardInvalidType(type: string, title: string): string {
  return [
    "Task create wizard",
    `Title: ${title}`,
    `Unknown task type: "${type}"`,
    `Supported task types: ${SUPPORTED_TASK_TYPES.join(", ")}`,
    "Send `/task skip` to use the default `coding`, or `/task cancel` to exit.",
  ].join("\n");
}

function formatInvalidTypeGuidance(type: string): string {
  return [
    `Unknown task type: "${type}"`,
    `Supported task types: ${SUPPORTED_TASK_TYPES.join(", ")}`,
    "",
    'Example: /task create "fix dashboard create flow" coding',
  ].join("\n");
}

function isTaskType(value: string): boolean {
  return (SUPPORTED_TASK_TYPES as readonly string[]).includes(value);
}

function looksLikeTypeToken(value: string): boolean {
  return /^[a-z][a-z0-9_]+$/i.test(value);
}

function looksLikeTaskId(value?: string): boolean {
  return typeof value === "string" && /^OC[-A-Z0-9]/i.test(value);
}

function shouldConsumeWizardInput(tokens: string[], subcommand: string | undefined, commands: Set<string>) {
  if (tokens.length === 0) {
    return true;
  }
  if (tokens.length === 1 && (tokens[0] === "cancel" || tokens[0] === "help" || tokens[0] === "skip")) {
    return true;
  }
  if (!subcommand) {
    return true;
  }
  return !commands.has(subcommand);
}

function normalizeWizardAnswer(tokens: string[]) {
  return tokens.join(" ").trim();
}
