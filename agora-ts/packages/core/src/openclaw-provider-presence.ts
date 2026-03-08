import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

export type AgentPresenceState = 'online' | 'offline' | 'disconnected';

export interface AgentPresenceSnapshot {
  agent_id: string;
  presence: AgentPresenceState;
  provider: string | null;
  account_id: string | null;
  last_seen_at: string | null;
}

export interface AgentPresenceSource {
  listPresence(): AgentPresenceSnapshot[];
}

export interface OpenClawLogPresenceSourceOptions {
  logPath?: string;
}

type PresenceAccumulator = {
  agent_id: string;
  presence: AgentPresenceState;
  provider: string | null;
  account_id: string | null;
  last_seen_at: string | null;
};

export class OpenClawLogPresenceSource implements AgentPresenceSource {
  private readonly logPath: string;

  constructor(options: OpenClawLogPresenceSourceOptions = {}) {
    this.logPath = resolveTilde(options.logPath ?? '~/.openclaw/logs/gateway.log');
  }

  listPresence(): AgentPresenceSnapshot[] {
    if (!existsSync(this.logPath)) {
      return [];
    }

    const lines = readFileSync(this.logPath, 'utf8')
      .split('\n')
      .filter((line) => line.includes('[discord]') || line.includes('[health-monitor] [discord:'));
    const snapshots = new Map<string, PresenceAccumulator>();

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const parsed = parsePresenceLine(lines[index] ?? '');
      if (!parsed) {
        continue;
      }
      if (snapshots.has(parsed.agent_id)) {
        continue;
      }
      snapshots.set(parsed.agent_id, parsed);
    }

    return Array.from(snapshots.values()).sort((a, b) => a.agent_id.localeCompare(b.agent_id));
  }
}

function parsePresenceLine(line: string): PresenceAccumulator | null {
  const timestamp = line.slice(0, line.indexOf(' '));
  const disconnected = line.match(/\[health-monitor\] \[discord:([^\]]+)\] health-monitor: restarting/);
  if (disconnected?.[1]) {
    return {
      agent_id: normalizeAgentId(disconnected[1]),
      presence: 'disconnected',
      provider: 'discord',
      account_id: normalizeAgentId(disconnected[1]),
      last_seen_at: normalizeTimestamp(timestamp),
    };
  }

  const starting = line.match(/\[discord\] \[([^\]]+)\] starting provider/);
  if (starting?.[1]) {
    const agentId = normalizeAgentId(starting[1]);
    return {
      agent_id: agentId,
      presence: 'online',
      provider: 'discord',
      account_id: agentId,
      last_seen_at: normalizeTimestamp(timestamp),
    };
  }

  return null;
}

function normalizeAgentId(value: string) {
  return value === 'default' ? 'main' : value;
}

function normalizeTimestamp(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function resolveTilde(path: string) {
  if (!path.startsWith('~/')) {
    return path;
  }
  return resolve(homedir(), path.slice(2));
}
