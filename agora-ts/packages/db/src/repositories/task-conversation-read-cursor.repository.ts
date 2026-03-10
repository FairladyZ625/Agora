import type { AgoraDatabase } from '../database.js';

export interface StoredTaskConversationReadCursor {
  task_id: string;
  account_id: number;
  last_read_entry_id: string | null;
  last_read_at: string;
  updated_at: string;
}

export class TaskConversationReadCursorRepository {
  constructor(private readonly db: AgoraDatabase) {}

  get(taskId: string, accountId: number): StoredTaskConversationReadCursor | null {
    const row = this.db.prepare(`
      SELECT *
      FROM task_conversation_read_cursors
      WHERE task_id = ? AND account_id = ?
    `).get(taskId, accountId) as Record<string, unknown> | undefined;
    return row ? this.parseRow(row) : null;
  }

  upsert(input: {
    task_id: string;
    account_id: number;
    last_read_entry_id?: string | null;
    last_read_at: string;
    updated_at: string;
  }): StoredTaskConversationReadCursor {
    this.db.prepare(`
      INSERT INTO task_conversation_read_cursors (
        task_id, account_id, last_read_entry_id, last_read_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(task_id, account_id) DO UPDATE SET
        last_read_entry_id = excluded.last_read_entry_id,
        last_read_at = excluded.last_read_at,
        updated_at = excluded.updated_at
    `).run(
      input.task_id,
      input.account_id,
      input.last_read_entry_id ?? null,
      input.last_read_at,
      input.updated_at,
    );
    return this.get(input.task_id, input.account_id)!;
  }

  private parseRow(row: Record<string, unknown>): StoredTaskConversationReadCursor {
    return {
      task_id: String(row.task_id),
      account_id: Number(row.account_id),
      last_read_entry_id: row.last_read_entry_id === null ? null : String(row.last_read_entry_id),
      last_read_at: String(row.last_read_at),
      updated_at: String(row.updated_at),
    };
  }
}
