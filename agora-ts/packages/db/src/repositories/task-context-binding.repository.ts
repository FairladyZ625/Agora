import type { AgoraDatabase } from '../database.js';

export interface StoredTaskContextBinding {
  id: string;
  task_id: string;
  im_provider: string;
  conversation_ref: string | null;
  thread_ref: string | null;
  message_root_ref: string | null;
  status: string;
  created_at: string;
  closed_at: string | null;
}

export class TaskContextBindingRepository {
  constructor(private readonly db: AgoraDatabase) {}

  insert(input: {
    id: string;
    task_id: string;
    im_provider: string;
    conversation_ref?: string | null;
    thread_ref?: string | null;
    message_root_ref?: string | null;
    status?: string;
    created_at?: string;
  }): StoredTaskContextBinding {
    const now = input.created_at ?? new Date().toISOString();
    this.db.prepare(`
      INSERT INTO task_context_bindings (id, task_id, im_provider, conversation_ref, thread_ref, message_root_ref, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.id,
      input.task_id,
      input.im_provider,
      input.conversation_ref ?? null,
      input.thread_ref ?? null,
      input.message_root_ref ?? null,
      input.status ?? 'active',
      now,
    );
    return this.getById(input.id)!;
  }

  getById(id: string): StoredTaskContextBinding | null {
    const row = this.db.prepare(
      'SELECT * FROM task_context_bindings WHERE id = ?',
    ).get(id) as Record<string, unknown> | undefined;
    return row ? this.parseRow(row) : null;
  }

  getActiveByTask(taskId: string): StoredTaskContextBinding | null {
    const row = this.db.prepare(
      'SELECT * FROM task_context_bindings WHERE task_id = ? AND status = ? ORDER BY created_at DESC LIMIT 1',
    ).get(taskId, 'active') as Record<string, unknown> | undefined;
    return row ? this.parseRow(row) : null;
  }

  listByTask(taskId: string): StoredTaskContextBinding[] {
    const rows = this.db.prepare(
      'SELECT * FROM task_context_bindings WHERE task_id = ? ORDER BY created_at DESC',
    ).all(taskId) as Record<string, unknown>[];
    return rows.map((row) => this.parseRow(row));
  }

  listByTaskBindingsForRefs(input: {
    thread_ref?: string | null;
    conversation_ref?: string | null;
  }): StoredTaskContextBinding[] {
    const clauses: string[] = [];
    const params: Array<string> = [];
    if (input.thread_ref) {
      clauses.push('thread_ref = ?');
      params.push(input.thread_ref);
    }
    if (input.conversation_ref) {
      clauses.push('conversation_ref = ?');
      params.push(input.conversation_ref);
    }
    if (clauses.length === 0) {
      return [];
    }
    const rows = this.db.prepare(`
      SELECT *
      FROM task_context_bindings
      WHERE status = 'active' AND (${clauses.join(' OR ')})
      ORDER BY created_at DESC
    `).all(...params) as Record<string, unknown>[];
    return rows.map((row) => this.parseRow(row));
  }

  updateStatus(id: string, status: string, closedAt?: string): void {
    const closeValue = status === 'archived' || status === 'destroyed' || status === 'failed'
      ? (closedAt ?? new Date().toISOString())
      : null;
    this.db.prepare(
      'UPDATE task_context_bindings SET status = ?, closed_at = ? WHERE id = ?',
    ).run(status, closeValue, id);
  }

  private parseRow(row: Record<string, unknown>): StoredTaskContextBinding {
    return {
      id: String(row.id),
      task_id: String(row.task_id),
      im_provider: String(row.im_provider),
      conversation_ref: row.conversation_ref === null ? null : String(row.conversation_ref),
      thread_ref: row.thread_ref === null ? null : String(row.thread_ref),
      message_root_ref: row.message_root_ref === null ? null : String(row.message_root_ref),
      status: String(row.status),
      created_at: String(row.created_at),
      closed_at: row.closed_at === null ? null : String(row.closed_at),
    };
  }
}
