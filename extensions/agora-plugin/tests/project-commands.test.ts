import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetCreateWizardStore } from "../src/create-wizard-store";
import { registerProjectCommands } from "../src/project-commands";
import { createPluginTrace } from "../src/trace";

function buildApi() {
  const commands: any[] = [];
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
        commands.push(command);
      },
    },
    loggerMessages,
    getCommand(name: string) {
      return commands.find((command) => command.name === name);
    },
  };
}

describe("registerProjectCommands", () => {
  beforeEach(() => {
    resetCreateWizardStore();
  });

  it("returns help for unknown subcommands", async () => {
    const { api, getCommand } = buildApi();
    registerProjectCommands(api as any, {} as any, createPluginTrace(api as any));

    const result = await getCommand("project").handler({ args: "unknown", senderId: "u1" });

    expect(result.text).toContain("Agora /project commands:");
    expect(result.text).toContain("/project create");
    expect(result.text).toContain("Most common:");
    expect(result.text).toContain('/project create "Project Name"');
  });

  it("starts a create wizard when project name is missing", async () => {
    const { api, getCommand } = buildApi();
    registerProjectCommands(api as any, {} as any, createPluginTrace(api as any));

    const result = await getCommand("project").handler({ args: "create", senderId: "u1" });

    expect(result.text).toContain("Project create wizard");
    expect(result.text).toContain("Step 1/2");
    expect(result.text).toContain('/project "Project Name"');
  });

  it("creates projects through the bridge with parsed flags", async () => {
    const createProject = vi.fn(async () => ({
      id: "proj-plugin",
      name: "Plugin Project",
      status: "active",
      owner: "u1",
    }));
    const { api, getCommand } = buildApi();
    registerProjectCommands(api as any, { createProject } as any, createPluginTrace(api as any));

    const result = await getCommand("project").handler({
      args: 'create "Plugin Project" --id proj-plugin --summary "Seed project" --repo-path /tmp/repo --new-repo --nomos-id agora/default',
      senderId: "u1",
    });

    expect(createProject).toHaveBeenCalledWith({
      id: "proj-plugin",
      name: "Plugin Project",
      summary: "Seed project",
      repoPath: "/tmp/repo",
      initializeRepo: true,
      nomosId: "agora/default",
      owner: "u1",
    });
    expect(result.text).toContain("Created project proj-plugin");
  });

  it("walks the user through project name then summary and creates with defaults on skip", async () => {
    const createProject = vi.fn(async () => ({
      id: "proj-guided",
      name: "Guided Project",
      status: "active",
      owner: "u1",
    }));
    const { api, getCommand, loggerMessages } = buildApi();
    registerProjectCommands(api as any, { createProject } as any, createPluginTrace(api as any));

    const start = await getCommand("project").handler({ args: "create", senderId: "u1", provider: "discord", conversationId: "hall" });
    const name = await getCommand("project").handler({ args: '"Guided Project"', senderId: "u1", provider: "discord", conversationId: "hall" });
    const skip = await getCommand("project").handler({ args: "skip", senderId: "u1", provider: "discord", conversationId: "hall" });

    expect(start.text).toContain("Step 1/2");
    expect(name.text).toContain("Step 2/2");
    expect(name.text).toContain("Guided Project");
    expect(createProject).toHaveBeenCalledWith({
      name: "Guided Project",
      owner: "u1",
    });
    expect(skip.text).toContain("Created project proj-guided");
    expect(skip.text).toContain("Wizard complete.");
    expect(loggerMessages.info.some((message) => message.includes('"event":"wizard_start"'))).toBe(true);
    expect(loggerMessages.info.some((message) => message.includes('"event":"wizard_complete"'))).toBe(true);
  });

  it("accepts a summary in the project wizard and can cancel", async () => {
    const createProject = vi.fn(async () => ({
      id: "proj-guided-summary",
      name: "Guided Summary Project",
      status: "active",
      owner: "u1",
    }));
    const { api, getCommand, loggerMessages } = buildApi();
    registerProjectCommands(api as any, { createProject } as any, createPluginTrace(api as any));

    await getCommand("project").handler({ args: "create", senderId: "u1", provider: "discord", conversationId: "hall" });
    await getCommand("project").handler({ args: '"Guided Summary Project"', senderId: "u1", provider: "discord", conversationId: "hall" });
    const summary = await getCommand("project").handler({ args: '"A short summary"', senderId: "u1", provider: "discord", conversationId: "hall" });

    expect(createProject).toHaveBeenCalledWith({
      name: "Guided Summary Project",
      summary: "A short summary",
      owner: "u1",
    });
    expect(summary.text).toContain("Created project proj-guided-summary");

    await getCommand("project").handler({ args: "create", senderId: "u1", provider: "discord", conversationId: "hall" });
    const cancel = await getCommand("project").handler({ args: "cancel", senderId: "u1", provider: "discord", conversationId: "hall" });
    expect(cancel.text).toBe("Project create wizard cancelled.");
    expect(loggerMessages.info.some((message) => message.includes('"event":"wizard_cancel"'))).toBe(true);
  });

  it("prefers commandBody when discord native args truncate a quoted project name", async () => {
    const createProject = vi.fn(async () => ({
      id: "proj-command-body",
      name: "Plugin Smoke Project",
      status: "active",
      owner: "u1",
    }));
    const { api, getCommand } = buildApi();
    registerProjectCommands(api as any, { createProject } as any, createPluginTrace(api as any));

    const result = await getCommand("project").handler({
      args: "create Plugin Smoke",
      commandBody: '/project create "Plugin Smoke Project" --id proj-command-body',
      senderId: "u1",
    });

    expect(createProject).toHaveBeenCalledWith({
      id: "proj-command-body",
      name: "Plugin Smoke Project",
      owner: "u1",
    });
    expect(result.text).toContain("Created project proj-command-body");
  });

  it("lists projects through the bridge", async () => {
    const listProjects = vi.fn(async () => [
      { id: "proj-a", status: "active", name: "Project A" },
      { id: "proj-b", status: "archived", name: "Project B" },
    ]);
    const { api, getCommand } = buildApi();
    registerProjectCommands(api as any, { listProjects } as any, createPluginTrace(api as any));

    const result = await getCommand("project").handler({ args: "list active", senderId: "u1" });

    expect(listProjects).toHaveBeenCalledWith("active");
    expect(result.text).toBe("proj-a | active | Project A\nproj-b | archived | Project B");
  });

  it("shows project workbench summary", async () => {
    const getProject = vi.fn(async () => ({
      project: { id: "proj-show", status: "active", name: "Project Show" },
      knowledge: [{ id: "k1" }],
      recaps: [{ id: "r1" }, { id: "r2" }],
      citizens: [],
      index: { path: "index.md" },
      timeline: null,
    }));
    const { api, getCommand } = buildApi();
    registerProjectCommands(api as any, { getProject } as any, createPluginTrace(api as any));

    const result = await getCommand("project").handler({ args: "show proj-show", senderId: "u1" });

    expect(getProject).toHaveBeenCalledWith("proj-show");
    expect(result.text).toContain("proj-show | active | Project Show");
    expect(result.text).toContain("knowledge=1, recaps=2, citizens=0");
    expect(result.text).toContain("index=present, timeline=missing");
  });

  it("surfaces bridge failures as project command errors", async () => {
    const { api, getCommand } = buildApi();
    registerProjectCommands(api as any, {
      listProjects: vi.fn(async () => {
        throw new Error("nope");
      }),
    } as any, createPluginTrace(api as any));

    const result = await getCommand("project").handler({ args: "list", senderId: "u1" });

    expect(result.text).toBe("Project command failed: nope");
  });

  it("emits trace logs for project native slash dispatch fields", async () => {
    const createProject = vi.fn(async () => ({
      id: "proj-trace",
      name: "Trace Project",
      status: "active",
      owner: "u1",
    }));
    const { api, getCommand, loggerMessages } = buildApi();
    registerProjectCommands(api as any, { createProject } as any, createPluginTrace(api as any));

    await getCommand("project").handler({
      args: "create Trace Project",
      commandBody: '/project create "Trace Project" --id proj-trace',
      senderId: "u1",
      provider: "discord",
      conversationId: "hall",
    });

    const dispatch = loggerMessages.info.find((message) => message.includes('"event":"dispatch"'));
    expect(dispatch).toContain('"command":"project"');
    expect(dispatch).toContain('"command_body":"/project create \\"Trace Project\\" --id proj-trace"');
    expect(dispatch).toContain('"wizard_session_key":"project:discord:hall:u1"');
  });
});
