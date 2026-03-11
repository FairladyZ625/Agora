import type { AgentStatusItem, TemplateTeamPresetMember } from '@/types/dashboard';

export interface TemplateRuntimeCompatibilityItem {
  role: string;
  compatibleSuggested: string[];
  unavailableSuggested: string[];
  missingSuggested: string[];
}

export function evaluateTemplateRuntimeCompatibility(
  members: TemplateTeamPresetMember[],
  agents: AgentStatusItem[],
): TemplateRuntimeCompatibilityItem[] {
  const agentById = new Map(agents.map((agent) => [agent.id, agent]));

  return members.map((member) => {
    const compatibleSuggested: string[] = [];
    const unavailableSuggested: string[] = [];
    const missingSuggested: string[] = [];

    for (const suggested of member.suggested) {
      const agent = agentById.get(suggested);
      if (!agent) {
        missingSuggested.push(suggested);
        continue;
      }
      if (agent.presence === 'offline' || agent.presence === 'disconnected') {
        unavailableSuggested.push(suggested);
        continue;
      }
      compatibleSuggested.push(suggested);
    }

    return {
      role: member.role,
      compatibleSuggested,
      unavailableSuggested,
      missingSuggested,
    };
  });
}
