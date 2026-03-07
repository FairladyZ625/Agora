import type { AgoraDatabase } from '../database.js';
import { parseJsonValue, stringifyJsonValue } from './json.js';

export interface StoredTodo {
  id: number;
  text: string;
  status: string;
  due: string | null;
  created_at: string;
  completed_at: string | null;
  tags: string[];
  promoted_to: string | null;
}

type SqlValue = string | number | bigint | Uint8Array | null;

export class TodoRepository {
  constructor(private readonly db: AgoraDatabase) {}

  insertTodo(input: { text: string; due?: string | null; tags?: string[] }): StoredTodo {
    const info = this.db.prepare(`
      INSERT INTO todos (text, status, due, tags)
      VALUES (?, 'pending', ?, ?)
    `).run(input.text, input.due ?? null, stringifyJsonValue(input.tags ?? []));
    return this.getTodo(Number(info.lastInsertRowid))!;
  }

  getTodo(todoId: number): StoredTodo | null {
    const row = this.db.prepare('SELECT * FROM todos WHERE id = ?').get(todoId) as Record<string, unknown> | undefined;
    return row ? this.parseTodoRow(row) : null;
  }

  listTodos(status?: string): StoredTodo[] {
    const rows = status
      ? (this.db.prepare('SELECT * FROM todos WHERE status = ? ORDER BY created_at DESC, id DESC').all(status) as Record<string, unknown>[])
      : (this.db.prepare('SELECT * FROM todos ORDER BY created_at DESC, id DESC').all() as Record<string, unknown>[]);
    return rows.map((row) => this.parseTodoRow(row));
  }

  updateTodo(todoId: number, updates: Partial<Omit<StoredTodo, 'id' | 'created_at'>>): StoredTodo {
    const assignments: string[] = [];
    const values: SqlValue[] = [];

    for (const [key, value] of Object.entries(updates)) {
      assignments.push(`${key} = ?`);
      if (key === 'tags') {
        values.push(stringifyJsonValue(value ?? []));
      } else if (value === undefined) {
        values.push(null);
      } else {
        values.push(value as SqlValue);
      }
    }

    this.db.prepare(`UPDATE todos SET ${assignments.join(', ')} WHERE id = ?`).run(...values, todoId);
    return this.getTodo(todoId)!;
  }

  deleteTodo(todoId: number): boolean {
    const result = this.db.prepare('DELETE FROM todos WHERE id = ?').run(todoId);
    return Number(result.changes) > 0;
  }

  private parseTodoRow(row: Record<string, unknown>): StoredTodo {
    return {
      id: Number(row.id),
      text: String(row.text),
      status: String(row.status),
      due: row.due === null ? null : String(row.due),
      created_at: String(row.created_at),
      completed_at: row.completed_at === null ? null : String(row.completed_at),
      tags: parseJsonValue(row.tags, []),
      promoted_to: row.promoted_to === null ? null : String(row.promoted_to),
    };
  }
}
