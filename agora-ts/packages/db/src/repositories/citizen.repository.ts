import type { CitizenDefinitionDto, ICitizenRepository } from '@agora-ts/contracts';
import type { AgoraDatabase } from '../database.js';
import { parseJsonValue, stringifyJsonValue } from './json.js';

export type StoredCitizenDefinition = CitizenDefinitionDto;

export interface InsertCitizenInput {
  citizen_id: string;
  project_id: string;
  role_id: string;
  display_name: string;
  persona?: string | null;
  boundaries?: string[];
  skills_ref?: string[];
  channel_policies?: Record<string, unknown>;
  brain_scaffold_mode?: CitizenDefinitionDto['brain_scaffold_mode'];
  runtime_projection?: CitizenDefinitionDto['runtime_projection'];
}

export class CitizenRepository implements ICitizenRepository {
  constructor(private readonly db: AgoraDatabase) {}

  insertCitizen(input: InsertCitizenInput): StoredCitizenDefinition {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO citizens (
        citizen_id, project_id, role_id, display_name, persona, boundaries, skills_ref, channel_policies,
        brain_scaffold_mode, runtime_projection_adapter, runtime_projection_auto, runtime_projection_meta,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `).run(
      input.citizen_id,
      input.project_id,
      input.role_id,
      input.display_name,
      input.persona ?? null,
      stringifyJsonValue(input.boundaries ?? []),
      stringifyJsonValue(input.skills_ref ?? []),
      stringifyJsonValue(input.channel_policies ?? {}),
      input.brain_scaffold_mode ?? 'role_default',
      input.runtime_projection?.adapter ?? 'openclaw',
      input.runtime_projection?.auto_provision ? 1 : 0,
      stringifyJsonValue(input.runtime_projection?.metadata ?? {}),
      now,
      now,
    );
    return this.requireCitizen(input.citizen_id, 'insert');
  }

  getCitizen(citizenId: string): StoredCitizenDefinition | null {
    const row = this.db.prepare('SELECT * FROM citizens WHERE citizen_id = ?').get(citizenId) as Record<string, unknown> | undefined;
    return row ? this.parseRow(row) : null;
  }

  listCitizens(projectId?: string, status?: string): StoredCitizenDefinition[] {
    if (projectId && status) {
      const rows = this.db.prepare(`
        SELECT * FROM citizens WHERE project_id = ? AND status = ? ORDER BY created_at DESC, citizen_id DESC
      `).all(projectId, status) as Record<string, unknown>[];
      return rows.map((row) => this.parseRow(row));
    }
    if (projectId) {
      const rows = this.db.prepare(`
        SELECT * FROM citizens WHERE project_id = ? ORDER BY created_at DESC, citizen_id DESC
      `).all(projectId) as Record<string, unknown>[];
      return rows.map((row) => this.parseRow(row));
    }
    if (status) {
      const rows = this.db.prepare(`
        SELECT * FROM citizens WHERE status = ? ORDER BY created_at DESC, citizen_id DESC
      `).all(status) as Record<string, unknown>[];
      return rows.map((row) => this.parseRow(row));
    }
    const rows = this.db.prepare('SELECT * FROM citizens ORDER BY created_at DESC, citizen_id DESC').all() as Record<string, unknown>[];
    return rows.map((row) => this.parseRow(row));
  }

  private requireCitizen(citizenId: string, action: 'insert') {
    const citizen = this.getCitizen(citizenId);
    if (!citizen) {
      throw new Error(`Failed to retrieve citizen ${citizenId} after ${action}`);
    }
    return citizen;
  }

  private parseRow(row: Record<string, unknown>): StoredCitizenDefinition {
    return {
      citizen_id: String(row.citizen_id),
      project_id: String(row.project_id),
      role_id: String(row.role_id),
      display_name: String(row.display_name),
      persona: row.persona === null ? null : String(row.persona),
      boundaries: parseJsonValue(row.boundaries, []),
      skills_ref: parseJsonValue(row.skills_ref, []),
      channel_policies: parseJsonValue(row.channel_policies, {}),
      brain_scaffold_mode: String(row.brain_scaffold_mode) as CitizenDefinitionDto['brain_scaffold_mode'],
      runtime_projection: {
        adapter: String(row.runtime_projection_adapter),
        auto_provision: Boolean(row.runtime_projection_auto),
        metadata: row.runtime_projection_meta ? parseJsonValue(row.runtime_projection_meta, {}) : {},
      },
      status: String(row.status) as CitizenDefinitionDto['status'],
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    };
  }
}
