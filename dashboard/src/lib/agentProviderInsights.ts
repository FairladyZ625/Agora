import type { AgentStatusItem } from '@/types/dashboard';

export type AgentPresenceFilter = 'all' | 'busy' | 'online' | 'stale' | 'disconnected' | 'offline';

export interface AgentProviderSummary {
  provider: string;
  totalAgents: number;
  busyAgents: number;
  onlineAgents: number;
  staleAgents: number;
  disconnectedAgents: number;
  offlineAgents: number;
}

export function buildProviderSummaries(agents: AgentStatusItem[]): AgentProviderSummary[] {
  const summaries = new Map<string, AgentProviderSummary>();

  for (const agent of agents) {
    const provider = agent.provider ?? 'unknown';
    const current = summaries.get(provider) ?? {
      provider,
      totalAgents: 0,
      busyAgents: 0,
      onlineAgents: 0,
      staleAgents: 0,
      disconnectedAgents: 0,
      offlineAgents: 0,
    };
    current.totalAgents += 1;
    if (agent.status === 'busy') {
      current.busyAgents += 1;
    }
    switch (agent.presence) {
      case 'online':
        current.onlineAgents += 1;
        break;
      case 'stale':
        current.staleAgents += 1;
        break;
      case 'disconnected':
        current.disconnectedAgents += 1;
        break;
      default:
        current.offlineAgents += 1;
        break;
    }
    summaries.set(provider, current);
  }

  return Array.from(summaries.values()).sort((a, b) => a.provider.localeCompare(b.provider));
}

export function filterAgentsByView(
  agents: AgentStatusItem[],
  presenceFilter: AgentPresenceFilter,
  providerFilter: string | null,
) {
  return agents.filter((agent) => {
    if (providerFilter && agent.provider !== providerFilter) {
      return false;
    }
    switch (presenceFilter) {
      case 'busy':
        return agent.status === 'busy';
      case 'online':
      case 'stale':
      case 'disconnected':
      case 'offline':
        return agent.presence === presenceFilter;
      default:
        return true;
    }
  });
}
