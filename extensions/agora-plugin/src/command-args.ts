import type { CommandContext } from "./types";

export function tokenize(raw: string): string[] {
  const tokens: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw)) !== null) {
    tokens.push(match[1] || match[2] || match[3]);
  }
  return tokens;
}

export function resolveCommandTokens(commandName: string, ctx: CommandContext): string[] {
  const fallback = tokenize(ctx.args || "");
  const commandBody = typeof ctx.commandBody === "string" ? ctx.commandBody.trim() : "";
  if (!commandBody.startsWith("/")) {
    return fallback;
  }
  const normalizedPrefix = `/${commandName}`.toLowerCase();
  const loweredBody = commandBody.toLowerCase();
  if (loweredBody !== normalizedPrefix && !loweredBody.startsWith(`${normalizedPrefix} `)) {
    return fallback;
  }
  const derived = tokenize(commandBody.slice(commandName.length + 1).trim());
  return derived.length > 0 ? derived : fallback;
}
