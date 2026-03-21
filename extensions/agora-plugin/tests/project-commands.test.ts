import { describe, expect, it, vi } from "vitest";

import { registerProjectCommands } from "../src/project-commands";

function buildApi() {
  const commands: any[] = [];
  return {
    api: {
      registerCommand(command: any) {
        commands.push(command);
      },
    },
    getCommand(name: string) {
      return commands.find((command) => command.name === name);
    },
  };
}

describe("registerProjectCommands", () => {
  it("returns help for unknown subcommands", async () => {
    const { api, getCommand } = buildApi();
    registerProjectCommands(api as any, {} as any);

    const result = await getCommand("project").handler({ args: "unknown", senderId: "u1" });

    expect(result.text).toContain("Agora /project commands:");
    expect(result.text).toContain("/project create");
  });

  it("returns usage when create is missing the project name", async () => {
    const { api, getCommand } = buildApi();
    registerProjectCommands(api as any, {} as any);

    const result = await getCommand("project").handler({ args: "create", senderId: "u1" });

    expect(result.text).toContain("Usage: /project create");
  });

  it("creates projects through the bridge with parsed flags", async () => {
    const createProject = vi.fn(async () => ({
      id: "proj-plugin",
      name: "Plugin Project",
      status: "active",
      owner: "u1",
    }));
    const { api, getCommand } = buildApi();
    registerProjectCommands(api as any, { createProject } as any);

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

  it("lists projects through the bridge", async () => {
    const listProjects = vi.fn(async () => [
      { id: "proj-a", status: "active", name: "Project A" },
      { id: "proj-b", status: "archived", name: "Project B" },
    ]);
    const { api, getCommand } = buildApi();
    registerProjectCommands(api as any, { listProjects } as any);

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
    registerProjectCommands(api as any, { getProject } as any);

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
    } as any);

    const result = await getCommand("project").handler({ args: "list", senderId: "u1" });

    expect(result.text).toBe("Project command failed: nope");
  });
});
