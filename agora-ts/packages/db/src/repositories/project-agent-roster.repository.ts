import type { AgoraDatabase } from '../database.js';

export interface StoredProjectAgentRosterEntry {
  id: string;
  project_id: string;
  agent_ref: string;
  kind: string;
  default_inclusion: boolean;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface UpsertProjectAgentRosterEntryInput {
  id: string;
  project_id: string;
  agent_ref: string;
  kind: string;
  default_inclusion?: boolean;
  status?: string;
}

export interface UpdateProjectAgentRosterEntryInput {
  kind?: string;
  default_inclusion?: boolean;
  status?: string;
}

export class ProjectAgentRosterRepository {
  constructor(private readonly db: AgoraDatabase) {}

  upsertEntry(input: UpsertProjectAgentRosterEntryInput): StoredProjectAgentRosterEntry {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO project_agent_rosters (
        id, project_id, agent_ref, kind, default_inclusion, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id, agent_ref) DO UPDATE SET
        kind = excluded.kind,
        default_inclusion = excluded.default_inclusion,
        status = excluded.status,
        updated_at = excluded.updated_at
    `).run(
      input.id,
      input.project_id,
      input.agent_ref,
      input.kind,
      input.default_inclusion === true ? 1 : 0,
      input.status ?? 'active',
      now,
      now,
    );

    return this.requireByProjectAgent(input.project_id, input.agent_ref);
  }

  getEntry(id: string): StoredProjectAgentRosterEntry | null {
    const row = this.db.prepare(
      'SELECT * FROM project_agent_rosters WHERE id = ?',
    ).get(id) as Record<string, unknown> | undefined;
    return row ? this.parseRow(row) : null;
  }

  getByProjectAgent(projectId: string, agentRef: string): StoredProjectAgentRosterEntry | null {
    const row = this.db.prepare(
      'SELECT * FROM project_agent_rosters WHERE project_id = ? AND agent_ref = ?',
    ).get(projectId, agentRef) as Record<string, unknown> | undefined;
    return row ? this.parseRow(row) : null;
  }

  listByProject(projectId: string, status?: string): StoredProjectAgentRosterEntry[] {
    const rows = status
      ? this.db.prepare(
        'SELECT * FROM project_agent_rosters WHERE project_id = ? AND status = ? ORDER BY created_at ASC',
      ).all(projectId, status) as Record<string, unknown>[]
      : this.db.prepare(
        'SELECT * FROM project_agent_rosters WHERE project_id = ? ORDER BY created_at ASC',
      ).all(projectId) as Record<string, unknown>[];
    return rows.map((row) => this.parseRow(row));
  }

  updateEntry(id: string, updates: UpdateProjectAgentRosterEntryInput): StoredProjectAgentRosterEntry {
    const assignments: string[] = [];
    const values: Array<string | number> = [];

    if (updates.kind !== undefined) {
      assignments.push('kind = ?');
      values.push(updates.kind);
    }
    if (updates.default_inclusion !== undefined) {
      assignments.push('default_inclusion = ?');
      values.push(updates.default_inclusion ? 1 : 0);
    }
    if (updates.status !== undefined) {
      assignments.push('status = ?');
      values.push(updates.status);
    }

    assignments.push('updated_at = ?');
    values.push(new Date().toISOString(), id);

    const result = this.db.prepare(`
      UPDATE project_agent_rosters
      SET ${assignments.join(', ')}
      WHERE id = ?
    `).run(...values);

    if (result.changes === 0) {
      throw new Error(`project agent roster entry ${id} not found`);
    }

    return this.getEntry(id)!;
  }

  private requireByProjectAgent(projectId: string, agentRef: string): StoredProjectAgentRosterEntry {
    const record = this.getByProjectAgent(projectId, agentRef);
    if (!record) {
      throw new Error(`Failed to retrieve project agent roster ${projectId}/${agentRef} after upsert`);
    }
    return record;
  }

  private parseRow(row: Record<string, unknown>): StoredProjectAgentRosterEntry {
    return {
      id: String(row.id),
      project_id: String(row.project_id),
      agent_ref: String(row.agent_ref),
      kind: String(row.kind),
      default_inclusion: Number(row.default_inclusion) === 1,
      status: String(row.status),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    };
  }
}
