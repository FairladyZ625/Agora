import type { AgentStatusItem } from '@/types/dashboard';

export type AgentPresenceFilter = 'all' | 'busy' | 'online' | 'stale' | 'disconnected' | 'offline';

export function filterAgentsByView(
  agents: AgentStatusItem[],
  presenceFilter: AgentPresenceFilter,
  channelFilter: string | null,
  hostFilter: string | null,
) {
  return agents.filter((agent) => {
    if (channelFilter && !agent.channelProviders.includes(channelFilter)) {
      return false;
    }
    if (hostFilter && agent.hostFramework !== hostFilter) {
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
