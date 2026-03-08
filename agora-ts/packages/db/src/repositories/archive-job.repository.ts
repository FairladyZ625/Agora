import type { AgoraDatabase } from '../database.js';
import { parseJsonValue, stringifyJsonValue } from './json.js';

export interface StoredArchiveJob {
  id: number;
  task_id: string;
  task_title: string;
  task_type: string;
  status: string;
  target_path: string;
  writer_agent: string;
  commit_hash: string | null;
  requested_at: string;
  completed_at: string | null;
  payload: Record<string, unknown>;
}

export class ArchiveJobRepository {
  constructor(private readonly db: AgoraDatabase) {}

  insertArchiveJob(input: {
    task_id: string;
    status: string;
    target_path: string;
    payload: Record<string, unknown>;
    writer_agent: string;
  }): StoredArchiveJob {
    const info = this.db.prepare(`
      INSERT INTO archive_jobs (task_id, status, target_path, payload, writer_agent)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      input.task_id,
      input.status,
      input.target_path,
      stringifyJsonValue(input.payload),
      input.writer_agent,
    );
    return this.getArchiveJob(Number(info.lastInsertRowid))!;
  }

  getArchiveJob(jobId: number): StoredArchiveJob | null {
    const row = this.db.prepare(`
      SELECT aj.*, t.title AS task_title, t.type AS task_type
      FROM archive_jobs aj
      JOIN tasks t ON t.id = aj.task_id
      WHERE aj.id = ?
    `).get(jobId) as Record<string, unknown> | undefined;
    return row ? this.parseArchiveRow(row) : null;
  }

  listArchiveJobs(filters: { status?: string; taskId?: string } = {}): StoredArchiveJob[] {
    const clauses: string[] = [];
    const values: Array<string | number> = [];
    if (filters.status) {
      clauses.push('aj.status = ?');
      values.push(filters.status);
    }
    if (filters.taskId) {
      clauses.push('aj.task_id = ?');
      values.push(filters.taskId);
    }
    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db.prepare(`
      SELECT aj.*, t.title AS task_title, t.type AS task_type
      FROM archive_jobs aj
      JOIN tasks t ON t.id = aj.task_id
      ${whereClause}
      ORDER BY aj.requested_at DESC, aj.id DESC
    `).all(...values) as Record<string, unknown>[];
    return rows.map((row) => this.parseArchiveRow(row));
  }

  retryArchiveJob(jobId: number): StoredArchiveJob {
    const existing = this.getArchiveJob(jobId);
    if (!existing) {
      throw new Error(`Archive job ${jobId} not found`);
    }
    this.db.prepare(`
      UPDATE archive_jobs
      SET status = 'pending', commit_hash = NULL, completed_at = NULL
      WHERE id = ?
    `).run(jobId);
    return this.getArchiveJob(jobId)!;
  }

  private parseArchiveRow(row: Record<string, unknown>): StoredArchiveJob {
    return {
      id: Number(row.id),
      task_id: String(row.task_id),
      task_title: String(row.task_title),
      task_type: String(row.task_type),
      status: String(row.status),
      target_path: String(row.target_path),
      writer_agent: String(row.writer_agent),
      commit_hash: row.commit_hash === null ? null : String(row.commit_hash),
      requested_at: String(row.requested_at),
      completed_at: row.completed_at === null ? null : String(row.completed_at),
      payload: parseJsonValue(row.payload, {}),
    };
  }
}
