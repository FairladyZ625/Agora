import { describe, expect, it, vi } from "vitest";

import { registerTaskCommands, tokenize } from "../src/commands";

function buildApi() {
  let registered: any = null;
  return {
    api: {
      registerCommand(command: any) {
        registered = command;
      },
    },
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
  it("returns help when subcommand is unknown", async () => {
    const { api, getCommand } = buildApi();
    const bridge = {} as any;
    registerTaskCommands(api as any, bridge);

    const result = await getCommand().handler({ args: "unknown", senderId: "u1" });
    expect(result.text).toContain("Agora /task commands:");
    expect(result.text).toContain("/task create");
    expect(result.text).toContain("Most common:");
    expect(result.text).toContain("Supported task types:");
  });

  it("returns usage when create title is missing", async () => {
    const { api, getCommand } = buildApi();
    const bridge = {} as any;
    registerTaskCommands(api as any, bridge);

    const result = await getCommand().handler({ args: "create", senderId: "u1" });
    expect(result.text).toContain("Ready to create a task.");
    expect(result.text).toContain('/task create "fix dashboard create flow" coding');
    expect(result.text).toContain("Default type: coding");
  });

  it("returns guided help when no subcommand is provided inside a task thread", async () => {
    const { api, getCommand } = buildApi();
    const bridge = {} as any;
    registerTaskCommands(api as any, bridge);

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
    registerTaskCommands(api as any, bridge);

    const result = await getCommand().handler({ args: 'create "hello world" wrong_type', senderId: "u1" });

    expect(result.text).toContain('Unknown task type: "wrong_type"');
    expect(result.text).toContain("Supported task types:");
    expect(result.text).toContain("coding_heavy");
  });

  it("calls bridge.createTask with parsed args", async () => {
    const createTask = vi.fn(async () => ({ id: "OC-001", type: "coding", title: "hello world" }));
    const { api, getCommand } = buildApi();
    const bridge = { createTask } as any;
    registerTaskCommands(api as any, bridge);

    const result = await getCommand().handler({ args: 'create "hello world" coding', senderId: "u1" });

    expect(createTask).toHaveBeenCalledWith("hello world", "coding", "u1");
    expect(result.text).toContain("Created OC-001");
  });

  it("prefers commandBody over lossy args for quoted create titles", async () => {
    const createTask = vi.fn(async () => ({ id: "OC-002", type: "coding", title: "human smoke create" }));
    const { api, getCommand } = buildApi();
    registerTaskCommands(api as any, { createTask } as any);

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
    registerTaskCommands(api as any, {} as any);

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
    registerTaskCommands(api as any, {} as any);

    const result = await getCommand().handler({ args: subcommand, senderId: "u1" });

    expect(result.text).toBe(expected);
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
    registerTaskCommands(api as any, bridge);

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
      from: "legacy-user",
      threadId: "thread-11",
    })).resolves.toEqual({
      text: "Provider context is required for current-thread /task approve",
    });
    await expect(getCommand().handler({
      args: "reject",
      from: "legacy-user",
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
});
