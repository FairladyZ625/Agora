import type { IProgressLogRepository } from '@agora-ts/contracts';
import type { AgoraDatabase } from '../database.js';
import { stringifyJsonValue } from './json.js';

export interface StoredProgressLog {
  id: number;
  task_id: string;
  kind: string;
  stage_id: string | null;
  subtask_id: string | null;
  content: string;
  artifacts: string | null;
  actor: string;
  created_at: string;
}

export interface InsertProgressLogInput {
  task_id: string;
  kind: string;
  stage_id?: string | null;
  subtask_id?: string | null;
  content: string;
  artifacts?: unknown;
  actor: string;
}

export class ProgressLogRepository implements IProgressLogRepository {
  constructor(private readonly db: AgoraDatabase) {}

  insertProgressLog(input: InsertProgressLogInput): StoredProgressLog {
    const info = this.db.prepare(`
      INSERT INTO progress_log (task_id, kind, stage_id, subtask_id, content, artifacts, actor)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.task_id,
      input.kind,
      input.stage_id ?? null,
      input.subtask_id ?? null,
      input.content,
      input.artifacts === undefined ? null : stringifyJsonValue(input.artifacts),
      input.actor,
    );
    return this.getProgressLog(Number(info.lastInsertRowid))!;
  }

  listByTask(taskId: string): StoredProgressLog[] {
    const rows = this.db.prepare(`
      SELECT *
      FROM progress_log
      WHERE task_id = ?
      ORDER BY id ASC
    `).all(taskId) as Record<string, unknown>[];
    return rows.map((row) => this.parseRow(row));
  }

  listLatestActivityByTaskIds(taskIds: string[]): Array<{
    actor: string;
    last_active_at: string | null;
  }> {
    if (taskIds.length === 0) {
      return [];
    }
    const placeholders = taskIds.map(() => '?').join(', ');
    return this.db.prepare(`
      SELECT actor, MAX(created_at) AS last_active_at
      FROM progress_log
      WHERE task_id IN (${placeholders})
      GROUP BY actor
    `).all(...taskIds) as Array<{ actor: string; last_active_at: string | null }>;
  }

  private getProgressLog(id: number): StoredProgressLog | null {
    const row = this.db.prepare('SELECT * FROM progress_log WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.parseRow(row) : null;
  }

  private parseRow(row: Record<string, unknown>): StoredProgressLog {
    return {
      id: Number(row.id),
      task_id: String(row.task_id),
      kind: String(row.kind),
      stage_id: row.stage_id === null ? null : String(row.stage_id),
      subtask_id: row.subtask_id === null ? null : String(row.subtask_id),
      content: String(row.content),
      artifacts: row.artifacts === null ? null : String(row.artifacts),
      actor: String(row.actor),
      created_at: String(row.created_at),
    };
  }
}
