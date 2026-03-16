import type { AgentStatusItem, TemplateDetail } from '@/types/dashboard';
import type { CreateTaskInput, TaskPriority } from '@/types/task';
import { isCitizenRole, normalizeRoleBindingId } from '@/lib/orchestrationRoles';

export type RoleAssignments = Record<string, string>;
interface CraftsmanOption {
  id: string;
  label?: string;
  selectable?: boolean;
}
interface AssignmentInventory {
  agents: AgentStatusItem[];
  craftsmen: CraftsmanOption[];
}

interface BuildCreateTaskInputParams {
  title: string;
  description: string;
  priority: TaskPriority | string;
  locale: 'zh-CN' | 'en-US';
  projectId?: string | null;
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
      ...(member.memberKind ? { member_kind: member.memberKind } : {}),
      model_preference: member.modelPreference ?? '',
    }];
  });
}

export function buildInitialRoleAssignments(
  template: TemplateDetail | null,
  inventory: AssignmentInventory,
): RoleAssignments {
  if (!template) {
    return {};
  }

  const availableAgentIds = new Set(inventory.agents.map((agent) => agent.id));
  const availableCraftsmanIds = new Set(inventory.craftsmen.map((agent) => normalizeRoleBindingId('craftsman', agent.id, 'craftsman')));
  return template.defaultTeam.reduce<RoleAssignments>((acc, member) => {
    const suggested = member.suggested
      .map((agentId) => normalizeRoleBindingId(member.role, agentId, member.memberKind))
      .find((agentId) => (
        member.memberKind === 'craftsman' || member.role === 'craftsman'
          ? availableCraftsmanIds.has(agentId)
          : availableAgentIds.has(agentId)
      ));
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
  locale,
  projectId,
  template,
  type,
  visibility,
  assignments,
}: BuildCreateTaskInputParams): CreateTaskInput {
  const members = buildTeamMembers(template, assignments);
  const participantRefs = Array.from(new Set(
    members
      .filter((member) => isCitizenRole(member.role, member.member_kind ?? null))
      .map((member) => member.agentId),
  ));

  return {
    title: title.trim(),
    type,
    creator: 'archon',
    description: description.trim(),
    priority,
    locale,
    ...(projectId ? { project_id: projectId } : {}),
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
