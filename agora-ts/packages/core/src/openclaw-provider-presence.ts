import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

export type AgentPresenceState = 'online' | 'offline' | 'disconnected' | 'stale';

export interface AgentPresenceSnapshot {
  agent_id: string;
  presence: AgentPresenceState;
  provider: string | null;
  account_id: string | null;
  last_seen_at: string | null;
  reason: string | null;
}

export interface AgentPresenceHistoryEvent {
  occurred_at: string;
  agent_id: string;
  account_id: string | null;
  presence: AgentPresenceState;
  reason: string | null;
}

export interface AgentPresenceSource {
  listPresence(): AgentPresenceSnapshot[];
  listHistory?(): AgentPresenceHistoryEvent[];
}

export interface OpenClawLogPresenceSourceOptions {
  logPath?: string;
  staleAfterMs?: number;
  now?: () => Date;
}

type PresenceAccumulator = {
  agent_id: string;
  presence: AgentPresenceState;
  provider: string | null;
  account_id: string | null;
  last_seen_at: string | null;
  reason: string | null;
};

type HistoryEvent = AgentPresenceHistoryEvent;

export class OpenClawLogPresenceSource implements AgentPresenceSource {
  private readonly logPath: string;
  private readonly staleAfterMs: number;
  private readonly now: () => Date;

  constructor(options: OpenClawLogPresenceSourceOptions = {}) {
    this.logPath = resolveTilde(options.logPath ?? '~/.openclaw/logs/gateway.log');
    this.staleAfterMs = options.staleAfterMs ?? 10 * 60 * 1000;
    this.now = options.now ?? (() => new Date());
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
      snapshots.set(parsed.agent_id, applyFreshness(parsed, this.now, this.staleAfterMs));
    }

    return Array.from(snapshots.values()).sort((a, b) => a.agent_id.localeCompare(b.agent_id));
  }

  listHistory(): AgentPresenceHistoryEvent[] {
    if (!existsSync(this.logPath)) {
      return [];
    }

    return readFileSync(this.logPath, 'utf8')
      .split('\n')
      .map((line) => parseHistoryLine(line))
      .filter((item): item is HistoryEvent => Boolean(item))
      .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());
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
      reason: 'health_monitor_restart',
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
      reason: 'provider_start',
    };
  }

  return null;
}

function parseHistoryLine(line: string): HistoryEvent | null {
  const timestamp = normalizeTimestamp(line.slice(0, line.indexOf(' ')));
  if (!timestamp) {
    return null;
  }

  const disconnected = line.match(/\[health-monitor\] \[discord:([^\]]+)\] health-monitor: restarting/);
  if (disconnected?.[1]) {
    const agentId = normalizeAgentId(disconnected[1]);
    return {
      occurred_at: timestamp,
      agent_id: agentId,
      account_id: agentId,
      presence: 'disconnected',
      reason: 'health_monitor_restart',
    };
  }

  const starting = line.match(/\[discord\] \[([^\]]+)\] starting provider/);
  if (starting?.[1]) {
    const agentId = normalizeAgentId(starting[1]);
    return {
      occurred_at: timestamp,
      agent_id: agentId,
      account_id: agentId,
      presence: 'online',
      reason: 'provider_start',
    };
  }

  return null;
}

function applyFreshness(
  snapshot: PresenceAccumulator,
  now: () => Date,
  staleAfterMs: number,
): PresenceAccumulator {
  if (snapshot.presence !== 'online' || !snapshot.last_seen_at) {
    return snapshot;
  }
  const ageMs = now().getTime() - new Date(snapshot.last_seen_at).getTime();
  if (!Number.isFinite(ageMs) || ageMs <= staleAfterMs) {
    return snapshot;
  }
  return {
    ...snapshot,
    presence: 'stale',
    reason: 'stale_gateway_log',
  };
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
