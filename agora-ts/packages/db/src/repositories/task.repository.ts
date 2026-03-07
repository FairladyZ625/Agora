import type { TeamDto, WorkflowDto } from '@agora-ts/contracts';
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
  current_stage: string | null;
  team: TeamDto;
  workflow: WorkflowDto;
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
}

export class TaskRepository {
  constructor(private readonly db: AgoraDatabase) {}

  insertTask(input: InsertTaskInput): StoredTask {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO tasks (
        id, title, description, type, priority, creator, state, team, workflow, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)
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
    );
    return this.getTask(input.id)!;
  }

  getTask(taskId: string): StoredTask | null {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Record<string, unknown> | undefined;
    return row ? this.parseTaskRow(row) : null;
  }

  listTasks(state?: string): StoredTask[] {
    const rows = state
      ? (this.db.prepare('SELECT * FROM tasks WHERE state = ? ORDER BY created_at DESC').all(state) as Record<string, unknown>[])
      : (this.db.prepare("SELECT * FROM tasks WHERE state != 'draft' ORDER BY created_at DESC").all() as Record<string, unknown>[]);
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
      current_stage: row.current_stage === null ? null : String(row.current_stage),
      team: parseJsonValue<TeamDto>(row.team, { members: [] }),
      workflow: parseJsonValue<WorkflowDto>(row.workflow, {}),
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
