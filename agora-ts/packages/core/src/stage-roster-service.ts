import type { TeamDto, WorkflowRosterRoleDto, WorkflowStageDto } from '@agora-ts/contracts';
import type { StoredParticipantBinding } from '@agora-ts/db';
import { isInteractiveParticipant, resolveControllerRef } from './team-member-kind.js';

export interface StageRosterPlan {
  desired_refs: string[];
  to_join: string[];
  to_leave: string[];
}

export interface StageExposureDecision {
  agent_ref: string;
  desired_exposure: 'in_thread' | 'hidden';
  exposure_reason: string;
}

export class StageRosterService {
  buildPlan(
    team: TeamDto | null | undefined,
    stage: WorkflowStageDto | null | undefined,
    participants: StoredParticipantBinding[],
  ): StageRosterPlan {
    const desiredRefs = this.resolveDesiredRefs(team, stage);
    const joinedRefs = new Set(
      participants
        .filter((participant) => participant.join_status === 'joined')
        .map((participant) => participant.agent_ref),
    );
    const participantRefs = new Set(participants.map((participant) => participant.agent_ref));

    return {
      desired_refs: desiredRefs,
      to_join: desiredRefs.filter((agentRef) => !joinedRefs.has(agentRef) || !participantRefs.has(agentRef)),
      to_leave: Array.from(joinedRefs).filter((agentRef) => !desiredRefs.includes(agentRef)),
    };
  }

  resolveDesiredRefs(
    team: TeamDto | null | undefined,
    stage: WorkflowStageDto | null | undefined,
  ): string[] {
    return this.resolveExposureDecisions(team, stage)
      .filter((decision) => decision.desired_exposure === 'in_thread')
      .map((decision) => decision.agent_ref);
  }

  resolveExposureDecisions(
    team: TeamDto | null | undefined,
    stage: WorkflowStageDto | null | undefined,
  ): StageExposureDecision[] {
    const members = (team?.members ?? []).filter(isInteractiveParticipant);
    const universe = new Map(members.map((member) => [member.agentId, member]));
    const roster = stage?.roster;
    const controllerRef = resolveControllerRef(members);

    if (!roster) {
      return members.map((member) => ({
        agent_ref: member.agentId,
        desired_exposure: 'in_thread',
        exposure_reason: member.agentId === controllerRef ? 'controller_preserved' : 'interactive_default',
      }));
    }

    const selected = new Set<string>();
    const reasons = new Map<string, string>();
    const hasPositiveSelectors = (roster.include_roles?.length ?? 0) > 0 || (roster.include_agents?.length ?? 0) > 0;

    if (hasPositiveSelectors) {
      for (const member of members) {
        if (roster.include_roles?.includes(member.role as WorkflowRosterRoleDto)) {
          selected.add(member.agentId);
          reasons.set(member.agentId, 'stage_roster_selected');
        }
      }
      for (const agentRef of roster.include_agents ?? []) {
        if (universe.has(agentRef)) {
          selected.add(agentRef);
          reasons.set(agentRef, 'stage_roster_selected');
        }
      }
    } else {
      for (const agentRef of universe.keys()) {
        selected.add(agentRef);
        reasons.set(agentRef, 'stage_roster_default_all');
      }
    }

    for (const agentRef of roster.exclude_agents ?? []) {
      selected.delete(agentRef);
      reasons.set(agentRef, 'stage_roster_excluded');
    }

    if (controllerRef && roster.keep_controller !== false) {
      selected.add(controllerRef);
      reasons.set(controllerRef, 'controller_preserved');
    }

    return members.map((member) => ({
      agent_ref: member.agentId,
      desired_exposure: selected.has(member.agentId) ? 'in_thread' : 'hidden',
      exposure_reason: selected.has(member.agentId)
        ? (reasons.get(member.agentId) ?? 'stage_roster_selected')
        : 'stage_roster_excluded',
    }));
  }
}
