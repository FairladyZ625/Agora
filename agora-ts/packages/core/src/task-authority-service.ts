import type { TaskAuthorityRecord } from '@agora-ts/contracts';
import { TaskAuthorityRepository, type AgoraDatabase } from '@agora-ts/db';

export interface CreateTaskAuthorityInput {
  task_id: string;
  requester_account_id?: number | null;
  owner_account_id?: number | null;
  assignee_account_id?: number | null;
  approver_account_id?: number | null;
  controller_agent_ref?: string | null;
}

export interface TaskAuthorityServiceOptions {
  repository?: TaskAuthorityRepository;
}

export class TaskAuthorityService {
  private readonly authorities: TaskAuthorityRepository;

  constructor(db: AgoraDatabase, options: TaskAuthorityServiceOptions = {}) {
    this.authorities = options.repository ?? new TaskAuthorityRepository(db);
  }

  createOrUpdate(input: CreateTaskAuthorityInput): TaskAuthorityRecord {
    return this.authorities.upsertTaskAuthority(input);
  }

  getTaskAuthority(taskId: string): TaskAuthorityRecord | null {
    return this.authorities.getTaskAuthority(taskId);
  }
}
