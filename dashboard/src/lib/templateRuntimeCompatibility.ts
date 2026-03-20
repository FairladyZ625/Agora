import type { AgentStatusItem, TemplateTeamPresetMember } from '@/types/dashboard';
import { isCraftsmanRole, normalizeRoleBindingId } from '@/lib/orchestrationRoles';

export interface TemplateRuntimeCompatibilityItem {
  role: string;
  compatibleSuggested: string[];
  unavailableSuggested: string[];
  missingSuggested: string[];
}

export interface TemplateControllerTopology {
  controllerRoles: string[];
  isMissingController: boolean;
  hasDuplicateControllers: boolean;
}

export function evaluateTemplateRuntimeCompatibility(
  members: TemplateTeamPresetMember[],
  agents: AgentStatusItem[],
  craftsmanAgents: string[] = [],
): TemplateRuntimeCompatibilityItem[] {
  const agentById = new Map(agents.map((agent) => [agent.id, agent]));
  const craftsmanIds = new Set(craftsmanAgents.map((agentId) => normalizeRoleBindingId('craftsman', agentId)));

  return members.map((member) => {
    const compatibleSuggested: string[] = [];
    const unavailableSuggested: string[] = [];
    const missingSuggested: string[] = [];

    for (const suggested of member.suggested) {
      const normalizedSuggested = normalizeRoleBindingId(member.role, suggested, member.memberKind);
      if (isCraftsmanRole(member.role, member.memberKind)) {
        if (!craftsmanIds.has(normalizedSuggested)) {
          missingSuggested.push(normalizedSuggested);
          continue;
        }
        compatibleSuggested.push(normalizedSuggested);
        continue;
      }
      const agent = agentById.get(normalizedSuggested);
      if (!agent) {
        missingSuggested.push(normalizedSuggested);
        continue;
      }
      if (!isSelectableAgent(agent)) {
        unavailableSuggested.push(normalizedSuggested);
        continue;
      }
      compatibleSuggested.push(normalizedSuggested);
    }

    return {
      role: member.role,
      compatibleSuggested,
      unavailableSuggested,
      missingSuggested,
    };
  });
}

function isSelectableAgent(agent: AgentStatusItem) {
  if (agent.selectability) {
    return agent.selectability !== 'restricted';
  }
  return agent.presence !== 'offline' && agent.presence !== 'disconnected';
}

export function evaluateTemplateControllerTopology(members: TemplateTeamPresetMember[]): TemplateControllerTopology {
  const controllerRoles = members
    .filter((member) => member.memberKind === 'controller')
    .map((member) => member.role);

  return {
    controllerRoles,
    isMissingController: controllerRoles.length === 0,
    hasDuplicateControllers: controllerRoles.length > 1,
  };
}
