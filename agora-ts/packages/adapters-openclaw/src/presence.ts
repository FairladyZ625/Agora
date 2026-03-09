import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import type {
  AgentPresenceHistoryEvent,
  AgentPresenceSnapshot,
  AgentPresenceState,
  AgentProviderSignalEvent,
  PresenceSource,
} from '@agora-ts/core';

export interface OpenClawLogPresenceSourceOptions {
  logPath?: string;
  staleAfterMs?: number;
  maxBytes?: number;
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

export class OpenClawLogPresenceSource implements PresenceSource {
  private readonly logPath: string;
  private readonly staleAfterMs: number;
  private readonly maxBytes: number;
  private readonly now: () => Date;
  private cachedSize: number | null = null;
  private cachedMtimeMs: number | null = null;
  private cachedLines: string[] | null = null;

  constructor(options: OpenClawLogPresenceSourceOptions = {}) {
    this.logPath = resolveTilde(options.logPath ?? '~/.openclaw/logs/gateway.log');
    this.staleAfterMs = options.staleAfterMs ?? 10 * 60 * 1000;
    this.maxBytes = options.maxBytes ?? 4 * 1024 * 1024;
    this.now = options.now ?? (() => new Date());
  }

  listPresence(): AgentPresenceSnapshot[] {
    const lines = this.readRelevantLines()
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
    return this.readRelevantLines()
      .map((line) => parseHistoryLine(line))
      .filter((item): item is HistoryEvent => Boolean(item))
      .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());
  }

  listSignals(): AgentProviderSignalEvent[] {
    return this.readRelevantLines()
      .map((line) => parseSignalLine(line))
      .filter((item): item is AgentProviderSignalEvent => Boolean(item))
      .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());
  }

  private readRelevantLines() {
    if (!existsSync(this.logPath)) {
      return [];
    }

    const stats = statSync(this.logPath);
    if (
      this.cachedLines &&
      this.cachedSize === stats.size &&
      this.cachedMtimeMs === stats.mtimeMs
    ) {
      return this.cachedLines;
    }

    const text = readTailUtf8(this.logPath, this.maxBytes);
    const lines = text.split('\n').filter((line) => line.length > 0);
    this.cachedLines = lines;
    this.cachedSize = stats.size;
    this.cachedMtimeMs = stats.mtimeMs;
    return lines;
  }
}

function readTailUtf8(path: string, maxBytes: number) {
  const stats = statSync(path);
  if (stats.size <= maxBytes) {
    return readFileSync(path, 'utf8');
  }

  const fd = openSync(path, 'r');
  try {
    const size = Math.min(maxBytes, stats.size);
    const buffer = Buffer.alloc(size);
    const offset = stats.size - size;
    readSync(fd, buffer, 0, size, offset);
    let text = buffer.toString('utf8');
    if (offset > 0) {
      const newlineIndex = text.indexOf('\n');
      if (newlineIndex >= 0) {
        text = text.slice(newlineIndex + 1);
      }
    }
    return text;
  } finally {
    closeSync(fd);
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

function parseSignalLine(line: string): AgentProviderSignalEvent | null {
  const timestamp = normalizeTimestamp(line.slice(0, line.indexOf(' ')));
  if (!timestamp) {
    return null;
  }

  const healthRestart = line.match(/\[health-monitor\] \[([a-z]+):([^\]]+)\] health-monitor: restarting \(reason: ([^)]+)\)/);
  if (healthRestart?.[1] && healthRestart[2]) {
    const provider = healthRestart[1];
    const agentId = normalizeAgentId(healthRestart[2]);
    return {
      occurred_at: timestamp,
      provider,
      agent_id: agentId,
      account_id: agentId,
      kind: 'health_restart',
      severity: 'error',
      detail: healthRestart[3] ?? null,
    };
  }

  const autoRestart = line.match(/\[([a-z]+)\] \[([^\]]+)\] auto-restart attempt (\d+\/\d+) in ([0-9]+s)/);
  if (autoRestart?.[1] && autoRestart[2]) {
    const provider = autoRestart[1];
    const agentId = normalizeAgentId(autoRestart[2]);
    return {
      occurred_at: timestamp,
      provider,
      agent_id: agentId,
      account_id: provider === 'whatsapp' ? null : agentId,
      kind: 'auto_restart_attempt',
      severity: 'warning',
      detail: `${autoRestart[3]} in ${autoRestart[4]}`,
    };
  }

  const starting = line.match(/\[([a-z]+)\] \[([^\]]+)\] starting provider(?: \(([^)]+)\))?/);
  if (starting?.[1] && starting[2]) {
    const provider = starting[1];
    const agentId = normalizeAgentId(starting[2]);
    return {
      occurred_at: timestamp,
      provider,
      agent_id: agentId,
      account_id: provider === 'whatsapp' ? null : agentId,
      kind: 'provider_start',
      severity: 'info',
      detail: starting[3] ?? null,
    };
  }

  const loggedIn = line.match(/\[discord\] logged in to discord as ([0-9]+) \(([^)]+)\)/);
  if (loggedIn?.[1]) {
    return {
      occurred_at: timestamp,
      provider: 'discord',
      agent_id: null,
      account_id: loggedIn[1],
      kind: 'provider_ready',
      severity: 'info',
      detail: loggedIn[2] ?? null,
    };
  }

  if (line.includes('[discord] gateway proxy enabled')) {
    return {
      occurred_at: timestamp,
      provider: 'discord',
      agent_id: null,
      account_id: null,
      kind: 'gateway_proxy_enabled',
      severity: 'info',
      detail: null,
    };
  }

  const wsClosed = line.match(/\[discord\] gateway: WebSocket connection closed with code ([0-9]+)/);
  if (wsClosed?.[1]) {
    return {
      occurred_at: timestamp,
      provider: 'discord',
      agent_id: null,
      account_id: null,
      kind: 'transport_error',
      severity: 'error',
      detail: `code ${wsClosed[1]}`,
    };
  }

  if (line.includes('[whatsapp] Listening for personal WhatsApp inbound messages.')) {
    return {
      occurred_at: timestamp,
      provider: 'whatsapp',
      agent_id: 'main',
      account_id: null,
      kind: 'inbound_ready',
      severity: 'info',
      detail: 'Listening for personal WhatsApp inbound messages.',
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
