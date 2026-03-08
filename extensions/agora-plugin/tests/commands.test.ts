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
  });

  it("returns usage when create title is missing", async () => {
    const { api, getCommand } = buildApi();
    const bridge = {} as any;
    registerTaskCommands(api as any, bridge);

    const result = await getCommand().handler({ args: "create", senderId: "u1" });
    expect(result.text).toBe("Usage: /task create <title> [type]");
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

  it.each([
    ["status", "Usage: /task status <task_id>"],
    ["advance", "Usage: /task advance <task_id>"],
    ["approve", "Usage: /task approve <task_id> [comment]"],
    ["reject", "Usage: /task reject <task_id> [reason]"],
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
    await expect(getCommand().handler({ args: "archon-approve OC-101 ok", senderId: "u1" })).resolves.toEqual({
      text: "OC-101 archon-approved",
    });
    await expect(getCommand().handler({ args: "archon-reject OC-101 no", senderId: "u1" })).resolves.toEqual({
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
