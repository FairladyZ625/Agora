import type { AgoraDatabase } from '../database.js';

export interface StoredSubtask {
  id: string;
  task_id: string;
  stage_id: string;
  title: string;
  assignee: string;
  status: string;
  output: string | null;
  craftsman_type: string | null;
  craftsman_session: string | null;
  craftsman_workdir: string | null;
  craftsman_prompt: string | null;
  dispatch_status: string | null;
  dispatched_at: string | null;
  done_at: string | null;
}

export interface InsertSubtaskInput {
  id: string;
  task_id: string;
  stage_id: string;
  title: string;
  assignee: string;
  status?: string;
  output?: string | null;
  craftsman_type?: string | null;
  craftsman_session?: string | null;
  craftsman_workdir?: string | null;
  craftsman_prompt?: string | null;
  dispatch_status?: string | null;
  dispatched_at?: string | null;
  done_at?: string | null;
}

export class SubtaskRepository {
  constructor(private readonly db: AgoraDatabase) {}

  insertSubtask(input: InsertSubtaskInput): StoredSubtask {
    this.db.prepare(`
      INSERT INTO subtasks (
        id, task_id, stage_id, title, assignee, status, output,
        craftsman_type, craftsman_session, craftsman_workdir, craftsman_prompt,
        dispatch_status, dispatched_at, done_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.id,
      input.task_id,
      input.stage_id,
      input.title,
      input.assignee,
      input.status ?? 'not_started',
      input.output ?? null,
      input.craftsman_type ?? null,
      input.craftsman_session ?? null,
      input.craftsman_workdir ?? null,
      input.craftsman_prompt ?? null,
      input.dispatch_status ?? null,
      input.dispatched_at ?? null,
      input.done_at ?? null,
    );
    return this.getSubtask(input.task_id, input.id)!;
  }

  listByTask(taskId: string): StoredSubtask[] {
    const rows = this.db.prepare(`
      SELECT *
      FROM subtasks
      WHERE task_id = ?
      ORDER BY id ASC
    `).all(taskId) as Record<string, unknown>[];
    return rows.map((row) => this.parseRow(row));
  }

  updateSubtask(taskId: string, subtaskId: string, updates: {
    status?: string;
    output?: string | null;
    dispatch_status?: string | null;
    done_at?: string | null;
  }): StoredSubtask {
    const assignments: string[] = [];
    const values: Array<string | null> = [];

    const push = (column: string, value: string | null) => {
      assignments.push(`${column} = ?`);
      values.push(value);
    };

    if (updates.status !== undefined) push('status', updates.status);
    if (updates.output !== undefined) push('output', updates.output);
    if (updates.dispatch_status !== undefined) push('dispatch_status', updates.dispatch_status);
    if (updates.done_at !== undefined) push('done_at', updates.done_at);

    this.db.prepare(`
      UPDATE subtasks
      SET ${assignments.join(', ')}
      WHERE task_id = ? AND id = ?
    `).run(...values, taskId, subtaskId);

    return this.getSubtask(taskId, subtaskId)!;
  }

  private getSubtask(taskId: string, subtaskId: string): StoredSubtask | null {
    const row = this.db.prepare(`
      SELECT *
      FROM subtasks
      WHERE task_id = ? AND id = ?
    `).get(taskId, subtaskId) as Record<string, unknown> | undefined;
    return row ? this.parseRow(row) : null;
  }

  private parseRow(row: Record<string, unknown>): StoredSubtask {
    return {
      id: String(row.id),
      task_id: String(row.task_id),
      stage_id: String(row.stage_id),
      title: String(row.title),
      assignee: String(row.assignee),
      status: String(row.status),
      output: row.output === null ? null : String(row.output),
      craftsman_type: row.craftsman_type === null ? null : String(row.craftsman_type),
      craftsman_session: row.craftsman_session === null ? null : String(row.craftsman_session),
      craftsman_workdir: row.craftsman_workdir === null ? null : String(row.craftsman_workdir),
      craftsman_prompt: row.craftsman_prompt === null ? null : String(row.craftsman_prompt),
      dispatch_status: row.dispatch_status === null ? null : String(row.dispatch_status),
      dispatched_at: row.dispatched_at === null ? null : String(row.dispatched_at),
      done_at: row.done_at === null ? null : String(row.done_at),
    };
  }
}
