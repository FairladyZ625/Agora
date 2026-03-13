import type { SQLInputValue } from 'node:sqlite';
import type { TaskControlDto, TeamDto, WorkflowDto } from '@agora-ts/contracts';
import type { AgoraDatabase } from '../database.js';
import { parseJsonValue, stringifyJsonValue } from './json.js';

export interface StoredTask {
  id: string;
  version: number;
  title: string;
  description: string | null;
  type: string;
  priority: string;
  creator: string;
  state: string;
  archive_status: string | null;
  current_stage: string | null;
  team: TeamDto;
  workflow: WorkflowDto;
  control: TaskControlDto | null;
  scheduler: unknown;
  scheduler_snapshot: unknown;
  discord: unknown;
  metrics: unknown;
  error_detail: string | null;
  created_at: string;
  updated_at: string;
}

export interface InsertTaskInput {
  id: string;
  title: string;
  description: string;
  type: string;
  priority: string;
  creator: string;
  team: TeamDto;
  workflow: WorkflowDto;
  control?: TaskControlDto | null;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  priority?: string;
  state?: string;
  current_stage?: string | null;
  team?: TeamDto;
  workflow?: WorkflowDto;
  control?: TaskControlDto | null;
  scheduler?: unknown;
  scheduler_snapshot?: unknown;
  discord?: unknown;
  metrics?: unknown;
  error_detail?: string | null;
}

export class TaskRepository {
  constructor(private readonly db: AgoraDatabase) {}

  private readonly baseSelect = `
    SELECT t.*, aj.status AS archive_status
    FROM tasks t
    LEFT JOIN archive_jobs aj ON aj.id = (
      SELECT aj2.id
      FROM archive_jobs aj2
      WHERE aj2.task_id = t.id
      ORDER BY aj2.requested_at DESC, aj2.id DESC
      LIMIT 1
    )
  `;

  insertTask(input: InsertTaskInput): StoredTask {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO tasks (
        id, title, description, type, priority, creator, state, team, workflow, created_at, updated_at, control
      ) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)
    `).run(
      input.id,
      input.title,
      input.description,
      input.type,
      input.priority,
      input.creator,
      stringifyJsonValue(input.team),
      stringifyJsonValue(input.workflow),
      now,
      now,
      stringifyJsonValue(input.control ?? { mode: 'normal' }),
    );
    return this.getTask(input.id)!;
  }

  getTask(taskId: string): StoredTask | null {
    const row = this.db.prepare(`${this.baseSelect} WHERE t.id = ?`).get(taskId) as Record<string, unknown> | undefined;
    return row ? this.parseTaskRow(row) : null;
  }

  updateTask(taskId: string, version: number, updates: UpdateTaskInput): StoredTask {
    const assignments: string[] = [];
    const values: SQLInputValue[] = [];

    const push = (column: string, value: SQLInputValue) => {
      assignments.push(`${column} = ?`);
      values.push(value);
    };

    if (updates.title !== undefined) push('title', updates.title);
    if (updates.description !== undefined) push('description', updates.description);
    if (updates.priority !== undefined) push('priority', updates.priority);
    if (updates.state !== undefined) push('state', updates.state);
    if (updates.current_stage !== undefined) push('current_stage', updates.current_stage);
    if (updates.team !== undefined) push('team', stringifyJsonValue(updates.team));
    if (updates.workflow !== undefined) push('workflow', stringifyJsonValue(updates.workflow));
    if (updates.control !== undefined) push('control', stringifyJsonValue(updates.control));
    if (updates.scheduler !== undefined) push('scheduler', stringifyJsonValue(updates.scheduler));
    if (updates.scheduler_snapshot !== undefined) {
      push('scheduler_snapshot', stringifyJsonValue(updates.scheduler_snapshot));
    }
    if (updates.discord !== undefined) push('discord', stringifyJsonValue(updates.discord));
    if (updates.metrics !== undefined) push('metrics', stringifyJsonValue(updates.metrics));
    if (updates.error_detail !== undefined) push('error_detail', updates.error_detail);

    assignments.push('version = version + 1');
    assignments.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(taskId, version);

    const result = this.db.prepare(`
      UPDATE tasks
      SET ${assignments.join(', ')}
      WHERE id = ? AND version = ?
    `).run(...values);

    if (result.changes === 0) {
      throw new Error(`Task ${taskId} update failed due to missing row or version mismatch`);
    }

    return this.getTask(taskId)!;
  }

  listTasks(state?: string): StoredTask[] {
    const rows = state
      ? (this.db.prepare(`${this.baseSelect} WHERE t.state = ? ORDER BY t.created_at DESC`).all(state) as Record<string, unknown>[])
      : (this.db.prepare(`${this.baseSelect} WHERE t.state != 'draft' ORDER BY t.created_at DESC`).all() as Record<string, unknown>[]);
    return rows.map((row) => this.parseTaskRow(row));
  }

  private parseTaskRow(row: Record<string, unknown>): StoredTask {
    return {
      id: String(row.id),
      version: Number(row.version),
      title: String(row.title),
      description: row.description === null ? null : String(row.description),
      type: String(row.type),
      priority: String(row.priority),
      creator: String(row.creator),
      state: String(row.state),
      archive_status: row.archive_status === null || row.archive_status === undefined ? null : String(row.archive_status),
      current_stage: row.current_stage === null ? null : String(row.current_stage),
      team: parseJsonValue<TeamDto>(row.team, { members: [] }),
      workflow: parseJsonValue<WorkflowDto>(row.workflow, {}),
      control: row.control ? parseJsonValue<TaskControlDto>(row.control, { mode: 'normal' }) : null,
      scheduler: row.scheduler ? parseJsonValue(row.scheduler, null) : null,
      scheduler_snapshot: row.scheduler_snapshot ? parseJsonValue(row.scheduler_snapshot, null) : null,
      discord: row.discord ? parseJsonValue(row.discord, null) : null,
      metrics: row.metrics ? parseJsonValue(row.metrics, null) : null,
      error_detail: row.error_detail === null ? null : String(row.error_detail),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    };
  }
}
