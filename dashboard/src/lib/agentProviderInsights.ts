import type { AgentStatusItem, AgentProviderSummary } from '@/types/dashboard';

export type AgentPresenceFilter = 'all' | 'busy' | 'online' | 'stale' | 'disconnected' | 'offline';

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
      overallPresence: 'offline',
      lastSeenAt: null,
      presenceReason: null,
      affectedAgents: [],
      history: [],
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
    current.lastSeenAt = newestTimestamp(current.lastSeenAt, agent.lastSeenAt);
    current.affectedAgents.push({
      id: agent.id,
      status: agent.status,
      presence: agent.presence,
      presenceReason: agent.presenceReason,
      lastSeenAt: agent.lastSeenAt,
      accountId: agent.accountId,
    });
    summaries.set(provider, current);
  }

  return Array.from(summaries.values())
    .map((summary) => {
      const affectedAgents = summary.affectedAgents.sort(compareAffectedAgents);
      const overallPresence = deriveOverallPresence(summary);
      return {
        ...summary,
        overallPresence,
        presenceReason: overallPresence === 'offline' ? null : (affectedAgents[0]?.presenceReason ?? null),
        affectedAgents,
      };
    })
    .sort((a, b) => a.provider.localeCompare(b.provider));
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

function deriveOverallPresence(summary: AgentProviderSummary): AgentProviderSummary['overallPresence'] {
  if (summary.disconnectedAgents > 0) {
    return 'disconnected';
  }
  if (summary.staleAgents > 0) {
    return 'stale';
  }
  if (summary.onlineAgents > 0 || summary.busyAgents > 0) {
    return 'online';
  }
  return 'offline';
}

function compareAffectedAgents(
  left: AgentProviderSummary['affectedAgents'][number],
  right: AgentProviderSummary['affectedAgents'][number],
) {
  const presenceDelta = presenceRank(left.presence) - presenceRank(right.presence);
  if (presenceDelta !== 0) {
    return presenceDelta;
  }
  const leftTime = left.lastSeenAt ? new Date(left.lastSeenAt).getTime() : 0;
  const rightTime = right.lastSeenAt ? new Date(right.lastSeenAt).getTime() : 0;
  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }
  return left.id.localeCompare(right.id);
}

function newestTimestamp(left: string | null, right: string | null) {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  return new Date(left).getTime() >= new Date(right).getTime() ? left : right;
}

function presenceRank(presence: AgentStatusItem['presence']) {
  switch (presence) {
    case 'disconnected':
      return 0;
    case 'stale':
      return 1;
    case 'online':
      return 2;
    default:
      return 3;
  }
}
