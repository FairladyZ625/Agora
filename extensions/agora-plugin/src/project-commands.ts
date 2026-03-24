import { AgoraBridge } from "./bridge";
import { resolveCommandTokens } from "./command-args";
import { createWizardStore, resolveCreateWizardSessionKey } from "./create-wizard-store";
import { noopPluginTrace, type PluginTrace } from "./trace";
import type { CommandContext } from "./types";
import type { CommandResult, OpenClawPluginApi } from "./types";

const PROJECT_SUBCOMMANDS = new Set(["create", "list", "show", "nomos"]);

export function registerProjectCommands(
  api: OpenClawPluginApi,
  bridge: AgoraBridge,
  trace: PluginTrace = noopPluginTrace,
): void {
  api.registerCommand({
    name: "project",
    description: "Agora project management",
    acceptsArgs: true,
    requireAuth: false,
    handler: async (ctx) => {
      const tokens = resolveCommandTokens("project", ctx);
      const [subcommand, ...rest] = tokens;
      const senderId = ctx.senderId || ctx.from || "archon";
      const wizardSessionKey = resolveCreateWizardSessionKey("project", ctx);
      const wizardSession = createWizardStore.get(wizardSessionKey);
      trace.slash(ctx, {
        event: "dispatch",
        command: "project",
        subcommand,
        tokens,
        wizardSessionKey,
        wizardState: wizardSession ? `${wizardSession.kind}:${wizardSession.step}` : undefined,
      });

      try {
        const wizardResult = await maybeHandleProjectWizard({
          bridge,
          ctx,
          senderId,
          tokens,
          subcommand,
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
          case "show":
            return await handleShow(bridge, rest);
          case "nomos":
            return await handleNomos(bridge, rest, senderId);
          default:
            return { text: formatHelp() };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { text: `Project command failed: ${message}` };
      }
    },
  });
}

async function maybeHandleProjectWizard(input: {
  bridge: AgoraBridge;
  ctx: CommandContext;
  senderId: string;
  tokens: string[];
  subcommand?: string;
  wizardSessionKey: string;
  trace: PluginTrace;
}): Promise<CommandResult | null> {
  const session = createWizardStore.get(input.wizardSessionKey);
  if (input.subcommand === "create" && input.tokens.length === 1) {
    createWizardStore.set(input.wizardSessionKey, {
      kind: "project",
      step: "name",
      senderId: input.senderId,
    });
    input.trace.slash(input.ctx, {
      event: "wizard_start",
      command: "project",
      subcommand: input.subcommand,
      tokens: input.tokens,
      wizardSessionKey: input.wizardSessionKey,
      wizardState: "project:name",
    });
    return { text: formatProjectWizardNamePrompt() };
  }
  if (!session || session.kind !== "project") {
    return null;
  }
  if (input.subcommand === "create" && input.tokens.length > 1) {
    createWizardStore.clear(input.wizardSessionKey);
    return null;
  }
  if (!shouldConsumeWizardInput(input.tokens, input.subcommand, PROJECT_SUBCOMMANDS)) {
    return null;
  }

  const answer = normalizeWizardAnswer(input.tokens);
  if (!answer || answer === "help") {
    input.trace.slash(input.ctx, {
      event: "wizard_prompt",
      command: "project",
      subcommand: input.subcommand,
      tokens: input.tokens,
      wizardSessionKey: input.wizardSessionKey,
      wizardState: `${session.kind}:${session.step}`,
      note: "help_or_empty",
    });
    return {
      text: session.step === "name"
        ? formatProjectWizardNamePrompt()
        : formatProjectWizardSummaryPrompt(session.name ?? ""),
    };
  }
  if (answer === "cancel") {
    createWizardStore.clear(input.wizardSessionKey);
    input.trace.slash(input.ctx, {
      event: "wizard_cancel",
      command: "project",
      subcommand: input.subcommand,
      tokens: input.tokens,
      wizardSessionKey: input.wizardSessionKey,
      wizardState: `${session.kind}:${session.step}`,
    });
    return { text: "Project create wizard cancelled." };
  }

  if (session.step === "name") {
    createWizardStore.set(input.wizardSessionKey, {
      kind: "project",
      step: "summary",
      senderId: input.senderId,
      name: answer,
    });
    input.trace.slash(input.ctx, {
      event: "wizard_prompt",
      command: "project",
      subcommand: input.subcommand,
      tokens: input.tokens,
      wizardSessionKey: input.wizardSessionKey,
      wizardState: "project:summary",
      note: `name=${answer}`,
    });
    return { text: formatProjectWizardSummaryPrompt(answer) };
  }

  const summary = answer === "skip" ? undefined : answer;
  const project = await input.bridge.createProject({
    name: session.name ?? "Untitled Project",
    ...(summary ? { summary } : {}),
    owner: input.senderId,
  });
  createWizardStore.clear(input.wizardSessionKey);
  input.trace.slash(input.ctx, {
    event: "wizard_complete",
    command: "project",
    subcommand: input.subcommand,
    tokens: input.tokens,
    wizardSessionKey: input.wizardSessionKey,
    wizardState: "project:summary",
    note: `project_id=${project.id}`,
  });
  return {
    text: [
      `Created project ${project.id}`,
      `${project.name} | ${project.status}`,
      `owner=${project.owner ?? "unassigned"}`,
      "Wizard complete.",
    ].join("\n"),
  };
}

async function handleCreate(bridge: AgoraBridge, args: string[], senderId: string): Promise<CommandResult> {
  const parsed = parseProjectCreateArgs(args);
  if (!parsed.name) {
    return { text: formatProjectWizardNamePrompt() };
  }

  const project = await bridge.createProject({
    name: parsed.name,
    ...(parsed.id ? { id: parsed.id } : {}),
    ...(parsed.summary ? { summary: parsed.summary } : {}),
    owner: parsed.owner ?? senderId,
    ...(parsed.repoPath ? { repoPath: parsed.repoPath } : {}),
    ...(parsed.initializeRepo ? { initializeRepo: true } : {}),
    ...(parsed.nomosId ? { nomosId: parsed.nomosId } : {}),
  });

  return {
    text: [
      `Created project ${project.id}`,
      `${project.name} | ${project.status}`,
      `owner=${project.owner ?? "unassigned"}`,
    ].join("\n"),
  };
}

async function handleList(bridge: AgoraBridge, args: string[]): Promise<CommandResult> {
  const status = args[0];
  const projects = await bridge.listProjects(status);
  if (!projects.length) {
    return { text: "No projects found." };
  }
  return {
    text: projects
      .slice(0, 10)
      .map((project) => `${project.id} | ${project.status} | ${project.name}`)
      .join("\n"),
  };
}

async function handleShow(bridge: AgoraBridge, args: string[]): Promise<CommandResult> {
  const projectId = args[0];
  if (!projectId) {
    return { text: "Usage: /project show <project_id>" };
  }
  const workbench = await bridge.getProject(projectId);
  return {
    text: [
      `${workbench.project.id} | ${workbench.project.status} | ${workbench.project.name}`,
      `knowledge=${workbench.knowledge.length}, recaps=${workbench.recaps.length}, citizens=${workbench.citizens.length}`,
      `index=${workbench.index ? "present" : "missing"}, timeline=${workbench.timeline ? "present" : "missing"}`,
    ].join("\n"),
  };
}

async function handleNomos(bridge: AgoraBridge, args: string[], senderId: string): Promise<CommandResult> {
  const [action, ...rest] = args;
  switch (action) {
    case "review": {
      const projectId = rest[0];
      if (!projectId) {
        return { text: "Usage: /project nomos review <project_id>" };
      }
      const review = await bridge.reviewProjectNomos(projectId);
      return {
        text: [
          `Nomos review for ${review.project_id}`,
          `activation=${review.activation_status}`,
          `can_activate=${review.can_activate ? "yes" : "no"}`,
          `active=${review.active.pack_id}`,
          `draft=${review.draft?.pack_id ?? "none"}`,
          `issues=${review.issues.length}`,
        ].join("\n"),
      };
    }
    case "activate": {
      const projectId = rest[0];
      if (!projectId) {
        return { text: "Usage: /project nomos activate <project_id>" };
      }
      const activation = await bridge.activateProjectNomos(projectId, senderId);
      return {
        text: [
          `Activated Nomos for ${activation.project_id}`,
          `nomos=${activation.nomos_id}`,
          `status=${activation.activation_status}`,
        ].join("\n"),
      };
    }
    case "validate": {
      const projectId = rest[0];
      if (!projectId) {
        return { text: "Usage: /project nomos validate <project_id> [--target draft|active]" };
      }
      const target = rest.includes("--target")
        ? ((rest[rest.indexOf("--target") + 1] as "draft" | "active" | undefined) ?? "draft")
        : "draft";
      const validation = await bridge.validateProjectNomos(projectId, target === "active" ? "active" : "draft");
      return {
        text: [
          `Nomos validation for ${validation.project_id}`,
          `target=${validation.target}`,
          `valid=${validation.valid ? "yes" : "no"}`,
          `pack=${validation.pack?.pack_id ?? "none"}`,
          `issues=${validation.issues.length}`,
        ].join("\n"),
      };
    }
    case "diff": {
      const projectId = rest[0];
      if (!projectId) {
        return { text: "Usage: /project nomos diff <project_id> [--base builtin|active] [--candidate draft|active]" };
      }
      const base = rest.includes("--base")
        ? ((rest[rest.indexOf("--base") + 1] as "builtin" | "active" | undefined) ?? "active")
        : "active";
      const candidate = rest.includes("--candidate")
        ? ((rest[rest.indexOf("--candidate") + 1] as "draft" | "active" | undefined) ?? "draft")
        : "draft";
      const diff = await bridge.diffProjectNomos(projectId, {
        base: base === "builtin" ? "builtin" : "active",
        candidate: candidate === "active" ? "active" : "draft",
      });
      return {
        text: [
          `Nomos diff for ${diff.project_id}`,
          `base=${diff.base}`,
          `candidate=${diff.candidate}`,
          `changed=${diff.changed ? "yes" : "no"}`,
          `fields=${diff.differences.length ? diff.differences.map((entry) => entry.field).join(", ") : "none"}`,
        ].join("\n"),
      };
    }
    case "export": {
      const projectId = rest[0];
      const outputDir = flagValue(rest.slice(1), "--output-dir");
      const target = (flagValue(rest.slice(1), "--target") as "draft" | "active" | undefined) ?? "draft";
      if (!projectId || !outputDir) {
        return { text: "Usage: /project nomos export <project_id> --output-dir <dir> [--target draft|active]" };
      }
      const exported = await bridge.exportProjectNomos(projectId, outputDir, target === "active" ? "active" : "draft");
      return {
        text: [
          `Exported Nomos for ${exported.project_id}`,
          `target=${exported.target}`,
          `pack=${exported.pack?.pack_id ?? "none"}`,
          `output=${exported.output_dir}`,
        ].join("\n"),
      };
    }
    case "publish": {
      const projectId = rest[0];
      const note = flagValue(rest.slice(1), "--note");
      if (!projectId) {
        return { text: "Usage: /project nomos publish <project_id> [--note <text>] [--target draft|active]" };
      }
      const target = (flagValue(rest.slice(1), "--target") as "draft" | "active" | undefined) ?? "draft";
      const published = await bridge.publishProjectNomos(projectId, {
        target: target === "active" ? "active" : "draft",
        actor: senderId,
        ...(note ? { note } : {}),
      });
      return {
        text: [
          `Published Nomos for ${published.project_id}`,
          `target=${published.target}`,
          `pack=${published.entry.pack_id}`,
          `published_by=${published.entry.published_by ?? "none"}`,
        ].join("\n"),
      };
    }
    case "catalog-list": {
      const listed = await bridge.listPublishedNomosCatalog();
      return {
        text: [
          `Nomos catalog (${listed.total})`,
          ...listed.summaries.slice(0, 10).map((entry) => `${entry.pack_id} | ${entry.version} | ${entry.source_project_id}/${entry.source_target}`),
        ].join("\n"),
      };
    }
    case "catalog-show": {
      const packId = rest[0];
      if (!packId) {
        return { text: "Usage: /project nomos catalog-show <pack_id>" };
      }
      const entry = await bridge.showPublishedNomosCatalog(packId);
      return {
        text: [
          `Nomos catalog entry ${entry.pack_id}`,
          `source=${entry.source_project_id}/${entry.source_target}`,
          `activation=${entry.source_activation_status}`,
          `published_by=${entry.published_by ?? "none"}`,
          `note=${entry.published_note ?? "none"}`,
        ].join("\n"),
      };
    }
    case "install-from-catalog": {
      const projectId = rest[0];
      const packId = flagValue(rest.slice(1), "--pack-id");
      if (!projectId || !packId) {
        return { text: "Usage: /project nomos install-from-catalog <project_id> --pack-id <pack_id>" };
      }
      const installed = await bridge.installCatalogNomosPack(projectId, packId);
      return {
        text: [
          `Installed catalog Nomos into ${installed.project_id}`,
          `pack=${installed.pack.pack_id}`,
          `draft_root=${installed.installed_root}`,
        ].join("\n"),
      };
    }
    case "install-pack": {
      const projectId = rest[0];
      const packDir = flagValue(rest.slice(1), "--pack-dir");
      if (!projectId || !packDir) {
        return { text: "Usage: /project nomos install-pack <project_id> --pack-dir <dir>" };
      }
      const installed = await bridge.installProjectNomosPack(projectId, packDir);
      return {
        text: [
          `Installed Nomos pack into ${installed.project_id}`,
          `pack=${installed.pack.pack_id}`,
          `draft_root=${installed.installed_root}`,
        ].join("\n"),
      };
    }
    default:
      return { text: formatNomosHelp() };
  }
}

function parseProjectCreateArgs(args: string[]) {
  let nameParts: string[] = [];
  let id: string | undefined;
  let summary: string | undefined;
  let repoPath: string | undefined;
  let nomosId: string | undefined;
  let owner: string | undefined;
  let initializeRepo = false;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    switch (token) {
      case "--id":
        id = args[index + 1];
        index += 1;
        break;
      case "--summary":
        summary = args[index + 1];
        index += 1;
        break;
      case "--repo-path":
        repoPath = args[index + 1];
        index += 1;
        break;
      case "--nomos-id":
        nomosId = args[index + 1];
        index += 1;
        break;
      case "--owner":
        owner = args[index + 1];
        index += 1;
        break;
      case "--new-repo":
        initializeRepo = true;
        break;
      default:
        nameParts.push(token);
        break;
    }
  }

  return {
    name: nameParts.join(" ").trim(),
    id,
    summary,
    repoPath,
    nomosId,
    owner,
    initializeRepo,
  };
}

function flagValue(args: string[], flag: string) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function formatHelp() {
  return [
    "Agora /project commands:",
    "Most common:",
    '/project create "Project Name"',
    "/project list active",
    "/project show <project_id>",
    "",
    "Full command list:",
    "/project create <name> [--id <project_id>] [--summary <summary>] [--repo-path <path>] [--new-repo] [--nomos-id <nomos_id>] [--owner <owner>]",
    "/project list [status]",
    "/project show <project_id>",
    "/project nomos <review|activate|validate|diff|export|install-pack> ...",
  ].join("\n");
}

function formatNomosHelp() {
  return [
    "Agora /project nomos commands:",
    "/project nomos review <project_id>",
    "/project nomos activate <project_id>",
    "/project nomos validate <project_id> [--target draft|active]",
    "/project nomos diff <project_id> [--base builtin|active] [--candidate draft|active]",
    "/project nomos publish <project_id> [--note <text>] [--target draft|active]",
    "/project nomos catalog-list",
    "/project nomos catalog-show <pack_id>",
    "/project nomos export <project_id> --output-dir <dir> [--target draft|active]",
    "/project nomos install-from-catalog <project_id> --pack-id <pack_id>",
    "/project nomos install-pack <project_id> --pack-dir <dir>",
  ].join("\n");
}

function formatProjectWizardNamePrompt() {
  return [
    "Project create wizard",
    "Step 1/2: send the project name.",
    'Example: /project "Project Name"',
    "Send `/project cancel` to exit.",
  ].join("\n");
}

function formatProjectWizardSummaryPrompt(name: string) {
  return [
    "Project create wizard",
    `Name: ${name}`,
    "Step 2/2: send a short summary, or `/project skip` to create with defaults.",
    "Advanced flags like `--repo-path` still use the full one-shot command.",
  ].join("\n");
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
