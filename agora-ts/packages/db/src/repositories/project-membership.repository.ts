import type { AgoraDatabase } from '../database.js';

export interface StoredProjectMembership {
  id: string;
  project_id: string;
  account_id: number;
  role: string;
  status: string;
  added_by_account_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertProjectMembershipInput {
  id: string;
  project_id: string;
  account_id: number;
  role: string;
  status?: string;
  added_by_account_id?: number | null;
}

export interface UpdateProjectMembershipInput {
  role?: string;
  status?: string;
  added_by_account_id?: number | null;
}

export class ProjectMembershipRepository {
  constructor(private readonly db: AgoraDatabase) {}

  upsertMembership(input: UpsertProjectMembershipInput): StoredProjectMembership {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO project_memberships (
        id, project_id, account_id, role, status, added_by_account_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id, account_id) DO UPDATE SET
        role = excluded.role,
        status = excluded.status,
        added_by_account_id = excluded.added_by_account_id,
        updated_at = excluded.updated_at
    `).run(
      input.id,
      input.project_id,
      input.account_id,
      input.role,
      input.status ?? 'active',
      input.added_by_account_id ?? null,
      now,
      now,
    );

    return this.requireByProjectAccount(input.project_id, input.account_id);
  }

  getMembership(id: string): StoredProjectMembership | null {
    const row = this.db.prepare(
      'SELECT * FROM project_memberships WHERE id = ?',
    ).get(id) as Record<string, unknown> | undefined;
    return row ? this.parseRow(row) : null;
  }

  getByProjectAccount(projectId: string, accountId: number): StoredProjectMembership | null {
    const row = this.db.prepare(
      'SELECT * FROM project_memberships WHERE project_id = ? AND account_id = ?',
    ).get(projectId, accountId) as Record<string, unknown> | undefined;
    return row ? this.parseRow(row) : null;
  }

  listByProject(projectId: string, status?: string): StoredProjectMembership[] {
    const rows = status
      ? this.db.prepare(
        'SELECT * FROM project_memberships WHERE project_id = ? AND status = ? ORDER BY created_at ASC',
      ).all(projectId, status) as Record<string, unknown>[]
      : this.db.prepare(
        'SELECT * FROM project_memberships WHERE project_id = ? ORDER BY created_at ASC',
      ).all(projectId) as Record<string, unknown>[];
    return rows.map((row) => this.parseRow(row));
  }

  updateMembership(id: string, updates: UpdateProjectMembershipInput): StoredProjectMembership {
    const assignments: string[] = [];
    const values: Array<string | number | null> = [];

    if (updates.role !== undefined) {
      assignments.push('role = ?');
      values.push(updates.role);
    }
    if (updates.status !== undefined) {
      assignments.push('status = ?');
      values.push(updates.status);
    }
    if (updates.added_by_account_id !== undefined) {
      assignments.push('added_by_account_id = ?');
      values.push(updates.added_by_account_id);
    }

    assignments.push('updated_at = ?');
    values.push(new Date().toISOString(), id);

    const result = this.db.prepare(`
      UPDATE project_memberships
      SET ${assignments.join(', ')}
      WHERE id = ?
    `).run(...values);

    if (result.changes === 0) {
      throw new Error(`project membership ${id} not found`);
    }

    return this.getMembership(id)!;
  }

  private requireByProjectAccount(projectId: string, accountId: number): StoredProjectMembership {
    const record = this.getByProjectAccount(projectId, accountId);
    if (!record) {
      throw new Error(`Failed to retrieve project membership ${projectId}/${accountId} after upsert`);
    }
    return record;
  }

  private parseRow(row: Record<string, unknown>): StoredProjectMembership {
    return {
      id: String(row.id),
      project_id: String(row.project_id),
      account_id: Number(row.account_id),
      role: String(row.role),
      status: String(row.status),
      added_by_account_id: row.added_by_account_id === null ? null : Number(row.added_by_account_id),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    };
  }
}
