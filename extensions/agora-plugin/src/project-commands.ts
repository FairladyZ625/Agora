import { AgoraBridge } from "./bridge";
import type { CommandResult, OpenClawPluginApi } from "./types";

export function registerProjectCommands(api: OpenClawPluginApi, bridge: AgoraBridge): void {
  api.registerCommand({
    name: "project",
    description: "Agora project management",
    acceptsArgs: true,
    requireAuth: false,
    handler: async (ctx) => {
      const tokens = tokenize(ctx.args || "");
      const [subcommand, ...rest] = tokens;

      try {
        switch (subcommand) {
          case "create":
            return await handleCreate(bridge, rest, ctx.senderId || ctx.from || "archon");
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

async function handleCreate(bridge: AgoraBridge, args: string[], senderId: string): Promise<CommandResult> {
  const parsed = parseProjectCreateArgs(args);
  if (!parsed.name) {
    return {
      text: "Usage: /project create <name> [--id <project_id>] [--summary <summary>] [--repo-path <path>] [--new-repo] [--nomos-id <nomos_id>] [--owner <owner>]",
    };
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
    "/project create <name> [--id <project_id>] [--summary <summary>] [--repo-path <path>] [--new-repo] [--nomos-id <nomos_id>] [--owner <owner>]",
    "/project list [status]",
    "/project show <project_id>",
  ].join("\n");
}

function tokenize(input: string): string[] {
  const pattern = /"([^"]+)"|'([^']+)'|(\S+)/g;
  const tokens: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(input)) !== null) {
    tokens.push(match[1] || match[2] || match[3]);
  }
  return tokens;
}
