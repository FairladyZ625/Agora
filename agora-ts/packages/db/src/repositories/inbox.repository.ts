import type { IInboxRepository } from '@agora-ts/contracts';
import type { AgoraDatabase } from '../database.js';
import { parseJsonValue, stringifyJsonValue } from './json.js';

export interface StoredInboxItem {
  id: number;
  text: string;
  status: string;
  source: string | null;
  notes: string | null;
  tags: string[];
  created_at: string;
  promoted_to_type: string | null;
  promoted_to_id: string | null;
  metadata: Record<string, unknown> | null;
}

type SqlValue = string | number | bigint | Uint8Array | null;

export class InboxRepository implements IInboxRepository {
  constructor(private readonly db: AgoraDatabase) {}

  insertInboxItem(input: {
    text: string;
    source?: string;
    notes?: string;
    tags?: string[];
    metadata?: Record<string, unknown> | null;
  }): StoredInboxItem {
    const info = this.db.prepare(`
      INSERT INTO inbox_items (text, status, source, notes, tags, metadata)
      VALUES (?, 'open', ?, ?, ?, ?)
    `).run(
      input.text,
      input.source ?? null,
      input.notes ?? null,
      stringifyJsonValue(input.tags ?? []),
      stringifyJsonValue(input.metadata ?? null),
    );
    return this.getInboxItem(Number(info.lastInsertRowid))!;
  }

  getInboxItem(inboxId: number): StoredInboxItem | null {
    const row = this.db.prepare('SELECT * FROM inbox_items WHERE id = ?').get(inboxId) as Record<string, unknown> | undefined;
    return row ? this.parseInboxRow(row) : null;
  }

  listInboxItems(status?: string): StoredInboxItem[] {
    const rows = status
      ? (this.db.prepare('SELECT * FROM inbox_items WHERE status = ? ORDER BY created_at DESC, id DESC').all(status) as Record<string, unknown>[])
      : (this.db.prepare('SELECT * FROM inbox_items ORDER BY created_at DESC, id DESC').all() as Record<string, unknown>[]);
    return rows.map((row) => this.parseInboxRow(row));
  }

  updateInboxItem(
    inboxId: number,
    updates: Partial<Omit<StoredInboxItem, 'id' | 'created_at'>>,
  ): StoredInboxItem {
    const assignments: string[] = [];
    const values: SqlValue[] = [];

    for (const [key, value] of Object.entries(updates)) {
      assignments.push(`${key} = ?`);
      if (key === 'tags' || key === 'metadata') {
        values.push(stringifyJsonValue(value ?? null));
      } else if (value === undefined) {
        values.push(null);
      } else {
        values.push(value as SqlValue);
      }
    }

    if (assignments.length === 0) {
      return this.getInboxItem(inboxId)!;
    }

    this.db.prepare(`UPDATE inbox_items SET ${assignments.join(', ')} WHERE id = ?`).run(...values, inboxId);
    return this.getInboxItem(inboxId)!;
  }

  deleteInboxItem(inboxId: number): boolean {
    const result = this.db.prepare('DELETE FROM inbox_items WHERE id = ?').run(inboxId);
    return Number(result.changes) > 0;
  }

  private parseInboxRow(row: Record<string, unknown>): StoredInboxItem {
    return {
      id: Number(row.id),
      text: String(row.text),
      status: String(row.status),
      source: row.source === null ? null : String(row.source),
      notes: row.notes === null ? null : String(row.notes),
      tags: parseJsonValue(row.tags, []),
      created_at: String(row.created_at),
      promoted_to_type: row.promoted_to_type === null ? null : String(row.promoted_to_type),
      promoted_to_id: row.promoted_to_id === null ? null : String(row.promoted_to_id),
      metadata: parseJsonValue(row.metadata, null),
    };
  }
}
