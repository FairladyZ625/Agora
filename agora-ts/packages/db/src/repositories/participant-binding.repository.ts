import type { AgoraDatabase } from '../database.js';

export interface StoredParticipantBinding {
  id: string;
  task_id: string;
  binding_id: string | null;
  agent_ref: string;
  runtime_provider: string | null;
  task_role: string;
  source: string;
  join_status: string;
  created_at: string;
  joined_at: string | null;
  left_at: string | null;
}

export class ParticipantBindingRepository {
  constructor(private readonly db: AgoraDatabase) {}

  insert(input: {
    id: string;
    task_id: string;
    binding_id?: string | null;
    agent_ref: string;
    runtime_provider?: string | null;
    task_role: string;
    source?: string;
    join_status?: string;
    created_at?: string;
    joined_at?: string | null;
    left_at?: string | null;
  }): StoredParticipantBinding {
    const createdAt = input.created_at ?? new Date().toISOString();
    this.db.prepare(`
      INSERT INTO participant_bindings (
        id, task_id, binding_id, agent_ref, runtime_provider, task_role, source, join_status, created_at, joined_at, left_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.id,
      input.task_id,
      input.binding_id ?? null,
      input.agent_ref,
      input.runtime_provider ?? null,
      input.task_role,
      input.source ?? 'template',
      input.join_status ?? 'pending',
      createdAt,
      input.joined_at ?? null,
      input.left_at ?? null,
    );
    return this.getById(input.id)!;
  }

  getById(id: string): StoredParticipantBinding | null {
    const row = this.db.prepare('SELECT * FROM participant_bindings WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.parseRow(row) : null;
  }

  listByTask(taskId: string): StoredParticipantBinding[] {
    const rows = this.db.prepare(
      'SELECT * FROM participant_bindings WHERE task_id = ? ORDER BY created_at, id',
    ).all(taskId) as Record<string, unknown>[];
    return rows.map((row) => this.parseRow(row));
  }

  getByTaskAndAgent(taskId: string, agentRef: string): StoredParticipantBinding | null {
    const row = this.db.prepare(
      'SELECT * FROM participant_bindings WHERE task_id = ? AND agent_ref = ? ORDER BY created_at DESC LIMIT 1',
    ).get(taskId, agentRef) as Record<string, unknown> | undefined;
    return row ? this.parseRow(row) : null;
  }

  attachContextBinding(taskId: string, bindingId: string): void {
    this.db.prepare(
      'UPDATE participant_bindings SET binding_id = ? WHERE task_id = ?',
    ).run(bindingId, taskId);
  }

  updateJoinState(id: string, joinStatus: string, timestamps: { joined_at?: string | null; left_at?: string | null } = {}): void {
    const current = this.getById(id);
    if (!current) {
      return;
    }
    this.db.prepare(`
      UPDATE participant_bindings
      SET join_status = ?, joined_at = ?, left_at = ?
      WHERE id = ?
    `).run(
      joinStatus,
      timestamps.joined_at ?? current.joined_at,
      timestamps.left_at ?? current.left_at,
      id,
    );
  }

  private parseRow(row: Record<string, unknown>): StoredParticipantBinding {
    return {
      id: String(row.id),
      task_id: String(row.task_id),
      binding_id: row.binding_id === null ? null : String(row.binding_id),
      agent_ref: String(row.agent_ref),
      runtime_provider: row.runtime_provider === null ? null : String(row.runtime_provider),
      task_role: String(row.task_role),
      source: String(row.source),
      join_status: String(row.join_status),
      created_at: String(row.created_at),
      joined_at: row.joined_at === null ? null : String(row.joined_at),
      left_at: row.left_at === null ? null : String(row.left_at),
    };
  }
}

