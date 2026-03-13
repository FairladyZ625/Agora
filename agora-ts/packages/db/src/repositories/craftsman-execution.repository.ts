import type { CraftsmanExecutionPayloadDto } from '@agora-ts/contracts';
import type { AgoraDatabase } from '../database.js';
import { parseJsonValue, stringifyJsonValue } from './json.js';

export interface StoredCraftsmanExecution {
  execution_id: string;
  task_id: string;
  subtask_id: string;
  adapter: string;
  mode: string;
  session_id: string | null;
  status: string;
  brief_path: string | null;
  workdir: string | null;
  callback_payload: CraftsmanExecutionPayloadDto | null;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface InsertCraftsmanExecutionInput {
  execution_id: string;
  task_id: string;
  subtask_id: string;
  adapter: string;
  mode: string;
  session_id?: string | null;
  status?: string;
  brief_path?: string | null;
  workdir?: string | null;
  callback_payload?: CraftsmanExecutionPayloadDto | null;
  error?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
}

export interface UpdateCraftsmanExecutionInput {
  session_id?: string | null;
  status?: string;
  callback_payload?: CraftsmanExecutionPayloadDto | null;
  error?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
}

export class CraftsmanExecutionRepository {
  constructor(private readonly db: AgoraDatabase) {}

  insertExecution(input: InsertCraftsmanExecutionInput): StoredCraftsmanExecution {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO craftsman_executions (
        execution_id,
        task_id,
        subtask_id,
        adapter,
        mode,
        session_id,
        status,
        brief_path,
        workdir,
        callback_payload,
        error,
        started_at,
        finished_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.execution_id,
      input.task_id,
      input.subtask_id,
      input.adapter,
      input.mode,
      input.session_id ?? null,
      input.status ?? 'queued',
      input.brief_path ?? null,
      input.workdir ?? null,
      input.callback_payload ? stringifyJsonValue(input.callback_payload) : null,
      input.error ?? null,
      input.started_at ?? null,
      input.finished_at ?? null,
      now,
      now,
    );
    return this.getExecution(input.execution_id)!;
  }

  getExecution(executionId: string): StoredCraftsmanExecution | null {
    const row = this.db.prepare(`
      SELECT *
      FROM craftsman_executions
      WHERE execution_id = ?
    `).get(executionId) as Record<string, unknown> | undefined;
    return row ? this.parseRow(row) : null;
  }

  listBySubtask(taskId: string, subtaskId: string): StoredCraftsmanExecution[] {
    const rows = this.db.prepare(`
      SELECT *
      FROM craftsman_executions
      WHERE task_id = ? AND subtask_id = ?
      ORDER BY created_at DESC, execution_id DESC
    `).all(taskId, subtaskId) as Record<string, unknown>[];
    return rows.map((row) => this.parseRow(row));
  }

  listByTaskIds(taskIds: string[]): StoredCraftsmanExecution[] {
    if (taskIds.length === 0) {
      return [];
    }
    const placeholders = taskIds.map(() => '?').join(', ');
    const rows = this.db.prepare(`
      SELECT *
      FROM craftsman_executions
      WHERE task_id IN (${placeholders})
      ORDER BY task_id ASC, subtask_id ASC, created_at DESC, execution_id DESC
    `).all(...taskIds) as Record<string, unknown>[];
    return rows.map((row) => this.parseRow(row));
  }

  listActiveExecutions() {
    const rows = this.db.prepare(`
      SELECT *
      FROM craftsman_executions
      WHERE status IN ('queued', 'running', 'needs_input', 'awaiting_choice')
      ORDER BY updated_at ASC, execution_id ASC
    `).all() as Record<string, unknown>[];
    return rows.map((row) => this.parseRow(row));
  }

  countActiveExecutions() {
    const row = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM craftsman_executions
      WHERE status IN ('queued', 'running', 'needs_input', 'awaiting_choice')
    `).get() as { count: number };
    return Number(row.count ?? 0);
  }

  countActiveExecutionsByAssignee(assignee: string) {
    const row = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM craftsman_executions ce
      INNER JOIN subtasks s
        ON s.task_id = ce.task_id
       AND s.id = ce.subtask_id
      WHERE s.assignee = ?
        AND ce.status IN ('queued', 'running', 'needs_input', 'awaiting_choice')
    `).get(assignee) as { count: number };
    return Number(row.count ?? 0);
  }

  listActiveExecutionCountsByAssignee() {
    const rows = this.db.prepare(`
      SELECT s.assignee AS assignee, COUNT(*) AS count
      FROM craftsman_executions ce
      INNER JOIN subtasks s
        ON s.task_id = ce.task_id
       AND s.id = ce.subtask_id
      WHERE ce.status IN ('queued', 'running', 'needs_input', 'awaiting_choice')
      GROUP BY s.assignee
      ORDER BY count DESC, assignee ASC
    `).all() as Array<{ assignee: string; count: number }>;
    return rows.map((row) => ({
      assignee: String(row.assignee),
      count: Number(row.count ?? 0),
    }));
  }

  updateExecution(executionId: string, updates: UpdateCraftsmanExecutionInput): StoredCraftsmanExecution {
    const assignments: string[] = [];
    const values: Array<string | null> = [];

    const push = (column: string, value: string | null) => {
      assignments.push(`${column} = ?`);
      values.push(value);
    };

    if (updates.session_id !== undefined) push('session_id', updates.session_id);
    if (updates.status !== undefined) push('status', updates.status);
    if (updates.callback_payload !== undefined) {
      push(
        'callback_payload',
        updates.callback_payload ? stringifyJsonValue(updates.callback_payload) : null,
      );
    }
    if (updates.error !== undefined) push('error', updates.error);
    if (updates.started_at !== undefined) push('started_at', updates.started_at);
    if (updates.finished_at !== undefined) push('finished_at', updates.finished_at);

    assignments.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(executionId);

    this.db.prepare(`
      UPDATE craftsman_executions
      SET ${assignments.join(', ')}
      WHERE execution_id = ?
    `).run(...values);

    return this.getExecution(executionId)!;
  }

  private parseRow(row: Record<string, unknown>): StoredCraftsmanExecution {
    return {
      execution_id: String(row.execution_id),
      task_id: String(row.task_id),
      subtask_id: String(row.subtask_id),
      adapter: String(row.adapter),
      mode: String(row.mode),
      session_id: row.session_id === null ? null : String(row.session_id),
      status: String(row.status),
      brief_path: row.brief_path === null ? null : String(row.brief_path),
      workdir: row.workdir === null ? null : String(row.workdir),
      callback_payload: row.callback_payload === null
        ? null
        : parseJsonValue<CraftsmanExecutionPayloadDto>(row.callback_payload, {}),
      error: row.error === null ? null : String(row.error),
      started_at: row.started_at === null ? null : String(row.started_at),
      finished_at: row.finished_at === null ? null : String(row.finished_at),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    };
  }
}
