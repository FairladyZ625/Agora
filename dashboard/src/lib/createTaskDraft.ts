import type { AgentStatusItem, TemplateDetail } from '@/types/dashboard';
import type { CreateTaskInput, TaskPriority } from '@/types/task';

export type RoleAssignments = Record<string, string>;

interface BuildCreateTaskInputParams {
  title: string;
  description: string;
  priority: TaskPriority | string;
  template: TemplateDetail;
  type: string;
  visibility: 'public' | 'private';
  assignments: RoleAssignments;
}

function buildTeamMembers(template: TemplateDetail, assignments: RoleAssignments) {
  return template.defaultTeam.flatMap((member) => {
    const agentId = assignments[member.role];
    if (!agentId) {
      return [];
    }
    return [{
      role: member.role,
      agentId,
      ...(member.modelPreference ? { model_preference: member.modelPreference } : {}),
    }];
  });
}

export function buildInitialRoleAssignments(
  template: TemplateDetail | null,
  agents: AgentStatusItem[],
): RoleAssignments {
  if (!template) {
    return {};
  }

  const availableAgentIds = new Set(agents.map((agent) => agent.id));
  return template.defaultTeam.reduce<RoleAssignments>((acc, member) => {
    const suggested = member.suggested.find((agentId) => availableAgentIds.has(agentId));
    if (suggested) {
      acc[member.role] = suggested;
    }
    return acc;
  }, {});
}

export function buildCreateTaskInput({
  title,
  description,
  priority,
  template,
  type,
  visibility,
  assignments,
}: BuildCreateTaskInputParams): CreateTaskInput {
  const members = buildTeamMembers(template, assignments);
  const participantRefs = Array.from(new Set(members.map((member) => member.agentId)));

  return {
    title: title.trim(),
    type,
    creator: 'archon',
    description: description.trim(),
    priority,
    ...(members.length > 0
      ? {
          team_override: {
            members,
          },
        }
      : {}),
    ...(participantRefs.length > 0
      ? {
          im_target: {
            provider: 'discord',
            visibility,
            participant_refs: participantRefs,
          },
        }
      : {}),
  };
}
