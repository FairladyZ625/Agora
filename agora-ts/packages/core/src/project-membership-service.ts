import {
  HumanAccountRepository,
  ProjectMembershipRepository,
  type AgoraDatabase,
  type StoredProjectMembership,
} from '@agora-ts/db';
import type { CreateProjectAdminDto, CreateProjectMembershipDto } from '@agora-ts/contracts';

export class ProjectMembershipService {
  private readonly memberships: ProjectMembershipRepository;
  private readonly accounts: HumanAccountRepository;

  constructor(db: AgoraDatabase) {
    this.memberships = new ProjectMembershipRepository(db);
    this.accounts = new HumanAccountRepository(db);
  }

  seedProjectMemberships(input: {
    projectId: string;
    admins: CreateProjectAdminDto[];
    members?: CreateProjectMembershipDto[];
  }): StoredProjectMembership[] {
    const records = new Map<number, StoredProjectMembership>();

    for (const admin of input.admins) {
      records.set(admin.account_id, this.memberships.upsertMembership({
        id: `pm-${input.projectId}-${admin.account_id}`,
        project_id: input.projectId,
        account_id: admin.account_id,
        role: 'admin',
        status: 'active',
        added_by_account_id: admin.account_id,
      }));
    }

    for (const member of input.members ?? []) {
      if (records.has(member.account_id)) {
        continue;
      }
      records.set(member.account_id, this.memberships.upsertMembership({
        id: `pm-${input.projectId}-${member.account_id}`,
        project_id: input.projectId,
        account_id: member.account_id,
        role: member.role,
        status: 'active',
        added_by_account_id: input.admins[0]?.account_id ?? null,
      }));
    }

    return [...records.values()];
  }

  hasConfiguredMemberships(projectId: string): boolean {
    return this.memberships.listByProject(projectId).length > 0;
  }

  listProjectMemberships(projectId: string): StoredProjectMembership[] {
    return this.memberships.listByProject(projectId);
  }

  addProjectMembership(input: {
    projectId: string;
    account_id: number;
    role: 'admin' | 'member';
    added_by_account_id?: number | null;
  }): StoredProjectMembership {
    return this.memberships.upsertMembership({
      id: `pm-${input.projectId}-${input.account_id}`,
      project_id: input.projectId,
      account_id: input.account_id,
      role: input.role,
      status: 'active',
      added_by_account_id: input.added_by_account_id ?? null,
    });
  }

  removeProjectMembership(projectId: string, accountId: number): StoredProjectMembership {
    const membership = this.memberships.getByProjectAccount(projectId, accountId);
    if (!membership) {
      throw new Error(`project membership not found: ${projectId}/${accountId}`);
    }
    return this.memberships.updateMembership(membership.id, { status: 'removed' });
  }

  requireActiveCreatorMembership(projectId: string, username: string): StoredProjectMembership {
    const account = this.accounts.getByUsername(username);
    if (!account) {
      throw new Error(`creator must be an active project member: missing human account for ${username}`);
    }
    const membership = this.memberships.getByProjectAccount(projectId, account.id);
    if (!membership || membership.status !== 'active') {
      throw new Error(`creator must be an active project member: ${username}`);
    }
    return membership;
  }

  requireActiveMemberAccounts(projectId: string, accountIds: Array<number | null | undefined>): void {
    for (const accountId of accountIds) {
      if (accountId === null || accountId === undefined) {
        continue;
      }
      const membership = this.memberships.getByProjectAccount(projectId, accountId);
      if (!membership || membership.status !== 'active') {
        throw new Error(`task authority account ${accountId} is not an active project member`);
      }
    }
  }
}
