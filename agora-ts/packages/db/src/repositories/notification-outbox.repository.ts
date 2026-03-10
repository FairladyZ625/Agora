import type { AgoraDatabase } from '../database.js';
import { parseJsonValue, stringifyJsonValue } from './json.js';

export interface StoredNotificationOutbox {
  id: string;
  task_id: string;
  event_type: string;
  target_binding_id: string | null;
  payload: Record<string, unknown>;
  status: string;
  sequence_no: number;
  retry_count: number;
  max_retries: number;
  next_retry_at: string | null;
  last_error: string | null;
  created_at: string;
  delivered_at: string | null;
}

export class NotificationOutboxRepository {
  constructor(private readonly db: AgoraDatabase) {}

  insert(input: {
    id: string;
    task_id: string;
    event_type: string;
    target_binding_id?: string | null;
    payload: Record<string, unknown>;
    sequence_no: number;
    max_retries?: number;
    created_at?: string;
  }): StoredNotificationOutbox {
    const now = input.created_at ?? new Date().toISOString();
    this.db.prepare(`
      INSERT INTO notification_outbox (id, task_id, event_type, target_binding_id, payload, sequence_no, max_retries, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.id,
      input.task_id,
      input.event_type,
      input.target_binding_id ?? null,
      stringifyJsonValue(input.payload),
      input.sequence_no,
      input.max_retries ?? 5,
      now,
    );
    return this.getById(input.id)!;
  }

  getById(id: string): StoredNotificationOutbox | null {
    const row = this.db.prepare(
      'SELECT * FROM notification_outbox WHERE id = ?',
    ).get(id) as Record<string, unknown> | undefined;
    return row ? this.parseRow(row) : null;
  }

  listByTask(taskId: string): StoredNotificationOutbox[] {
    const rows = this.db.prepare(
      'SELECT * FROM notification_outbox WHERE task_id = ? ORDER BY created_at DESC',
    ).all(taskId) as Record<string, unknown>[];
    return rows.map((row) => this.parseRow(row));
  }

  listPending(limit: number = 50): StoredNotificationOutbox[] {
    const now = new Date().toISOString();
    const rows = this.db.prepare(`
      SELECT * FROM notification_outbox
      WHERE status = 'pending' AND (next_retry_at IS NULL OR next_retry_at <= ?)
      ORDER BY sequence_no ASC
      LIMIT ?
    `).all(now, limit) as Record<string, unknown>[];
    return rows.map((row) => this.parseRow(row));
  }

  markDelivered(id: string): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE notification_outbox SET status = 'delivered', delivered_at = ? WHERE id = ?
    `).run(now, id);
  }

  markFailed(id: string, error: string): void {
    this.db.prepare(`
      UPDATE notification_outbox
      SET retry_count = retry_count + 1,
          last_error = ?,
          status = CASE WHEN retry_count + 1 >= max_retries THEN 'failed' ELSE 'pending' END,
          next_retry_at = CASE WHEN retry_count + 1 >= max_retries THEN NULL
            ELSE datetime('now', '+' || ((retry_count + 1) * 10) || ' seconds') END
      WHERE id = ?
    `).run(error, id);
  }

  private parseRow(row: Record<string, unknown>): StoredNotificationOutbox {
    return {
      id: String(row.id),
      task_id: String(row.task_id),
      event_type: String(row.event_type),
      target_binding_id: row.target_binding_id === null ? null : String(row.target_binding_id),
      payload: parseJsonValue(row.payload, {}),
      status: String(row.status),
      sequence_no: Number(row.sequence_no),
      retry_count: Number(row.retry_count),
      max_retries: Number(row.max_retries),
      next_retry_at: row.next_retry_at === null ? null : String(row.next_retry_at),
      last_error: row.last_error === null ? null : String(row.last_error),
      created_at: String(row.created_at),
      delivered_at: row.delivered_at === null ? null : String(row.delivered_at),
    };
  }
}
