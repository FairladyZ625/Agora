import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerTaskCommands, tokenize } from "../src/commands";
import { resetCreateWizardStore } from "../src/create-wizard-store";
import { createPluginTrace } from "../src/trace";

function buildApi() {
  let registered: any = null;
  const loggerMessages = {
    info: [] as string[],
    error: [] as string[],
  };
  return {
    api: {
      pluginConfig: {
        traceNativeSlash: true,
      },
      logger: {
        info(message: string) {
          loggerMessages.info.push(message);
        },
        error(message: string) {
          loggerMessages.error.push(message);
        },
      },
      registerCommand(command: any) {
        registered = command;
      },
    },
    loggerMessages,
    getCommand() {
      return registered;
    },
  };
}

describe("tokenize", () => {
  it("handles quoted args", () => {
    expect(tokenize('create "hello world" coding')).toEqual(["create", "hello world", "coding"]);
    expect(tokenize("create 'hello world' coding")).toEqual(["create", "hello world", "coding"]);
  });

  it("returns an empty array for blank input", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize("   ")).toEqual([]);
  });
});

describe("registerTaskCommands", () => {
  beforeEach(() => {
    resetCreateWizardStore();
  });

  it("returns help when subcommand is unknown", async () => {
    const { api, getCommand } = buildApi();
    const bridge = {} as any;
    registerTaskCommands(api as any, bridge, createPluginTrace(api as any));

    const result = await getCommand().handler({ args: "unknown", senderId: "u1" });
    expect(result.text).toContain("Agora /task commands:");
    expect(result.text).toContain("/task create");
    expect(result.text).toContain("Most common:");
    expect(result.text).toContain("Supported task types:");
  });

  it("starts a create wizard when title is missing", async () => {
    const { api, getCommand } = buildApi();
    const bridge = {} as any;
    registerTaskCommands(api as any, bridge, createPluginTrace(api as any));

    const result = await getCommand().handler({ args: "create", senderId: "u1" });
    expect(result.text).toContain("Task create wizard");
    expect(result.text).toContain("Step 1/2");
    expect(result.text).toContain('/task "Fix dashboard create flow"');
  });

  it("returns guided help when no subcommand is provided inside a task thread", async () => {
    const { api, getCommand } = buildApi();
    const bridge = {} as any;
    registerTaskCommands(api as any, bridge, createPluginTrace(api as any));

    const result = await getCommand().handler({
      args: "",
      senderId: "u1",
      provider: "discord",
      threadId: "thread-1",
      conversationId: "channel-1",
    });

    expect(result.text).toContain("You are in a task thread.");
    expect(result.text).toContain("/task approve [comment]");
    expect(result.text).toContain("/task reject [reason]");
    expect(result.text).toContain("/task status <task_id>");
  });

  it("returns invalid-type guidance for unknown create types", async () => {
    const { api, getCommand } = buildApi();
    const bridge = {} as any;
    registerTaskCommands(api as any, bridge, createPluginTrace(api as any));

    const result = await getCommand().handler({ args: 'create "hello world" wrong_type', senderId: "u1" });

    expect(result.text).toContain('Unknown task type: "wrong_type"');
    expect(result.text).toContain("Supported task types:");
    expect(result.text).toContain("coding_heavy");
  });

  it("calls bridge.createTask with parsed args", async () => {
    const createTask = vi.fn(async () => ({ id: "OC-001", type: "coding", title: "hello world" }));
    const { api, getCommand } = buildApi();
    const bridge = { createTask } as any;
    registerTaskCommands(api as any, bridge, createPluginTrace(api as any));

    const result = await getCommand().handler({ args: 'create "hello world" coding', senderId: "u1" });

    expect(createTask).toHaveBeenCalledWith("hello world", "coding", "u1");
    expect(result.text).toContain("Created OC-001");
  });

  it("walks the user through title then type and completes create", async () => {
    const createTask = vi.fn(async () => ({ id: "OC-WIZ-1", type: "coding", title: "guided task smoke" }));
    const { api, getCommand, loggerMessages } = buildApi();
    registerTaskCommands(api as any, { createTask } as any, createPluginTrace(api as any));

    const start = await getCommand().handler({ args: "create", senderId: "u1", provider: "discord", conversationId: "hall" });
    const title = await getCommand().handler({ args: '"guided task smoke"', senderId: "u1", provider: "discord", conversationId: "hall" });
    const type = await getCommand().handler({ args: "coding", senderId: "u1", provider: "discord", conversationId: "hall" });

    expect(start.text).toContain("Step 1/2");
    expect(title.text).toContain("Step 2/2");
    expect(title.text).toContain("guided task smoke");
    expect(createTask).toHaveBeenCalledWith("guided task smoke", "coding", "u1");
    expect(type.text).toContain("Created OC-WIZ-1");
    expect(type.text).toContain("Wizard complete.");
    expect(loggerMessages.info.some((message) => message.includes('"event":"wizard_start"'))).toBe(true);
    expect(loggerMessages.info.some((message) => message.includes('"event":"wizard_complete"'))).toBe(true);
    expect(loggerMessages.info.some((message) => message.includes('"wizard_session_key":"task:discord:hall:u1"'))).toBe(true);
  });

  it("lets the user skip task type and falls back to coding", async () => {
    const createTask = vi.fn(async () => ({ id: "OC-WIZ-2", type: "coding", title: "guided default task" }));
    const { api, getCommand } = buildApi();
    registerTaskCommands(api as any, { createTask } as any, createPluginTrace(api as any));

    await getCommand().handler({ args: "create", senderId: "u1", provider: "discord", conversationId: "hall" });
    await getCommand().handler({ args: '"guided default task"', senderId: "u1", provider: "discord", conversationId: "hall" });
    const result = await getCommand().handler({ args: "skip", senderId: "u1", provider: "discord", conversationId: "hall" });

    expect(createTask).toHaveBeenCalledWith("guided default task", "coding", "u1");
    expect(result.text).toContain("Created OC-WIZ-2");
  });

  it("keeps task wizard open for invalid type and supports cancel", async () => {
    const createTask = vi.fn(async () => ({ id: "OC-WIZ-3", type: "coding", title: "guided invalid type" }));
    const { api, getCommand, loggerMessages } = buildApi();
    registerTaskCommands(api as any, { createTask } as any, createPluginTrace(api as any));

    await getCommand().handler({ args: "create", senderId: "u1", provider: "discord", conversationId: "hall" });
    await getCommand().handler({ args: '"guided invalid type"', senderId: "u1", provider: "discord", conversationId: "hall" });
    const invalid = await getCommand().handler({ args: "wrong_type", senderId: "u1", provider: "discord", conversationId: "hall" });
    const cancel = await getCommand().handler({ args: "cancel", senderId: "u1", provider: "discord", conversationId: "hall" });

    expect(invalid.text).toContain('Unknown task type: "wrong_type"');
    expect(invalid.text).toContain("Task create wizard");
    expect(createTask).not.toHaveBeenCalled();
    expect(cancel.text).toBe("Task create wizard cancelled.");
    expect(loggerMessages.info.some((message) => message.includes('"event":"wizard_invalid"'))).toBe(true);
    expect(loggerMessages.info.some((message) => message.includes('"event":"wizard_cancel"'))).toBe(true);
  });

  it("prefers commandBody over lossy args for quoted create titles", async () => {
    const createTask = vi.fn(async () => ({ id: "OC-002", type: "coding", title: "human smoke create" }));
    const { api, getCommand } = buildApi();
    registerTaskCommands(api as any, { createTask } as any, createPluginTrace(api as any));

    const result = await getCommand().handler({
      args: "create human smoke coding",
      commandBody: '/task create "human smoke create" coding',
      senderId: "u1",
    });

    expect(createTask).toHaveBeenCalledWith("human smoke create", "coding", "u1");
    expect(result.text).toContain("Created OC-002");
  });

  it("can resolve help from commandBody even when args are missing", async () => {
    const { api, getCommand } = buildApi();
    registerTaskCommands(api as any, {} as any, createPluginTrace(api as any));

    const result = await getCommand().handler({
      commandBody: "/task help",
      senderId: "u1",
    });

    expect(result.text).toContain("Agora /task commands:");
    expect(result.text).toContain("Most common:");
  });

  it.each([
    ["status", "Usage: /task status <task_id>"],
    ["advance", "Usage: /task advance <task_id>"],
    ["approve", "Usage: /task approve [task_id] [comment]"],
    ["reject", "Usage: /task reject [task_id] [reason]"],
    ["archon-approve", "Usage: /task archon-approve <task_id> [comment]"],
    ["archon-reject", "Usage: /task archon-reject <task_id> [reason]"],
    ["confirm", "Usage: /task confirm <task_id> [approve|reject] [comment]"],
    ["subtask-done", "Usage: /task subtask-done <task_id> <subtask_id> [output]"],
    ["force-advance", "Usage: /task force-advance <task_id> [reason]"],
    ["pause", "Usage: /task pause <task_id> [reason]"],
    ["resume", "Usage: /task resume <task_id>"],
    ["cancel", "Usage: /task cancel <task_id> [reason]"],
    ["unblock", "Usage: /task unblock <task_id> [reason]"],
  ])("returns usage when %s is missing required args", async (subcommand, expected) => {
    const { api, getCommand } = buildApi();
    registerTaskCommands(api as any, {} as any, createPluginTrace(api as any));

    const result = await getCommand().handler({ args: subcommand, senderId: "u1" });

    expect(result.text).toBe(expected);
  });

  it("passes provider through direct task approve inside discord context", async () => {
    const approve = vi.fn(async () => ({ id: "OC-1775041938434" }));
    const { api, getCommand } = buildApi();
    registerTaskCommands(api as any, { approve } as any, createPluginTrace(api as any));

    const result = await getCommand().handler({
      args: "approve OC-1775041938434",
      senderId: "530383608410800138",
      provider: "discord",
    });

    expect(approve).toHaveBeenCalledWith("OC-1775041938434", "530383608410800138", "", "discord");
    expect(result.text).toContain("OC-1775041938434 approved");
  });

  it("uses channelId as thread context fallback for current-thread approve", async () => {
    const approveCurrent = vi.fn(async () => ({ id: "OC-1775041938434" }));
    const { api, getCommand } = buildApi();
    registerTaskCommands(api as any, { approveCurrent } as any, createPluginTrace(api as any));

    const result = await getCommand().handler({
      args: "approve",
      senderId: "530383608410800138",
      provider: "discord",
      channelId: "discord-thread-1",
    });

    expect(approveCurrent).toHaveBeenCalledWith({
      provider: "discord",
      threadRef: "discord-thread-1",
      conversationRef: undefined,
      actorId: "530383608410800138",
      comment: "",
    });
    expect(result.text).toContain("OC-1775041938434 approved");
  });

  it("infers provider from from-context for current-thread approve", async () => {
    const approveCurrent = vi.fn(async () => ({ id: "OC-1775041938434" }));
    const { api, getCommand } = buildApi();
    registerTaskCommands(api as any, { approveCurrent } as any, createPluginTrace(api as any));

    const result = await getCommand().handler({
      args: "approve",
      senderId: "530383608410800138",
      from: "discord:channel:1488858559230771381",
      channelId: "1488858559230771381",
    });

    expect(approveCurrent).toHaveBeenCalledWith({
      provider: "discord",
      threadRef: "1488858559230771381",
      conversationRef: undefined,
      actorId: "530383608410800138",
      comment: "",
    });
    expect(result.text).toContain("OC-1775041938434 approved");
  });

  it("passes provider through direct task reject inside discord context", async () => {
    const reject = vi.fn(async () => ({ id: "OC-1775041938434" }));
    const { api, getCommand } = buildApi();
    registerTaskCommands(api as any, { reject } as any, createPluginTrace(api as any));

    const result = await getCommand().handler({
      args: "reject OC-1775041938434 needs-fixes",
      senderId: "530383608410800138",
      provider: "discord",
    });

    expect(reject).toHaveBeenCalledWith("OC-1775041938434", "530383608410800138", "needs-fixes", "discord");
    expect(result.text).toContain("OC-1775041938434 rejected");
  });

  it("uses channelId as thread context fallback for current-thread reject", async () => {
    const rejectCurrent = vi.fn(async () => ({ id: "OC-1775041938434" }));
    const { api, getCommand } = buildApi();
    registerTaskCommands(api as any, { rejectCurrent } as any, createPluginTrace(api as any));

    const result = await getCommand().handler({
      args: "reject",
      senderId: "530383608410800138",
      provider: "discord",
      channelId: "discord-thread-1",
    });

    expect(rejectCurrent).toHaveBeenCalledWith({
      provider: "discord",
      threadRef: "discord-thread-1",
      conversationRef: undefined,
      actorId: "530383608410800138",
      reason: "",
    });
    expect(result.text).toContain("OC-1775041938434 rejected");
  });

  it("infers provider from from-context for direct task approve and reject", async () => {
    const approve = vi.fn(async () => ({ id: "OC-1775041938434" }));
    const reject = vi.fn(async () => ({ id: "OC-1775041938434" }));
    const { api, getCommand } = buildApi();
    registerTaskCommands(api as any, { approve, reject } as any, createPluginTrace(api as any));

    await getCommand().handler({
      args: "approve OC-1775041938434",
      senderId: "530383608410800138",
      from: "discord:channel:1488858559230771381",
    });
    await getCommand().handler({
      args: "reject OC-1775041938434 not-yet",
      senderId: "530383608410800138",
      from: "discord:channel:1488858559230771381",
    });

    expect(approve).toHaveBeenCalledWith("OC-1775041938434", "530383608410800138", "", "discord");
    expect(reject).toHaveBeenCalledWith("OC-1775041938434", "530383608410800138", "not-yet", "discord");
  });

  it("formats happy-path command replies across the task command surface", async () => {
    const bridge = {
      listTasks: vi.fn(async () => [{ id: "OC-101", state: "active", current_stage: "develop", title: "Task one" }]),
      taskStatus: vi.fn(async () => ({ task: { id: "OC-101", state: "active", current_stage: "review" }, flow_log: [{}], subtasks: [{}, {}] })),
      advanceTask: vi.fn(async () => ({ id: "OC-101", current_stage: "review", state: "active" })),
      approve: vi.fn(async () => ({ id: "OC-101" })),
      reject: vi.fn(async () => ({ id: "OC-101" })),
      archonApprove: vi.fn(async () => ({ id: "OC-101" })),
      archonReject: vi.fn(async () => ({ id: "OC-101" })),
      confirm: vi.fn(async () => ({ id: "OC-101" })),
      subtaskDone: vi.fn(async () => ({ id: "OC-101" })),
      forceAdvance: vi.fn(async () => ({ id: "OC-101" })),
      pause: vi.fn(async () => ({ id: "OC-101" })),
      resume: vi.fn(async () => ({ id: "OC-101" })),
      cancel: vi.fn(async () => ({ id: "OC-101" })),
      unblock: vi.fn(async () => ({ id: "OC-101" })),
      cleanup: vi.fn(async () => ({ cleaned: 2 })),
      approveCurrent: vi.fn(async () => ({ id: "OC-201" })),
      rejectCurrent: vi.fn(async () => ({ id: "OC-202" })),
    } as any;
    const { api, getCommand } = buildApi();
    registerTaskCommands(api as any, bridge, createPluginTrace(api as any));

    await expect(getCommand().handler({ args: "list active", senderId: "u1" })).resolves.toEqual({
      text: "OC-101 | active | develop | Task one",
    });
    await expect(getCommand().handler({ args: "status OC-101", senderId: "u1" })).resolves.toEqual({
      text: "OC-101 | active | review\nflow_log=1, subtasks=2",
    });
    await expect(getCommand().handler({ args: "advance OC-101", senderId: "u1" })).resolves.toEqual({
      text: "OC-101 advanced to review",
    });
    await expect(getCommand().handler({ args: "approve OC-101 ship-it", senderId: "u1" })).resolves.toEqual({
      text: "OC-101 approved",
    });
    await expect(getCommand().handler({ args: "reject OC-101 needs-work", senderId: "u1" })).resolves.toEqual({
      text: "OC-101 rejected",
    });
    await expect(getCommand().handler({ args: "archon-approve OC-101 ok", senderId: "u1", provider: "feishu" })).resolves.toEqual({
      text: "OC-101 archon-approved",
    });
    await expect(getCommand().handler({ args: "archon-reject OC-101 no", senderId: "u1", provider: "feishu" })).resolves.toEqual({
      text: "OC-101 archon-rejected",
    });
    await expect(getCommand().handler({ args: "confirm OC-101 approve done", senderId: "u1" })).resolves.toEqual({
      text: "OC-101 vote recorded (approve)",
    });
    await expect(getCommand().handler({ args: "subtask-done OC-101 sub-1 output", senderId: "u1" })).resolves.toEqual({
      text: "OC-101/sub-1 done",
    });
    await expect(getCommand().handler({ args: "force-advance OC-101 skip", senderId: "u1" })).resolves.toEqual({
      text: "OC-101 force-advanced",
    });
    await expect(getCommand().handler({ args: "pause OC-101 hold", senderId: "u1" })).resolves.toEqual({
      text: "OC-101 paused",
    });
    await expect(getCommand().handler({ args: "resume OC-101", senderId: "u1" })).resolves.toEqual({
      text: "OC-101 resumed",
    });
    await expect(getCommand().handler({ args: "cancel OC-101 done", senderId: "u1" })).resolves.toEqual({
      text: "OC-101 cancelled",
    });
    await expect(getCommand().handler({ args: "unblock OC-101 clear", senderId: "u1" })).resolves.toEqual({
      text: "OC-101 unblocked",
    });
    await expect(getCommand().handler({ args: "cleanup OC-101", senderId: "u1" })).resolves.toEqual({
      text: "cleaned 2 task(s)",
    });

    expect(bridge.listTasks).toHaveBeenCalledWith("active");
    expect(bridge.confirm).toHaveBeenCalledWith("OC-101", "u1", "approve", "done");
    expect(bridge.cleanup).toHaveBeenCalledWith("OC-101");
  });

  it("uses current thread context for approve/reject when no task id is provided", async () => {
    const bridge = {
      approveCurrent: vi.fn(async () => ({ id: "OC-201" })),
      rejectCurrent: vi.fn(async () => ({ id: "OC-202" })),
    } as any;
    const { api, getCommand } = buildApi();
    registerTaskCommands(api as any, bridge);

    await expect(getCommand().handler({
      args: "approve ship-it",
      senderId: "u1",
      provider: "discord",
      threadId: "thread-7",
      conversationId: "channel-1",
    })).resolves.toEqual({ text: "OC-201 approved" });
    await expect(getCommand().handler({
      args: "reject needs-tests",
      senderId: "u2",
      provider: "discord",
      threadId: "thread-8",
    })).resolves.toEqual({ text: "OC-202 rejected" });

    expect(bridge.approveCurrent).toHaveBeenCalledWith({
      provider: "discord",
      threadRef: "thread-7",
      conversationRef: "channel-1",
      actorId: "u1",
      comment: "ship-it",
    });
    expect(bridge.rejectCurrent).toHaveBeenCalledWith({
      provider: "discord",
      threadRef: "thread-8",
      conversationRef: undefined,
      actorId: "u2",
      reason: "needs-tests",
    });
  });

  it("requires provider context for current-thread approve/reject", async () => {
    const bridge = {
      approveCurrent: vi.fn(async () => ({ id: "OC-301" })),
      rejectCurrent: vi.fn(async () => ({ id: "OC-302" })),
    } as any;
    const { api, getCommand } = buildApi();
    registerTaskCommands(api as any, bridge);

    await expect(getCommand().handler({
      args: "approve",
      threadId: "thread-11",
    })).resolves.toEqual({
      text: "Provider context is required for current-thread /task approve",
    });
    await expect(getCommand().handler({
      args: "reject",
      conversationId: "channel-11",
    })).resolves.toEqual({
      text: "Provider context is required for current-thread /task reject",
    });

    expect(bridge.approveCurrent).not.toHaveBeenCalled();
    expect(bridge.rejectCurrent).not.toHaveBeenCalled();
  });

  it("requires provider context for archon review actions", async () => {
    const { api, getCommand } = buildApi();
    registerTaskCommands(api as any, {
      archonApprove: vi.fn(async () => ({ id: "OC-500" })),
      archonReject: vi.fn(async () => ({ id: "OC-500" })),
    } as any);

    await expect(getCommand().handler({ args: "archon-approve OC-500 ok", senderId: "u1" })).resolves.toEqual({
      text: "Provider context is required for /task archon-approve",
    });
    await expect(getCommand().handler({ args: "archon-reject OC-500 no", senderId: "u1" })).resolves.toEqual({
      text: "Provider context is required for /task archon-reject",
    });
  });

  it("uses reject vote for confirm when provided", async () => {
    const confirm = vi.fn(async () => ({ id: "OC-400" }));
    const { api, getCommand } = buildApi();
    registerTaskCommands(api as any, { confirm } as any);

    const result = await getCommand().handler({ args: "confirm OC-400 reject not-ready", senderId: "u2" });

    expect(confirm).toHaveBeenCalledWith("OC-400", "u2", "reject", "not-ready");
    expect(result.text).toBe("OC-400 vote recorded (reject)");
  });

  it("returns a friendly empty-state for list", async () => {
    const { api, getCommand } = buildApi();
    registerTaskCommands(api as any, { listTasks: vi.fn(async () => []) } as any);

    const result = await getCommand().handler({ args: "list", senderId: "u1" });

    expect(result.text).toBe("No tasks found.");
  });

  it("surfaces bridge failures as task command errors", async () => {
    const { api, getCommand } = buildApi();
    registerTaskCommands(api as any, {
      status: vi.fn(async () => {
        throw new Error("nope");
      }),
      taskStatus: vi.fn(async () => {
        throw new Error("nope");
      }),
    } as any);

    const result = await getCommand().handler({ args: "status OC-500", senderId: "u1" });

    expect(result.text).toBe("Task command failed: nope");
  });

  it("emits trace logs for native slash dispatch fields", async () => {
    const { api, getCommand, loggerMessages } = buildApi();
    registerTaskCommands(api as any, {} as any, createPluginTrace(api as any));

    await getCommand().handler({
      args: "create lossy title coding",
      commandBody: '/task create "lossless title" coding',
      senderId: "u1",
      provider: "discord",
      channelId: "guild-1",
      conversationId: "hall",
      threadId: "thread-1",
    });

    const dispatch = loggerMessages.info.find((message) => message.includes('"event":"dispatch"'));
    expect(dispatch).toContain('"command":"task"');
    expect(dispatch).toContain('"command_body":"/task create \\"lossless title\\" coding"');
    expect(dispatch).toContain('"args":"create lossy title coding"');
    expect(dispatch).toContain('"thread_id":"thread-1"');
    expect(dispatch).toContain('"wizard_session_key":"task:discord:thread-1:u1"');
  });
});
