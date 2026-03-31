import type { SQLInputValue } from 'node:sqlite';
import type { TaskControlDto, TaskLocaleDto, TaskSkillPolicyDto, TeamDto, WorkflowDto, ITaskRepository } from '@agora-ts/contracts';
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
  locale: TaskLocaleDto;
  project_id?: string | null;
  state: string;
  archive_status: string | null;
  current_stage: string | null;
  skill_policy: TaskSkillPolicyDto | null;
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
  locale?: TaskLocaleDto;
  project_id?: string | null;
  skill_policy?: TaskSkillPolicyDto | null;
  team: TeamDto;
  workflow: WorkflowDto;
  control?: TaskControlDto | null;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  priority?: string;
  locale?: TaskLocaleDto;
  project_id?: string | null;
  state?: string;
  current_stage?: string | null;
  skill_policy?: TaskSkillPolicyDto | null;
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
        id, title, description, type, priority, creator, locale, project_id, state, skill_policy, team, workflow, created_at, updated_at, control
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)
    `).run(
      input.id,
      input.title,
      input.description,
      input.type,
      input.priority,
      input.creator,
      input.locale ?? 'zh-CN',
      input.project_id ?? null,
      stringifyJsonValue(input.skill_policy ?? null),
      stringifyJsonValue(input.team),
      stringifyJsonValue(input.workflow),
      now,
      now,
      stringifyJsonValue(input.control ?? { mode: 'normal' }),
    );
    return this.requireTask(input.id, 'insert');
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
    if (updates.locale !== undefined) push('locale', updates.locale);
    if (updates.project_id !== undefined) push('project_id', updates.project_id);
    if (updates.state !== undefined) push('state', updates.state);
    if (updates.current_stage !== undefined) push('current_stage', updates.current_stage);
    if (updates.skill_policy !== undefined) push('skill_policy', stringifyJsonValue(updates.skill_policy));
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

    return this.requireTask(taskId, 'update');
  }

  listTasks(state?: string, projectId?: string): StoredTask[] {
    const clauses: string[] = [];
    const values: SQLInputValue[] = [];
    if (state) {
      clauses.push('t.state = ?');
      values.push(state);
    } else {
      clauses.push("t.state != 'draft'");
    }
    if (projectId) {
      clauses.push('t.project_id = ?');
      values.push(projectId);
    }
    const rows = this.db.prepare(`${this.baseSelect} WHERE ${clauses.join(' AND ')} ORDER BY t.created_at DESC`).all(...values) as Record<string, unknown>[];
    return rows.map((row) => this.parseTaskRow(row));
  }

  private requireTask(taskId: string, action: 'insert' | 'update'): StoredTask {
    const task = this.getTask(taskId);
    if (!task) {
      throw new Error(`Failed to retrieve task ${taskId} after ${action}`);
    }
    return task;
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
      locale: String(row.locale ?? 'zh-CN') as TaskLocaleDto,
      project_id: row.project_id === null || row.project_id === undefined ? null : String(row.project_id),
      state: String(row.state),
      archive_status: row.archive_status === null || row.archive_status === undefined ? null : String(row.archive_status),
      current_stage: row.current_stage === null ? null : String(row.current_stage),
      skill_policy: row.skill_policy ? parseJsonValue<TaskSkillPolicyDto | null>(row.skill_policy, null) : null,
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
