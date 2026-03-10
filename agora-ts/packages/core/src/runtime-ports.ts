export type AgentPresenceState = 'online' | 'offline' | 'disconnected' | 'stale';

export interface RegisteredAgent {
  id: string;
  host_framework: string | null;
  channel_providers: string[];
  inventory_sources: string[];
  primary_model: string | null;
  workspace_dir: string | null;
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
}

export interface AgentRuntimePort {
  resolveAgent(agentRef: string): RuntimeParticipantResolution | null;
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
      runtime_provider: agent.host_framework ?? null,
      runtime_actor_ref: agent.host_framework ? agent.id : null,
    };
  }
}
