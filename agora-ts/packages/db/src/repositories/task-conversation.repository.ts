import type {
  TaskConversationAuthorKind,
  TaskConversationBodyFormat,
  TaskConversationDirection,
} from '@agora-ts/contracts';
import type { AgoraDatabase } from '../database.js';
import { parseJsonValue, stringifyJsonValue } from './json.js';

export interface StoredTaskConversationEntry {
  id: string;
  task_id: string;
  binding_id: string;
  provider: string;
  provider_message_ref: string | null;
  parent_message_ref: string | null;
  direction: TaskConversationDirection;
  author_kind: TaskConversationAuthorKind;
  author_ref: string | null;
  display_name: string | null;
  body: string;
  body_format: TaskConversationBodyFormat;
  occurred_at: string;
  ingested_at: string;
  dedupe_key: string | null;
  metadata: Record<string, unknown> | null;
}

export class TaskConversationRepository {
  constructor(private readonly db: AgoraDatabase) {}

  insert(input: {
    id: string;
    task_id: string;
    binding_id: string;
    provider: string;
    provider_message_ref?: string | null;
    parent_message_ref?: string | null;
    direction: TaskConversationDirection;
    author_kind: TaskConversationAuthorKind;
    author_ref?: string | null;
    display_name?: string | null;
    body: string;
    body_format?: TaskConversationBodyFormat;
    occurred_at: string;
    ingested_at?: string;
    dedupe_key?: string | null;
    metadata?: Record<string, unknown> | null;
  }): StoredTaskConversationEntry {
    if (input.dedupe_key) {
      const existing = this.getByDedupeKey(input.dedupe_key);
      if (existing) {
        return existing;
      }
    }

    const ingestedAt = input.ingested_at ?? new Date().toISOString();
    this.db.prepare(`
      INSERT INTO task_conversation_entries (
        id, task_id, binding_id, provider, provider_message_ref, parent_message_ref,
        direction, author_kind, author_ref, display_name, body, body_format,
        occurred_at, ingested_at, dedupe_key, metadata
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.id,
      input.task_id,
      input.binding_id,
      input.provider,
      input.provider_message_ref ?? null,
      input.parent_message_ref ?? null,
      input.direction,
      input.author_kind,
      input.author_ref ?? null,
      input.display_name ?? null,
      input.body,
      input.body_format ?? 'plain_text',
      input.occurred_at,
      ingestedAt,
      input.dedupe_key ?? null,
      input.metadata ? stringifyJsonValue(input.metadata) : null,
    );
    return this.getById(input.id)!;
  }

  getById(id: string): StoredTaskConversationEntry | null {
    const row = this.db.prepare(
      'SELECT * FROM task_conversation_entries WHERE id = ?',
    ).get(id) as Record<string, unknown> | undefined;
    return row ? this.parseRow(row) : null;
  }

  getByDedupeKey(dedupeKey: string): StoredTaskConversationEntry | null {
    const row = this.db.prepare(
      'SELECT * FROM task_conversation_entries WHERE dedupe_key = ?',
    ).get(dedupeKey) as Record<string, unknown> | undefined;
    return row ? this.parseRow(row) : null;
  }

  countByTask(taskId: string): number {
    const row = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM task_conversation_entries
      WHERE task_id = ?
    `).get(taskId) as { count?: number } | undefined;
    return row?.count ?? 0;
  }

  countUnreadByTask(taskId: string, afterIngestedAt?: string | null): number {
    if (!afterIngestedAt) {
      return this.countByTask(taskId);
    }
    const row = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM task_conversation_entries
      WHERE task_id = ? AND ingested_at > ?
    `).get(taskId, afterIngestedAt) as { count?: number } | undefined;
    return row?.count ?? 0;
  }

  listByTask(taskId: string, limit = 100): StoredTaskConversationEntry[] {
    const rows = this.db.prepare(`
      SELECT *
      FROM task_conversation_entries
      WHERE task_id = ?
      ORDER BY occurred_at ASC, ingested_at ASC, id ASC
      LIMIT ?
    `).all(taskId, limit) as Record<string, unknown>[];
    return rows.map((row) => this.parseRow(row));
  }

  getLatestByTask(taskId: string): StoredTaskConversationEntry | null {
    const row = this.db.prepare(`
      SELECT *
      FROM task_conversation_entries
      WHERE task_id = ?
      ORDER BY occurred_at DESC, ingested_at DESC, id DESC
      LIMIT 1
    `).get(taskId) as Record<string, unknown> | undefined;
    return row ? this.parseRow(row) : null;
  }

  private parseRow(row: Record<string, unknown>): StoredTaskConversationEntry {
    return {
      id: String(row.id),
      task_id: String(row.task_id),
      binding_id: String(row.binding_id),
      provider: String(row.provider),
      provider_message_ref: row.provider_message_ref === null ? null : String(row.provider_message_ref),
      parent_message_ref: row.parent_message_ref === null ? null : String(row.parent_message_ref),
      direction: String(row.direction) as TaskConversationDirection,
      author_kind: String(row.author_kind) as TaskConversationAuthorKind,
      author_ref: row.author_ref === null ? null : String(row.author_ref),
      display_name: row.display_name === null ? null : String(row.display_name),
      body: String(row.body),
      body_format: String(row.body_format) as TaskConversationBodyFormat,
      occurred_at: String(row.occurred_at),
      ingested_at: String(row.ingested_at),
      dedupe_key: row.dedupe_key === null ? null : String(row.dedupe_key),
      metadata: row.metadata === null ? null : parseJsonValue(row.metadata, {}),
    };
  }
}
