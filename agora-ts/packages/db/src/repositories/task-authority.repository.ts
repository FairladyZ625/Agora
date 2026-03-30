import type { AgoraDatabase } from '../database.js';

export interface StoredTaskAuthority {
  task_id: string;
  requester_account_id: number | null;
  owner_account_id: number | null;
  assignee_account_id: number | null;
  approver_account_id: number | null;
  controller_agent_ref: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertTaskAuthorityInput {
  task_id: string;
  requester_account_id?: number | null;
  owner_account_id?: number | null;
  assignee_account_id?: number | null;
  approver_account_id?: number | null;
  controller_agent_ref?: string | null;
}

export class TaskAuthorityRepository {
  constructor(private readonly db: AgoraDatabase) {}

  upsertTaskAuthority(input: UpsertTaskAuthorityInput): StoredTaskAuthority {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO task_authorities (
        task_id, requester_account_id, owner_account_id, assignee_account_id, approver_account_id, controller_agent_ref, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(task_id) DO UPDATE SET
        requester_account_id = excluded.requester_account_id,
        owner_account_id = excluded.owner_account_id,
        assignee_account_id = excluded.assignee_account_id,
        approver_account_id = excluded.approver_account_id,
        controller_agent_ref = excluded.controller_agent_ref,
        updated_at = excluded.updated_at
    `).run(
      input.task_id,
      input.requester_account_id ?? null,
      input.owner_account_id ?? null,
      input.assignee_account_id ?? null,
      input.approver_account_id ?? null,
      input.controller_agent_ref ?? null,
      now,
      now,
    );

    return this.getTaskAuthority(input.task_id)!;
  }

  getTaskAuthority(taskId: string): StoredTaskAuthority | null {
    const row = this.db.prepare(
      'SELECT * FROM task_authorities WHERE task_id = ?',
    ).get(taskId) as Record<string, unknown> | undefined;
    return row ? this.parseRow(row) : null;
  }

  private parseRow(row: Record<string, unknown>): StoredTaskAuthority {
    return {
      task_id: String(row.task_id),
      requester_account_id: row.requester_account_id === null ? null : Number(row.requester_account_id),
      owner_account_id: row.owner_account_id === null ? null : Number(row.owner_account_id),
      assignee_account_id: row.assignee_account_id === null ? null : Number(row.assignee_account_id),
      approver_account_id: row.approver_account_id === null ? null : Number(row.approver_account_id),
      controller_agent_ref: row.controller_agent_ref === null ? null : String(row.controller_agent_ref),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    };
  }
}
