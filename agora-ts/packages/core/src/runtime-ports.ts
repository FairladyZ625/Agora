export type AgentPresenceState = 'online' | 'offline' | 'disconnected' | 'stale';
export type RuntimeAgentOrigin = 'agora_managed' | 'user_managed';
export type RuntimeBriefingMode = 'overlay_full' | 'overlay_delta';

export interface RegisteredAgent {
  id: string;
  inventory_kind?: 'agent' | 'runtime_target';
  host_framework: string | null;
  runtime_provider?: string | null;
  runtime_flavor?: string | null;
  runtime_target_ref?: string | null;
  channel_providers: string[];
  inventory_sources: string[];
  primary_model: string | null;
  workspace_dir: string | null;
  discord_bot_user_ids?: string[];
  agent_origin?: RuntimeAgentOrigin;
  briefing_mode?: RuntimeBriefingMode;
}

export interface AgentInventorySource {
  listAgents(): RegisteredAgent[];
}

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
  provider: string | null;
  account_id: string | null;
  presence: AgentPresenceState;
  reason: string | null;
}

export interface AgentProviderSignalEvent {
  occurred_at: string;
  provider: string;
  agent_id: string | null;
  account_id: string | null;
  kind:
    | 'provider_start'
    | 'provider_ready'
    | 'gateway_proxy_enabled'
    | 'health_restart'
    | 'auto_restart_attempt'
    | 'transport_error'
    | 'inbound_ready';
  severity: 'info' | 'warning' | 'error';
  detail: string | null;
}

export interface PresenceSource {
  listPresence(): AgentPresenceSnapshot[];
  listHistory?(): AgentPresenceHistoryEvent[];
  listSignals?(): AgentProviderSignalEvent[];
}

export interface RuntimeParticipantResolution {
  agent_ref: string;
  runtime_provider: string | null;
  runtime_actor_ref: string | null;
  runtime_flavor?: string | null;
  runtime_target_ref?: string | null;
  agent_origin?: RuntimeAgentOrigin;
  briefing_mode?: RuntimeBriefingMode;
}

export interface AgentRuntimePort {
  resolveAgent(agentRef: string): RuntimeParticipantResolution | null;
}

export class CompositeAgentInventorySource implements AgentInventorySource {
  constructor(private readonly sources: AgentInventorySource[]) {}

  listAgents(): RegisteredAgent[] {
    const merged = new Map<string, RegisteredAgent>();

    for (const source of this.sources) {
      for (const agent of source.listAgents()) {
        const current = merged.get(agent.id);
        if (!current) {
          merged.set(agent.id, {
          ...agent,
          channel_providers: [...agent.channel_providers].sort(),
          inventory_sources: [...agent.inventory_sources].sort(),
          ...(agent.discord_bot_user_ids ? { discord_bot_user_ids: [...agent.discord_bot_user_ids].sort() } : {}),
        });
        continue;
      }
      const discordBotUserIds = mergeUniqueSorted(current.discord_bot_user_ids ?? [], agent.discord_bot_user_ids ?? []);
      merged.set(agent.id, {
        ...current,
        ...((current.inventory_kind ?? agent.inventory_kind) ? { inventory_kind: current.inventory_kind ?? agent.inventory_kind } : {}),
        host_framework: current.host_framework ?? agent.host_framework,
        ...((current.runtime_provider ?? agent.runtime_provider) !== undefined
          ? { runtime_provider: current.runtime_provider ?? agent.runtime_provider ?? null }
          : {}),
        ...((current.runtime_flavor ?? agent.runtime_flavor) !== undefined
          ? { runtime_flavor: current.runtime_flavor ?? agent.runtime_flavor ?? null }
          : {}),
        ...((current.runtime_target_ref ?? agent.runtime_target_ref) !== undefined
          ? { runtime_target_ref: current.runtime_target_ref ?? agent.runtime_target_ref ?? null }
          : {}),
        channel_providers: mergeUniqueSorted(current.channel_providers, agent.channel_providers),
        inventory_sources: mergeUniqueSorted(current.inventory_sources, agent.inventory_sources),
        primary_model: current.primary_model ?? agent.primary_model,
        workspace_dir: current.workspace_dir ?? agent.workspace_dir,
        ...(discordBotUserIds.length > 0 ? { discord_bot_user_ids: discordBotUserIds } : {}),
        ...((current.agent_origin ?? agent.agent_origin) ? { agent_origin: current.agent_origin ?? agent.agent_origin } : {}),
        ...((current.briefing_mode ?? agent.briefing_mode) ? { briefing_mode: current.briefing_mode ?? agent.briefing_mode } : {}),
      });
      }
    }

    return Array.from(merged.values()).sort((left, right) => left.id.localeCompare(right.id));
  }
}

export class CompositePresenceSource implements PresenceSource {
  constructor(private readonly sources: PresenceSource[]) {}

  listPresence(): AgentPresenceSnapshot[] {
    return this.sources.flatMap((source) => source.listPresence());
  }

  listHistory(): AgentPresenceHistoryEvent[] {
    return this.sources
      .flatMap((source) => typeof source.listHistory === 'function' ? source.listHistory() : [])
      .sort((left, right) => new Date(right.occurred_at).getTime() - new Date(left.occurred_at).getTime());
  }

  listSignals(): AgentProviderSignalEvent[] {
    return this.sources
      .flatMap((source) => typeof source.listSignals === 'function' ? source.listSignals() : [])
      .sort((left, right) => new Date(right.occurred_at).getTime() - new Date(left.occurred_at).getTime());
  }
}

export class InventoryBackedAgentRuntimePort implements AgentRuntimePort {
  constructor(private readonly agentInventory: AgentInventorySource) {}

  resolveAgent(agentRef: string): RuntimeParticipantResolution | null {
    const agent = this.agentInventory.listAgents().find((item) => item.id === agentRef);
    if (!agent) {
      return null;
    }
    return {
      agent_ref: agent.id,
      runtime_provider: agent.runtime_provider ?? agent.host_framework ?? null,
      runtime_actor_ref: (agent.runtime_provider ?? agent.host_framework) ? agent.id : null,
      ...(agent.runtime_flavor !== undefined ? { runtime_flavor: agent.runtime_flavor } : {}),
      ...(agent.runtime_target_ref !== undefined ? { runtime_target_ref: agent.runtime_target_ref } : {}),
      ...(agent.agent_origin ? { agent_origin: agent.agent_origin } : {}),
      ...(agent.briefing_mode ? { briefing_mode: agent.briefing_mode } : {}),
    };
  }
}

function mergeUniqueSorted(left: string[], right: string[]) {
  return Array.from(new Set([...left, ...right])).sort();
}
