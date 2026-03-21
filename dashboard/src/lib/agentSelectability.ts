import type { AgentStatusItem } from '@/types/dashboard';

export type AgentSelectabilityValue = 'selectable' | 'restricted';

export interface AgentSelectabilityState {
  value: AgentSelectabilityValue;
  reason: string | null;
}

export interface AgentSelectabilityReasonLabels {
  active_assignment: string;
  inventory_launchable: string;
  stale_observation: string;
  provider_disconnected: string;
  unbound_agent: string;
  legacy_presence_gate: string;
  legacy_presence_ok: string;
  unknown: string;
}

export function resolveAgentSelectability(agent: Pick<AgentStatusItem, 'presence' | 'selectability' | 'selectabilityReason'>): AgentSelectabilityState {
  if (agent.selectability) {
    return {
      value: agent.selectability,
      reason: agent.selectabilityReason ?? null,
    };
  }
  return {
    value: agent.presence === 'offline' || agent.presence === 'disconnected' ? 'restricted' : 'selectable',
    reason: agent.presence === 'offline' || agent.presence === 'disconnected' ? 'legacy_presence_gate' : 'legacy_presence_ok',
  };
}

export function isSelectableAgent(agent: Pick<AgentStatusItem, 'presence' | 'selectability' | 'selectabilityReason'>) {
  return resolveAgentSelectability(agent).value !== 'restricted';
}

export function formatSelectabilityReason(
  reason: string | null,
  labels: AgentSelectabilityReasonLabels,
) {
  if (!reason) {
    return labels.unknown;
  }
  return labels[reason as keyof AgentSelectabilityReasonLabels] ?? labels.unknown;
}
