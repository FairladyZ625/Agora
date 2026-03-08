import type { TeamDto } from '@agora-ts/contracts';

export interface PermissionServiceOptions {
  archonUsers?: string[];
}

export class PermissionService {
  private readonly archonUsers: Set<string>;

  constructor(options: PermissionServiceOptions = {}) {
    this.archonUsers = new Set(options.archonUsers ?? ['archon', 'lizeyu']);
  }

  canAdvance(callerId: string, team: TeamDto): boolean {
    return this.isArchon(callerId) || this.isMember(callerId, team);
  }

  verifySubtaskDone(callerId: string, assigneeId: string): boolean {
    return this.isArchon(callerId) || callerId === assigneeId;
  }

  hasRole(agentId: string, team: TeamDto, role: string): boolean {
    return this.isArchon(agentId) || team.members.some((member) => member.agentId === agentId && member.role === role);
  }

  isArchon(userId: string): boolean {
    return this.archonUsers.has(userId);
  }

  isMember(agentId: string, team: TeamDto): boolean {
    return team.members.some((member) => member.agentId === agentId);
  }
}
