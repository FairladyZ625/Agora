import type { AgoraDatabase } from '../database.js';
import { parseJsonValue, stringifyJsonValue } from './json.js';

export interface StoredProject {
  id: string;
  name: string;
  summary: string | null;
  status: string;
  owner: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface InsertProjectInput {
  id: string;
  name: string;
  summary?: string | null;
  owner?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface UpdateProjectInput {
  name?: string;
  summary?: string | null;
  status?: string;
  owner?: string | null;
  metadata?: Record<string, unknown> | null;
}

export class ProjectRepository {
  constructor(private readonly db: AgoraDatabase) {}

  insertProject(input: InsertProjectInput): StoredProject {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO projects (id, name, summary, status, owner, metadata, created_at, updated_at)
      VALUES (?, ?, ?, 'active', ?, ?, ?, ?)
    `).run(
      input.id,
      input.name,
      input.summary ?? null,
      input.owner ?? null,
      stringifyJsonValue(input.metadata ?? null),
      now,
      now,
    );
    return this.requireProject(input.id, 'insert');
  }

  getProject(projectId: string): StoredProject | null {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as Record<string, unknown> | undefined;
    return row ? this.parseProjectRow(row) : null;
  }

  listProjects(status?: string): StoredProject[] {
    const rows = status
      ? this.db.prepare('SELECT * FROM projects WHERE status = ? ORDER BY created_at DESC').all(status) as Record<string, unknown>[]
      : this.db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all() as Record<string, unknown>[];
    return rows.map((row) => this.parseProjectRow(row));
  }

  updateProject(projectId: string, updates: UpdateProjectInput): StoredProject {
    const assignments: string[] = [];
    const values: Array<string | null> = [];
    const push = (column: string, value: string | null) => {
      assignments.push(`${column} = ?`);
      values.push(value);
    };

    if (updates.name !== undefined) push('name', updates.name);
    if (updates.summary !== undefined) push('summary', updates.summary);
    if (updates.status !== undefined) push('status', updates.status);
    if (updates.owner !== undefined) push('owner', updates.owner);
    if (updates.metadata !== undefined) push('metadata', stringifyJsonValue(updates.metadata));
    push('updated_at', new Date().toISOString());
    values.push(projectId);

    const result = this.db.prepare(`
      UPDATE projects
      SET ${assignments.join(', ')}
      WHERE id = ?
    `).run(...values);

    if (result.changes === 0) {
      throw new Error(`Project ${projectId} update failed due to missing row`);
    }

    return this.requireProject(projectId, 'update');
  }

  private requireProject(projectId: string, action: 'insert' | 'update') {
    const project = this.getProject(projectId);
    if (!project) {
      throw new Error(`Failed to retrieve project ${projectId} after ${action}`);
    }
    return project;
  }

  private parseProjectRow(row: Record<string, unknown>): StoredProject {
    return {
      id: String(row.id),
      name: String(row.name),
      summary: row.summary === null ? null : String(row.summary),
      status: String(row.status),
      owner: row.owner === null ? null : String(row.owner),
      metadata: row.metadata ? parseJsonValue<Record<string, unknown>>(row.metadata, {}) : null,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    };
  }
}
