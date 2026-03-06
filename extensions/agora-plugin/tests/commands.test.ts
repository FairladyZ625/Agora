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
});
