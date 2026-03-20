import type { AgoraDatabase } from '../database.js';

export type ProjectBrainIndexJobStatus = 'pending' | 'running' | 'failed' | 'succeeded';

export interface StoredProjectBrainIndexJob {
  id: number;
  project_id: string;
  document_kind: string;
  document_slug: string;
  reason: string;
  status: ProjectBrainIndexJobStatus;
  attempt_count: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export class ProjectBrainIndexJobRepository {
  constructor(private readonly db: AgoraDatabase) {}

  enqueue(input: {
    project_id: string;
    document_kind: string;
    document_slug: string;
    reason: string;
  }): StoredProjectBrainIndexJob {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO project_brain_index_jobs (
        project_id, document_kind, document_slug, reason, status, attempt_count, last_error, created_at, updated_at, started_at, completed_at
      )
      VALUES (?, ?, ?, ?, 'pending', 0, NULL, ?, ?, NULL, NULL)
      ON CONFLICT(project_id, document_kind, document_slug)
      DO UPDATE SET
        reason = excluded.reason,
        status = 'pending',
        last_error = NULL,
        updated_at = excluded.updated_at,
        started_at = NULL,
        completed_at = NULL
    `).run(
      input.project_id,
      input.document_kind,
      input.document_slug,
      input.reason,
      now,
      now,
    );

    return this.requireByDocument(input.project_id, input.document_kind, input.document_slug, 'enqueue');
  }

  getById(jobId: number): StoredProjectBrainIndexJob | null {
    const row = this.db.prepare(`
      SELECT * FROM project_brain_index_jobs WHERE id = ?
    `).get(jobId) as Record<string, unknown> | undefined;
    return row ? this.parseRow(row) : null;
  }

  getByDocument(projectId: string, documentKind: string, documentSlug: string): StoredProjectBrainIndexJob | null {
    const row = this.db.prepare(`
      SELECT * FROM project_brain_index_jobs
      WHERE project_id = ? AND document_kind = ? AND document_slug = ?
    `).get(projectId, documentKind, documentSlug) as Record<string, unknown> | undefined;
    return row ? this.parseRow(row) : null;
  }

  listJobs(filters: {
    project_id?: string;
    status?: ProjectBrainIndexJobStatus;
  } = {}): StoredProjectBrainIndexJob[] {
    const clauses: string[] = [];
    const values: string[] = [];
    if (filters.project_id) {
      clauses.push('project_id = ?');
      values.push(filters.project_id);
    }
    if (filters.status) {
      clauses.push('status = ?');
      values.push(filters.status);
    }
    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db.prepare(`
      SELECT * FROM project_brain_index_jobs
      ${whereClause}
      ORDER BY updated_at DESC, id DESC
    `).all(...values) as Record<string, unknown>[];
    return rows.map((row) => this.parseRow(row));
  }

  claimNextPending(): StoredProjectBrainIndexJob | null {
    const row = this.db.prepare(`
      SELECT * FROM project_brain_index_jobs
      WHERE status = 'pending'
      ORDER BY updated_at ASC, id ASC
      LIMIT 1
    `).get() as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }
    const job = this.parseRow(row);
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE project_brain_index_jobs
      SET status = 'running',
          attempt_count = attempt_count + 1,
          updated_at = ?,
          started_at = ?,
          completed_at = NULL
      WHERE id = ? AND status = 'pending'
    `).run(now, now, job.id);
    return this.requireById(job.id, 'claim');
  }

  markSucceeded(jobId: number): StoredProjectBrainIndexJob {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE project_brain_index_jobs
      SET status = 'succeeded',
          last_error = NULL,
          updated_at = ?,
          completed_at = ?
      WHERE id = ?
    `).run(now, now, jobId);
    return this.requireById(jobId, 'markSucceeded');
  }

  markFailed(jobId: number, error: string): StoredProjectBrainIndexJob {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE project_brain_index_jobs
      SET status = 'failed',
          last_error = ?,
          updated_at = ?,
          completed_at = ?
      WHERE id = ?
    `).run(error, now, now, jobId);
    return this.requireById(jobId, 'markFailed');
  }

  private requireByDocument(projectId: string, documentKind: string, documentSlug: string, action: string) {
    const job = this.getByDocument(projectId, documentKind, documentSlug);
    if (!job) {
      throw new Error(`Failed to retrieve project brain index job ${projectId}/${documentKind}/${documentSlug} after ${action}`);
    }
    return job;
  }

  private requireById(jobId: number, action: string) {
    const job = this.getById(jobId);
    if (!job) {
      throw new Error(`Failed to retrieve project brain index job ${jobId} after ${action}`);
    }
    return job;
  }

  private parseRow(row: Record<string, unknown>): StoredProjectBrainIndexJob {
    return {
      id: Number(row.id),
      project_id: String(row.project_id),
      document_kind: String(row.document_kind),
      document_slug: String(row.document_slug),
      reason: String(row.reason),
      status: String(row.status) as ProjectBrainIndexJobStatus,
      attempt_count: Number(row.attempt_count),
      last_error: row.last_error === null ? null : String(row.last_error),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      started_at: row.started_at === null ? null : String(row.started_at),
      completed_at: row.completed_at === null ? null : String(row.completed_at),
    };
  }
}
