import type { ITaskAuthorityRepository, TaskAuthorityRecord } from '@agora-ts/contracts';

export interface CreateTaskAuthorityInput {
  task_id: string;
  requester_account_id?: number | null;
  owner_account_id?: number | null;
  assignee_account_id?: number | null;
  approver_account_id?: number | null;
  controller_agent_ref?: string | null;
}

export interface TaskAuthorityServiceOptions {
  repository: ITaskAuthorityRepository;
}

export class TaskAuthorityService {
  private readonly authorities: ITaskAuthorityRepository;

  constructor(options: TaskAuthorityServiceOptions) {
    this.authorities = options.repository;
  }

  createOrUpdate(input: CreateTaskAuthorityInput): TaskAuthorityRecord {
    return this.authorities.upsertTaskAuthority(input);
  }

  getTaskAuthority(taskId: string): TaskAuthorityRecord | null {
    return this.authorities.getTaskAuthority(taskId);
  }
}
