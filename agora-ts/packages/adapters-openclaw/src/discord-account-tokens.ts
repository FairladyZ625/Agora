import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

export interface OpenClawDiscordAccountTokensOptions {
  configPath?: string;
}

export function loadOpenClawDiscordAccountTokens(
  options: OpenClawDiscordAccountTokensOptions = {},
): Record<string, string> {
  const configPath = resolveTilde(options.configPath ?? '~/.openclaw/openclaw.json');
  if (!existsSync(configPath)) {
    return {};
  }
  const raw = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
  const channels = isObjectRecord(raw.channels) ? raw.channels : null;
  const discord = channels && isObjectRecord(channels.discord) ? channels.discord : null;
  const accounts = discord && isObjectRecord(discord.accounts) ? discord.accounts : null;
  if (!accounts) {
    return {};
  }

  const tokens: Record<string, string> = {};
  for (const [accountId, value] of Object.entries(accounts)) {
    if (!isObjectRecord(value)) {
      continue;
    }
    const token = value.token;
    if (typeof token !== 'string' || token.trim().length === 0) {
      continue;
    }
    tokens[accountId] = token;
  }
  return tokens;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function resolveTilde(path: string) {
  if (!path.startsWith('~/')) {
    return path;
  }
  return resolve(homedir(), path.slice(2));
}
