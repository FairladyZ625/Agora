import type { AgoraDatabase } from '../database.js';

export interface StoredProjectWriteLock {
  project_id: string;
  holder_task_id: string;
  acquired_at: string;
}

export interface AcquireProjectWriteLockInput {
  project_id: string;
  holder_task_id: string;
}

export class ProjectWriteLockRepository {
  constructor(private readonly db: AgoraDatabase) {}

  acquireLock(input: AcquireProjectWriteLockInput): StoredProjectWriteLock | null {
    const now = new Date().toISOString();
    const result = this.db.prepare(`
      INSERT OR IGNORE INTO project_write_locks (
        project_id, holder_task_id, acquired_at
      ) VALUES (?, ?, ?)
    `).run(
      input.project_id,
      input.holder_task_id,
      now,
    );

    const current = this.getLock(input.project_id);
    if (!current) {
      return null;
    }
    if (result.changes > 0) {
      return current;
    }
    return current.holder_task_id === input.holder_task_id ? current : null;
  }

  getLock(projectId: string): StoredProjectWriteLock | null {
    const row = this.db.prepare(
      'SELECT * FROM project_write_locks WHERE project_id = ?',
    ).get(projectId) as Record<string, unknown> | undefined;
    return row ? this.parseRow(row) : null;
  }

  releaseLock(projectId: string, holderTaskId: string): boolean {
    const result = this.db.prepare(`
      DELETE FROM project_write_locks
      WHERE project_id = ? AND holder_task_id = ?
    `).run(projectId, holderTaskId);
    return result.changes > 0;
  }

  private parseRow(row: Record<string, unknown>): StoredProjectWriteLock {
    return {
      project_id: String(row.project_id),
      holder_task_id: String(row.holder_task_id),
      acquired_at: String(row.acquired_at),
    };
  }
}
