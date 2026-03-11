import type { TeamDto, TeamMemberDto } from '@agora-ts/contracts';

export type TeamMemberLike = Pick<TeamMemberDto, 'role' | 'member_kind'>;
export type TeamMemberWithAgent = Pick<TeamMemberDto, 'role' | 'member_kind' | 'agentId'>;

export function resolveTeamMemberKind(member: TeamMemberLike): NonNullable<TeamMemberDto['member_kind']> {
  if (member.member_kind) {
    return member.member_kind;
  }
  return member.role === 'craftsman' ? 'craftsman' : 'citizen';
}

export function isInteractiveParticipant(member: TeamMemberLike): boolean {
  return resolveTeamMemberKind(member) !== 'craftsman';
}

export function resolveControllerRef(members: TeamDto['members'] | TeamMemberWithAgent[]): string | null {
  const controller = members.find((member) => resolveTeamMemberKind(member) === 'controller');
  return controller?.agentId ?? null;
}
