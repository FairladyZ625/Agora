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
      overview: {
        status: "active",
        owner: "u1",
        updated_at: "2026-03-29T14:00:00.000Z",
        counts: {
          knowledge: 1,
          citizens: 0,
          recaps: 2,
          tasks_total: 3,
          active_tasks: 1,
          review_tasks: 0,
          todos_total: 2,
          pending_todos: 1,
        },
      },
      surfaces: {
        index: { kind: "index", slug: "index", title: "Index", path: "index.md", updated_at: "2026-03-29T14:00:00.000Z" },
        timeline: null,
      },
      work: {
        tasks: [],
        todos: [],
        recaps: [{ id: "r1" }, { id: "r2" }],
        knowledge: [{ id: "k1" }],
      },
      operator: {
        nomos_id: null,
        repo_path: null,
        citizens: [],
      },
    }));
    const { api, getCommand } = buildApi();
    registerProjectCommands(api as any, { getProject } as any, createPluginTrace(api as any));

    const result = await getCommand("project").handler({ args: "show proj-show", senderId: "u1" });

    expect(getProject).toHaveBeenCalledWith("proj-show");
    expect(result.text).toContain("proj-show | active | Project Show");
    expect(result.text).toContain("knowledge=1, recaps=2, citizens=0");
    expect(result.text).toContain("index=present, timeline=missing");
  });

  it("bridges project nomos review and activate actions", async () => {
    const reviewProjectNomos = vi.fn(async () => ({
      project_id: "proj-nomos",
      activation_status: "active_builtin",
      can_activate: true,
      issues: [],
      active: { pack_id: "agora/default" },
      draft: { pack_id: "project/proj-nomos" },
    }));
    const activateProjectNomos = vi.fn(async () => ({
      project_id: "proj-nomos",
      nomos_id: "project/proj-nomos",
      activation_status: "active_project",
    }));
    const { api, getCommand } = buildApi();
    registerProjectCommands(api as any, {
      reviewProjectNomos,
      activateProjectNomos,
    } as any, createPluginTrace(api as any));

    const review = await getCommand("project").handler({ args: "nomos review proj-nomos", senderId: "u1" });
    const activate = await getCommand("project").handler({ args: "nomos activate proj-nomos", senderId: "u1" });

    expect(reviewProjectNomos).toHaveBeenCalledWith("proj-nomos");
    expect(review.text).toContain("can_activate=yes");
    expect(review.text).toContain("draft=project/proj-nomos");
    expect(activateProjectNomos).toHaveBeenCalledWith("proj-nomos", "u1");
    expect(activate.text).toContain("status=active_project");
  });

  it("bridges project nomos validate, diff, publish, catalog, export, and install surfaces", async () => {
    const validateProjectNomos = vi.fn(async () => ({
      project_id: "proj-nomos",
      target: "draft",
      valid: true,
      issues: [],
      pack: { pack_id: "project/proj-nomos" },
    }));
    const diffProjectNomos = vi.fn(async () => ({
      project_id: "proj-nomos",
      base: "builtin",
      candidate: "draft",
      changed: true,
      differences: [{ field: "pack_id" }],
    }));
    const exportProjectNomos = vi.fn(async () => ({
      project_id: "proj-nomos",
      target: "draft",
      output_dir: "/tmp/pack-out",
      pack: { pack_id: "project/proj-nomos" },
    }));
    const publishProjectNomos = vi.fn(async () => ({
      project_id: "proj-nomos",
      target: "draft",
      entry: { pack_id: "project/proj-nomos", published_by: "u1", published_note: "shareable" },
      catalog_pack_root: "/tmp/catalog/project/proj-nomos",
    }));
    const listPublishedNomosCatalog = vi.fn(async () => ({
      catalog_root: "/tmp/catalog",
      total: 1,
      summaries: [
        { pack_id: "project/proj-nomos", version: "0.1.0", source_kind: "project_publish", source_project_id: "proj-nomos", source_target: "draft" },
      ],
    }));
    const showPublishedNomosCatalog = vi.fn(async () => ({
      pack_id: "project/proj-nomos",
      source_kind: "project_publish",
      source_project_id: "proj-nomos",
      source_target: "draft",
      source_activation_status: "active_builtin",
      published_by: "u1",
      published_note: "shareable",
      published_root: "/tmp/catalog/project/proj-nomos",
    }));
    const installProjectNomosPack = vi.fn(async () => ({
      project_id: "proj-target",
      pack: { pack_id: "project/proj-nomos" },
      installed_root: "/tmp/state/nomos/project-nomos",
    }));
    const installCatalogNomosPack = vi.fn(async () => ({
      project_id: "proj-target",
      pack: { pack_id: "project/proj-nomos" },
      installed_root: "/tmp/state/nomos/project-nomos",
      catalog_entry: { pack_id: "project/proj-nomos" },
    }));
    const importNomosSource = vi.fn(async () => ({
      source_dir: "/tmp/nomos-source",
      source_kind: "pack_root",
      manifest_path: null,
      entry: {
        pack_id: "project/proj-nomos",
        source_kind: "pack_root",
        source_project_id: "external",
      },
    }));
    const installNomosFromSource = vi.fn(async () => ({
      project_id: "proj-target",
      pack: { pack_id: "project/proj-nomos" },
      installed_root: "/tmp/state/nomos/project-nomos",
      imported: {
        source_kind: "pack_root",
        entry: { pack_id: "project/proj-nomos" },
      },
    }));
    const registerNomosSource = vi.fn(async () => ({
      source_id: "shared/proj-nomos",
      source_kind: "pack_root",
      source_dir: "/tmp/nomos-source",
      last_sync_status: "never",
      last_catalog_pack_id: null,
    }));
    const listRegisteredNomosSources = vi.fn(async () => ({
      registry_root: "/tmp/source-registry",
      total: 1,
      entries: [
        {
          source_id: "shared/proj-nomos",
          source_kind: "pack_root",
          source_dir: "/tmp/nomos-source",
          last_sync_status: "ok",
          last_catalog_pack_id: "project/proj-nomos",
        },
      ],
    }));
    const showRegisteredNomosSource = vi.fn(async () => ({
      source_id: "shared/proj-nomos",
      source_kind: "pack_root",
      source_dir: "/tmp/nomos-source",
      last_sync_status: "ok",
      last_catalog_pack_id: "project/proj-nomos",
    }));
    const syncRegisteredNomosSource = vi.fn(async () => ({
      source: {
        source_id: "shared/proj-nomos",
        source_kind: "pack_root",
        source_dir: "/tmp/nomos-source",
        last_sync_status: "ok",
        last_catalog_pack_id: "project/proj-nomos",
      },
      imported: {
        source_kind: "pack_root",
        entry: { pack_id: "project/proj-nomos" },
      },
    }));
    const installNomosFromRegisteredSource = vi.fn(async () => ({
      project_id: "proj-target",
      pack: { pack_id: "project/proj-nomos" },
      installed_root: "/tmp/state/nomos/project-nomos",
      source: {
        source_id: "shared/proj-nomos",
        source_kind: "pack_root",
        source_dir: "/tmp/nomos-source",
        last_sync_status: "ok",
        last_catalog_pack_id: "project/proj-nomos",
      },
      imported: {
        source_kind: "pack_root",
        entry: { pack_id: "project/proj-nomos" },
      },
    }));
    const { api, getCommand } = buildApi();
    registerProjectCommands(api as any, {
      validateProjectNomos,
      diffProjectNomos,
      publishProjectNomos,
      listPublishedNomosCatalog,
      showPublishedNomosCatalog,
      exportProjectNomos,
      installProjectNomosPack,
      installCatalogNomosPack,
      importNomosSource,
      installNomosFromSource,
      registerNomosSource,
      listRegisteredNomosSources,
      showRegisteredNomosSource,
      syncRegisteredNomosSource,
      installNomosFromRegisteredSource,
    } as any, createPluginTrace(api as any));

    const validate = await getCommand("project").handler({ args: "nomos validate proj-nomos --target draft", senderId: "u1" });
    const diff = await getCommand("project").handler({
      args: "nomos diff proj-nomos --base builtin --candidate draft",
      senderId: "u1",
    });
    const published = await getCommand("project").handler({
      args: "nomos publish proj-nomos --note shareable",
      senderId: "u1",
    });
    const catalogList = await getCommand("project").handler({
      args: "nomos catalog-list",
      senderId: "u1",
    });
    const catalogShow = await getCommand("project").handler({
      args: "nomos catalog-show project/proj-nomos",
      senderId: "u1",
    });
    const exported = await getCommand("project").handler({
      args: "nomos export proj-nomos --output-dir /tmp/pack-out",
      senderId: "u1",
    });
    const catalogInstalled = await getCommand("project").handler({
      args: "nomos install-from-catalog proj-target --pack-id project/proj-nomos",
      senderId: "u1",
    });
    const installed = await getCommand("project").handler({
      args: "nomos install-pack proj-target --pack-dir /tmp/pack-out",
      senderId: "u1",
    });
    const importedSource = await getCommand("project").handler({
      args: "nomos import-source --source-dir /tmp/nomos-source",
      senderId: "u1",
    });
    const registeredSource = await getCommand("project").handler({
      args: "nomos register-source --source-id shared/proj-nomos --source-dir /tmp/nomos-source",
      senderId: "u1",
    });
    const sourcesList = await getCommand("project").handler({
      args: "nomos sources-list",
      senderId: "u1",
    });
    const sourceShow = await getCommand("project").handler({
      args: "nomos source-show shared/proj-nomos",
      senderId: "u1",
    });
    const syncedSource = await getCommand("project").handler({
      args: "nomos sync-registered-source --source-id shared/proj-nomos",
      senderId: "u1",
    });
    const installedRegisteredSource = await getCommand("project").handler({
      args: "nomos install-from-registered-source proj-target --source-id shared/proj-nomos",
      senderId: "u1",
    });
    const installedSource = await getCommand("project").handler({
      args: "nomos install-from-source proj-target --source-dir /tmp/nomos-source",
      senderId: "u1",
    });

    expect(validateProjectNomos).toHaveBeenCalledWith("proj-nomos", "draft");
    expect(validate.text).toContain("valid=yes");
    expect(diffProjectNomos).toHaveBeenCalledWith("proj-nomos", { base: "builtin", candidate: "draft" });
    expect(diff.text).toContain("fields=pack_id");
    expect(publishProjectNomos).toHaveBeenCalledWith("proj-nomos", { actor: "u1", note: "shareable", target: "draft" });
    expect(published.text).toContain("published_by=u1");
    expect(listPublishedNomosCatalog).toHaveBeenCalledWith();
    expect(catalogList.text).toContain("Nomos catalog (1)");
    expect(showPublishedNomosCatalog).toHaveBeenCalledWith("project/proj-nomos");
    expect(catalogShow.text).toContain("source_kind=project_publish");
    expect(catalogShow.text).toContain("note=shareable");
    expect(exportProjectNomos).toHaveBeenCalledWith("proj-nomos", "/tmp/pack-out", "draft");
    expect(exported.text).toContain("output=/tmp/pack-out");
    expect(installCatalogNomosPack).toHaveBeenCalledWith("proj-target", "project/proj-nomos");
    expect(catalogInstalled.text).toContain("Installed catalog Nomos into proj-target");
    expect(installProjectNomosPack).toHaveBeenCalledWith("proj-target", "/tmp/pack-out");
    expect(installed.text).toContain("draft_root=/tmp/state/nomos/project-nomos");
    expect(importNomosSource).toHaveBeenCalledWith("/tmp/nomos-source");
    expect(importedSource.text).toContain("source_kind=pack_root");
    expect(registerNomosSource).toHaveBeenCalledWith("shared/proj-nomos", "/tmp/nomos-source");
    expect(registeredSource.text).toContain("Registered Nomos source shared/proj-nomos");
    expect(listRegisteredNomosSources).toHaveBeenCalledWith();
    expect(sourcesList.text).toContain("Nomos sources (1)");
    expect(showRegisteredNomosSource).toHaveBeenCalledWith("shared/proj-nomos");
    expect(sourceShow.text).toContain("last_catalog_pack_id=project/proj-nomos");
    expect(syncRegisteredNomosSource).toHaveBeenCalledWith("shared/proj-nomos");
    expect(syncedSource.text).toContain("pack=project/proj-nomos");
    expect(installNomosFromRegisteredSource).toHaveBeenCalledWith("proj-target", "shared/proj-nomos");
    expect(installedRegisteredSource.text).toContain("Installed registered source into proj-target");
    expect(installNomosFromSource).toHaveBeenCalledWith("proj-target", "/tmp/nomos-source");
    expect(installedSource.text).toContain("Installed source Nomos into proj-target");
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

  it("supports explicit owner parsing on one-shot create commands", async () => {
    const createProject = vi.fn(async () => ({
      id: "proj-owner",
      name: "Owner Project",
      status: "active",
      owner: "owner-1",
    }));
    const { api, getCommand } = buildApi();
    registerProjectCommands(api as any, { createProject } as any, createPluginTrace(api as any));

    const result = await getCommand("project").handler({
      args: 'create "Owner Project" --owner owner-1',
      senderId: "u1",
    });

    expect(createProject).toHaveBeenCalledWith({
      name: "Owner Project",
      owner: "owner-1",
    });
    expect(result.text).toContain("owner=owner-1");
  });

  it("keeps the wizard prompt alive for empty/help input and ignores recognized subcommands", async () => {
    const listProjects = vi.fn(async () => [
      { id: "proj-a", status: "active", name: "Project A" },
    ]);
    const { api, getCommand, loggerMessages } = buildApi();
    registerProjectCommands(api as any, { listProjects } as any, createPluginTrace(api as any));

    await getCommand("project").handler({ args: "create", senderId: "u1", provider: "discord", conversationId: "hall" });
    const help = await getCommand("project").handler({ args: "help", senderId: "u1", provider: "discord", conversationId: "hall" });
    const handoff = await getCommand("project").handler({ args: "list active", senderId: "u1", provider: "discord", conversationId: "hall" });

    expect(help.text).toContain("Step 1/2");
    expect(handoff.text).toContain("proj-a | active | Project A");
    expect(listProjects).toHaveBeenCalledWith("active");
    expect(loggerMessages.info.some((message) => message.includes('"note":"help_or_empty"'))).toBe(true);
  });

  it("returns usage guidance for incomplete nomos commands and help for unknown nomos actions", async () => {
    const { api, getCommand } = buildApi();
    registerProjectCommands(api as any, {} as any, createPluginTrace(api as any));

    const validate = await getCommand("project").handler({ args: "nomos validate", senderId: "u1" });
    const diff = await getCommand("project").handler({ args: "nomos diff", senderId: "u1" });
    const exportResult = await getCommand("project").handler({ args: "nomos export proj-only", senderId: "u1" });
    const publish = await getCommand("project").handler({ args: "nomos publish", senderId: "u1" });
    const catalogShow = await getCommand("project").handler({ args: "nomos catalog-show", senderId: "u1" });
    const installCatalog = await getCommand("project").handler({ args: "nomos install-from-catalog proj-only", senderId: "u1" });
    const installPack = await getCommand("project").handler({ args: "nomos install-pack proj-only", senderId: "u1" });
    const importSource = await getCommand("project").handler({ args: "nomos import-source", senderId: "u1" });
    const installSource = await getCommand("project").handler({ args: "nomos install-from-source proj-only", senderId: "u1" });
    const help = await getCommand("project").handler({ args: "nomos nonsense", senderId: "u1" });

    expect(validate.text).toContain("Usage: /project nomos validate");
    expect(diff.text).toContain("Usage: /project nomos diff");
    expect(exportResult.text).toContain("Usage: /project nomos export");
    expect(publish.text).toContain("Usage: /project nomos publish");
    expect(catalogShow.text).toContain("Usage: /project nomos catalog-show");
    expect(installCatalog.text).toContain("Usage: /project nomos install-from-catalog");
    expect(installPack.text).toContain("Usage: /project nomos install-pack");
    expect(importSource.text).toContain("Usage: /project nomos import-source");
    expect(installSource.text).toContain("Usage: /project nomos install-from-source");
    expect(help.text).toContain("Agora /project nomos commands:");
  });
});
