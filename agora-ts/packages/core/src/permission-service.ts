import type { TeamDto } from '@agora-ts/contracts';

export interface AgentPermission {
  canCall: string[];
  canAdvance: boolean;
}

export interface PermissionServiceOptions {
  archonUsers?: string[];
  allowAgents?: Record<string, AgentPermission> | undefined;
}

export class PermissionService {
  private readonly archonUsers: Set<string>;
  private readonly allowAgents: Record<string, AgentPermission>;

  constructor(options: PermissionServiceOptions = {}) {
    this.archonUsers = new Set(options.archonUsers ?? ['archon', 'lizeyu']);
    this.allowAgents = options.allowAgents ?? {
      '*': { canCall: [], canAdvance: false },
    };
  }

  canAdvance(callerId: string, team: TeamDto): boolean {
    void team;
    if (this.isArchon(callerId)) {
      return true;
    }
    return this.getAgentPermissions(callerId).canAdvance;
  }

  canCall(callerId: string, targetId: string): boolean {
    return this.getAgentPermissions(callerId).canCall.includes(targetId);
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

  private getAgentPermissions(agentId: string): AgentPermission {
    return this.allowAgents[agentId] ?? this.allowAgents['*'] ?? { canCall: [], canAdvance: false };
  }
}
