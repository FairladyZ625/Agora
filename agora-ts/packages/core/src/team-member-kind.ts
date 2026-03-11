import type { TeamMemberDto } from '@agora-ts/contracts';

export type TeamMemberLike = Pick<TeamMemberDto, 'role' | 'member_kind'>;

export function resolveTeamMemberKind(member: TeamMemberLike): NonNullable<TeamMemberDto['member_kind']> {
  if (member.member_kind) {
    return member.member_kind;
  }
  return member.role === 'craftsman' ? 'craftsman' : 'citizen';
}

export function isInteractiveParticipant(member: TeamMemberLike): boolean {
  return resolveTeamMemberKind(member) !== 'craftsman';
}
