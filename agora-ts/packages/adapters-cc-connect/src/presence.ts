import { existsSync, readFileSync, readdirSync } from 'node:fs';
import {
  type AgentPresenceHistoryEvent,
  type AgentPresenceSnapshot,
  type AgentPresenceState,
  type AgentProviderSignalEvent,
  type PresenceSource,
} from '@agora-ts/core';
import { buildCcConnectAgentId } from './agent-registry.js';
import { loadCcConnectProjectTargets, type CcConnectProjectTarget } from './config-targets.js';

export interface CcConnectProjectReadInput {
  configPath?: string;
  managementBaseUrl?: string;
  managementToken?: string;
  project: string;
}

export interface CcConnectManagedProjectDetail {
  platforms: Array<{ type: string; connected: boolean }>;
}

type ManagementReader = {
  getProject(input: CcConnectProjectReadInput): Promise<CcConnectManagedProjectDetail>;
};

type PresenceDependencies = {
  env?: NodeJS.ProcessEnv;
  exists?: (path: string) => boolean;
  readFile?: (path: string, encoding: BufferEncoding) => string;
  readDir?: (path: string) => string[];
  managementService?: ManagementReader;
  now?: () => Date;
};

export interface CcConnectManagementPresenceSourceOptions extends PresenceDependencies {
  targets?: CcConnectProjectTarget[];
  autoStart?: boolean;
  pollIntervalMs?: number;
  staleAfterMs?: number;
  maxHistoryEntries?: number;
  maxSignalEntries?: number;
}

type ManagedSnapshot = AgentPresenceSnapshot & {
  raw_presence: AgentPresenceState;
};

export class CcConnectManagementPresenceSource implements PresenceSource {
  private readonly targets: CcConnectProjectTarget[];
  private readonly managementService: ManagementReader;
  private readonly now: () => Date;
  private readonly pollIntervalMs: number;
  private readonly staleAfterMs: number;
  private readonly maxHistoryEntries: number;
  private readonly maxSignalEntries: number;
  private readonly snapshots = new Map<string, ManagedSnapshot>();
  private readonly history: AgentPresenceHistoryEvent[] = [];
  private readonly signals: AgentProviderSignalEvent[] = [];
  private interval: NodeJS.Timeout | null = null;
  private refreshPromise: Promise<void> | null = null;

  constructor(options: CcConnectManagementPresenceSourceOptions = {}) {
    this.targets = options.targets ?? loadCcConnectProjectTargets({
      env: options.env ?? process.env,
      exists: options.exists ?? existsSync,
      readFile: options.readFile ?? readFileSync,
      readDir: options.readDir ?? readdirSync,
    });
    if (!options.managementService) {
      throw new Error('CcConnectManagementPresenceSource requires a managementService');
    }
    this.managementService = options.managementService;
    this.now = options.now ?? (() => new Date());
    this.pollIntervalMs = options.pollIntervalMs ?? 30_000;
    this.staleAfterMs = options.staleAfterMs ?? 10 * 60 * 1000;
    this.maxHistoryEntries = options.maxHistoryEntries ?? 200;
    this.maxSignalEntries = options.maxSignalEntries ?? 200;

    if (options.autoStart !== false) {
      this.start();
    }
  }

  start() {
    if (this.interval) {
      return;
    }
    void this.refreshNow();
    this.interval = setInterval(() => {
      void this.refreshNow();
    }, this.pollIntervalMs);
    this.interval.unref?.();
  }

  stop() {
    if (!this.interval) {
      return;
    }
    clearInterval(this.interval);
    this.interval = null;
  }

  async refreshNow() {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }
    this.refreshPromise = this.performRefresh().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  listPresence(): AgentPresenceSnapshot[] {
    return Array.from(this.snapshots.values())
      .map((snapshot) => applyFreshness(snapshot, this.now, this.staleAfterMs))
      .sort((left, right) => left.agent_id.localeCompare(right.agent_id));
  }

  listHistory(): AgentPresenceHistoryEvent[] {
    return [...this.history];
  }

  listSignals(): AgentProviderSignalEvent[] {
    return [...this.signals];
  }

  private async performRefresh() {
    const nextSnapshots = new Map<string, ManagedSnapshot>();

    for (const target of this.targets) {
      const agentId = buildCcConnectAgentId(target.projectName);
      const occurredAt = this.now().toISOString();
      const provider = target.channelProviders[0] ?? 'cc-connect';

      if (!target.management.enabled || !target.management.baseUrl || !target.management.token) {
        this.upsertSnapshot(nextSnapshots, {
          agent_id: agentId,
          presence: 'offline',
          provider,
          account_id: null,
          last_seen_at: null,
          reason: 'management_not_configured',
          raw_presence: 'offline',
        }, occurredAt);
        continue;
      }

      try {
        const detail = await this.managementService.getProject({
          configPath: target.configPath,
          managementBaseUrl: target.management.baseUrl,
          managementToken: target.management.token,
          project: target.projectName,
        });
        this.upsertSnapshot(nextSnapshots, buildSnapshot(target, detail, occurredAt), occurredAt);
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'management poll failed';
        this.upsertSnapshot(nextSnapshots, {
          agent_id: agentId,
          presence: 'disconnected',
          provider,
          account_id: null,
          last_seen_at: occurredAt,
          reason: 'management_poll_error',
          raw_presence: 'disconnected',
        }, occurredAt, {
          kind: 'transport_error',
          severity: 'error',
          detail,
        });
      }
    }

    this.snapshots.clear();
    for (const [agentId, snapshot] of nextSnapshots.entries()) {
      this.snapshots.set(agentId, snapshot);
    }
  }

  private upsertSnapshot(
    nextSnapshots: Map<string, ManagedSnapshot>,
    snapshot: ManagedSnapshot,
    occurredAt: string,
    forcedSignal?: Pick<AgentProviderSignalEvent, 'kind' | 'severity' | 'detail'>,
  ) {
    const previous = this.snapshots.get(snapshot.agent_id);
    nextSnapshots.set(snapshot.agent_id, snapshot);

    if (!previous || previous.raw_presence !== snapshot.raw_presence || previous.reason !== snapshot.reason) {
      this.history.unshift({
        occurred_at: occurredAt,
        agent_id: snapshot.agent_id,
        provider: snapshot.provider,
        account_id: snapshot.account_id,
        presence: snapshot.raw_presence,
        reason: snapshot.reason,
      });
      trimEntries(this.history, this.maxHistoryEntries);
    }

    const signal = forcedSignal ?? deriveSignal(previous?.raw_presence, snapshot);
    if (!signal) {
      return;
    }
    this.signals.unshift({
      occurred_at: occurredAt,
      provider: snapshot.provider ?? 'cc-connect',
      agent_id: snapshot.agent_id,
      account_id: snapshot.account_id,
      kind: signal.kind,
      severity: signal.severity,
      detail: signal.detail,
    });
    trimEntries(this.signals, this.maxSignalEntries);
  }
}

function buildSnapshot(
  target: CcConnectProjectTarget,
  detail: CcConnectManagedProjectDetail,
  occurredAt: string,
): ManagedSnapshot {
  const connectedPlatforms = detail.platforms.filter((platform) => platform.connected);
  const provider = connectedPlatforms[0]?.type ?? detail.platforms[0]?.type ?? target.channelProviders[0] ?? 'cc-connect';
  const presence: AgentPresenceState = connectedPlatforms.length > 0 ? 'online' : 'disconnected';
  return {
    agent_id: buildCcConnectAgentId(target.projectName),
    presence,
    provider,
    account_id: null,
    last_seen_at: occurredAt,
    reason: connectedPlatforms.length > 0 ? 'management_connected' : 'management_disconnected',
    raw_presence: presence,
  };
}

function deriveSignal(previous: AgentPresenceState | undefined, snapshot: ManagedSnapshot) {
  if (snapshot.raw_presence === 'online' && previous !== 'online') {
    return {
      kind: 'provider_ready' as const,
      severity: 'info' as const,
      detail: 'management api reports platform connected',
    };
  }
  if (snapshot.raw_presence === 'disconnected' && previous !== 'disconnected') {
    return {
      kind: 'transport_error' as const,
      severity: 'error' as const,
      detail: 'management api reports platform disconnected',
    };
  }
  return null;
}

function applyFreshness(
  snapshot: ManagedSnapshot,
  now: () => Date,
  staleAfterMs: number,
): AgentPresenceSnapshot {
  if (snapshot.raw_presence !== 'online' || !snapshot.last_seen_at) {
    return stripRawPresence(snapshot);
  }
  const ageMs = now().getTime() - new Date(snapshot.last_seen_at).getTime();
  if (!Number.isFinite(ageMs) || ageMs <= staleAfterMs) {
    return stripRawPresence(snapshot);
  }
  return {
    ...stripRawPresence(snapshot),
    presence: 'stale',
    reason: 'stale_management_poll',
  };
}

function stripRawPresence(snapshot: ManagedSnapshot): AgentPresenceSnapshot {
  return {
    agent_id: snapshot.agent_id,
    presence: snapshot.raw_presence,
    provider: snapshot.provider,
    account_id: snapshot.account_id,
    last_seen_at: snapshot.last_seen_at,
    reason: snapshot.reason,
  };
}

function trimEntries<T>(entries: T[], maxEntries: number) {
  if (entries.length > maxEntries) {
    entries.length = maxEntries;
  }
}
