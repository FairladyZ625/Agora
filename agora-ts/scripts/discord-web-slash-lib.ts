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
