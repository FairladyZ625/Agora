import type { ITaskBrainBindingRepository } from '@agora-ts/contracts';
import type { AgoraDatabase } from '../database.js';
import { parseJsonValue, stringifyJsonValue } from './json.js';

export interface StoredTaskBrainBinding {
  id: string;
  task_id: string;
  brain_pack_ref: string;
  brain_task_id: string;
  workspace_path: string;
  metadata: Record<string, unknown> | null;
  status: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

export class TaskBrainBindingRepository implements ITaskBrainBindingRepository {
  constructor(private readonly db: AgoraDatabase) {}

  insert(input: {
    id: string;
    task_id: string;
    brain_pack_ref: string;
    brain_task_id: string;
    workspace_path: string;
    metadata?: Record<string, unknown> | null;
    status?: string;
    created_at?: string;
    updated_at?: string;
  }): StoredTaskBrainBinding {
    const now = input.created_at ?? new Date().toISOString();
    this.db.prepare(`
      INSERT INTO task_brain_bindings (id, task_id, brain_pack_ref, brain_task_id, workspace_path, metadata, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.id,
      input.task_id,
      input.brain_pack_ref,
      input.brain_task_id,
      input.workspace_path,
      stringifyJsonValue(input.metadata ?? null),
      input.status ?? 'active',
      now,
      input.updated_at ?? now,
    );
    return this.requireById(input.id);
  }

  getById(id: string): StoredTaskBrainBinding | null {
    const row = this.db.prepare(
      'SELECT * FROM task_brain_bindings WHERE id = ?',
    ).get(id) as Record<string, unknown> | undefined;
    return row ? this.parseRow(row) : null;
  }

  getActiveByTask(taskId: string): StoredTaskBrainBinding | null {
    const row = this.db.prepare(
      'SELECT * FROM task_brain_bindings WHERE task_id = ? AND status = ? ORDER BY created_at DESC LIMIT 1',
    ).get(taskId, 'active') as Record<string, unknown> | undefined;
    return row ? this.parseRow(row) : null;
  }

  listByTask(taskId: string): StoredTaskBrainBinding[] {
    const rows = this.db.prepare(
      'SELECT * FROM task_brain_bindings WHERE task_id = ? ORDER BY created_at DESC',
    ).all(taskId) as Record<string, unknown>[];
    return rows.map((row) => this.parseRow(row));
  }

  updateStatus(id: string, status: string, closedAt?: string): void {
    const now = new Date().toISOString();
    const closeValue = status === 'archived' || status === 'destroyed' || status === 'failed'
      ? (closedAt ?? now)
      : null;
    this.db.prepare(
      'UPDATE task_brain_bindings SET status = ?, updated_at = ?, closed_at = ? WHERE id = ?',
    ).run(status, now, closeValue, id);
  }

  private parseRow(row: Record<string, unknown>): StoredTaskBrainBinding {
    return {
      id: String(row.id),
      task_id: String(row.task_id),
      brain_pack_ref: String(row.brain_pack_ref),
      brain_task_id: String(row.brain_task_id),
      workspace_path: String(row.workspace_path),
      metadata: parseJsonValue(row.metadata, null),
      status: String(row.status),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      closed_at: row.closed_at === null ? null : String(row.closed_at),
    };
  }

  private requireById(id: string): StoredTaskBrainBinding {
    const record = this.getById(id);
    if (!record) {
      throw new Error(`Failed to retrieve task brain binding ${id} after insert`);
    }
    return record;
  }
}
