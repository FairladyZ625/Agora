export function parseRunningChromeRemoteDebuggingPort(processList: string, profileDir: string): number | null {
  const normalizedProfile = profileDir.trim();
  if (!normalizedProfile) {
    return null;
  }
  const lines = processList.split("\n");
  for (const line of lines) {
    if (!line.includes(normalizedProfile) || !line.includes("--remote-debugging-port=")) {
      continue;
    }
    const match = line.match(/--remote-debugging-port=(\d+)/);
    if (!match) {
      continue;
    }
    const port = Number(match[1]);
    if (Number.isFinite(port) && port > 0) {
      return port;
    }
  }
  return null;
}

export function normalizeDiscordSmokeCommands(commands: string[]) {
  return commands
    .map((command) => command.trim())
    .filter((command) => command.length > 0);
}

export type DiscordSmokeCommandSpec = {
  command: string;
  responder?: string;
};

export function normalizeDiscordSmokeCommandSpecs(specs: DiscordSmokeCommandSpec[]) {
  return specs
    .map((spec) => ({
      command: spec.command.trim(),
      responder: spec.responder?.trim() || undefined,
    }))
    .filter((spec) => spec.command.length > 0);
}

export function isDiscordLoginUrl(url: string) {
  return /discord\.com\/login/i.test(url);
}

export function splitSlashCommand(command: string) {
  const trimmed = command.trim();
  if (!trimmed.startsWith("/")) {
    return { commandName: trimmed, argsText: "" };
  }
  const firstSpace = trimmed.indexOf(" ");
  if (firstSpace === -1) {
    return {
      commandName: trimmed,
      argsText: "",
    };
  }
  return {
    commandName: trimmed.slice(0, firstSpace),
    argsText: trimmed.slice(firstSpace + 1).trim(),
  };
}

export function resolveSmokeCommandTemplate(command: string, replacements: {
  firstActiveProjectId?: string;
  firstActiveTaskId?: string;
}) {
  let resolved = command;
  if (resolved.includes("{{firstActiveProjectId}}")) {
    if (!replacements.firstActiveProjectId) {
      throw new Error("missing replacement for {{firstActiveProjectId}}");
    }
    resolved = resolved.replaceAll("{{firstActiveProjectId}}", replacements.firstActiveProjectId);
  }
  if (resolved.includes("{{firstActiveTaskId}}")) {
    if (!replacements.firstActiveTaskId) {
      throw new Error("missing replacement for {{firstActiveTaskId}}");
    }
    resolved = resolved.replaceAll("{{firstActiveTaskId}}", replacements.firstActiveTaskId);
  }
  return resolved;
}

export function expectedMarkersForSlashCommand(command: string) {
  const trimmed = command.trim();
  const createMatch = trimmed.match(/^\/task\s+create\s+["“]?(.+?)["”]?\s+(coding|coding_heavy|research|document|quick|brainstorm)\s*$/i);
  if (createMatch) {
    return ["Created OC-", createMatch[1]];
  }
  if (/^\/project\s+list\b/i.test(trimmed)) {
    return ["| active |"];
  }
  if (/^\/project\s+show\b/i.test(trimmed)) {
    return ["knowledge=", "index="];
  }
  if (/^\/task\s+list\b/i.test(trimmed)) {
    return ["OC-", "| active |"];
  }
  if (/^\/task\s+status\b/i.test(trimmed)) {
    return ["flow_log=", "subtasks="];
  }
  if (/^\/task$/i.test(trimmed)) {
    return ["Agora /task commands:", "Most common:"];
  }
  if (/^\/project$/i.test(trimmed)) {
    return ["Agora /project commands:", "/project list active"];
  }
  return [];
}

export function slashCommandAssertionPassed(command: string, bodyText: string) {
  const markers = expectedMarkersForSlashCommand(command);
  return markers.every((marker) => bodyText.includes(marker));
}

export function isDiscordPendingResponse(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return /正在响应|responding|thinking|typing/i.test(normalized);
}

export function extractDiscordResponseDelta(beforeText: string, currentText: string) {
  if (currentText.startsWith(beforeText)) {
    return currentText.slice(beforeText.length);
  }
  return currentText;
}

export function shouldSettleDiscordResponse(input: {
  beforeText: string;
  currentText: string;
  quietMs: number;
  minQuietMs: number;
  assertionPassed?: boolean;
  hasExpectedMarkers?: boolean;
}) {
  const { beforeText, currentText, quietMs, minQuietMs, assertionPassed = false, hasExpectedMarkers = false } = input;
  const hasNewOutput = currentText.trim() !== beforeText.trim();
  if (!hasNewOutput || quietMs < minQuietMs) {
    return false;
  }
  if (assertionPassed) {
    return true;
  }
  if (hasExpectedMarkers) {
    return false;
  }
  return !isDiscordPendingResponse(extractDiscordResponseDelta(beforeText, currentText));
}
