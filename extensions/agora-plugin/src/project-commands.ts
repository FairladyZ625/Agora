import { AgoraBridge } from "./bridge";
import { resolveCommandTokens } from "./command-args";
import { createWizardStore, resolveCreateWizardSessionKey } from "./create-wizard-store";
import type { CommandResult, OpenClawPluginApi } from "./types";

const PROJECT_SUBCOMMANDS = new Set(["create", "list", "show"]);

export function registerProjectCommands(api: OpenClawPluginApi, bridge: AgoraBridge): void {
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

      try {
        const wizardResult = await maybeHandleProjectWizard({
          bridge,
          senderId,
          tokens,
          subcommand,
          wizardSessionKey,
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
  senderId: string;
  tokens: string[];
  subcommand?: string;
  wizardSessionKey: string;
}): Promise<CommandResult | null> {
  const session = createWizardStore.get(input.wizardSessionKey);
  if (input.subcommand === "create" && input.tokens.length === 1) {
    createWizardStore.set(input.wizardSessionKey, {
      kind: "project",
      step: "name",
      senderId: input.senderId,
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
    return {
      text: session.step === "name"
        ? formatProjectWizardNamePrompt()
        : formatProjectWizardSummaryPrompt(session.name ?? ""),
    };
  }
  if (answer === "cancel") {
    createWizardStore.clear(input.wizardSessionKey);
    return { text: "Project create wizard cancelled." };
  }

  if (session.step === "name") {
    createWizardStore.set(input.wizardSessionKey, {
      kind: "project",
      step: "summary",
      senderId: input.senderId,
      name: answer,
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
