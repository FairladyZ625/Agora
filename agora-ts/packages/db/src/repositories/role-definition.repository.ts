import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { RoleDefinitionDto, RolePackManifestDto, IRoleDefinitionRepository } from '@agora-ts/contracts';
import { roleDefinitionSchema, rolePackManifestSchema } from '@agora-ts/contracts';
import type { AgoraDatabase } from '../database.js';
import { parseJsonValue, stringifyJsonValue } from './json.js';

export interface StoredRoleDefinition {
  id: string;
  version: number;
  name: string;
  member_kind: RoleDefinitionDto['member_kind'];
  source: string;
  source_ref: string | null;
  summary: string;
  prompt_asset_path: string;
  default_model_preference: string | null;
  payload: RoleDefinitionDto;
  created_at: string;
  updated_at: string;
}

export class RoleDefinitionRepository {
  constructor(private readonly db: AgoraDatabase) {}

  listRoleDefinitions(): StoredRoleDefinition[] {
    const rows = this.db.prepare('SELECT * FROM role_definitions ORDER BY id').all() as Record<string, unknown>[];
    return rows.map((row) => this.parseRow(row));
  }

  getRoleDefinition(roleId: string): StoredRoleDefinition | null {
    const row = this.db.prepare('SELECT * FROM role_definitions WHERE id = ?').get(roleId) as Record<string, unknown> | undefined;
    return row ? this.parseRow(row) : null;
  }

  saveRoleDefinition(definitionInput: RoleDefinitionDto | Parameters<typeof roleDefinitionSchema.parse>[0]): StoredRoleDefinition {
    const definition = roleDefinitionSchema.parse(definitionInput);
    const now = new Date().toISOString();
    const existing = this.getRoleDefinition(definition.id);
    if (existing) {
      this.db.prepare(`
        UPDATE role_definitions
        SET name = ?, member_kind = ?, source = ?, source_ref = ?, summary = ?, prompt_asset_path = ?, default_model_preference = ?, payload = ?, version = version + 1, updated_at = ?
        WHERE id = ?
      `).run(
        definition.name,
        definition.member_kind,
        definition.source,
        definition.source_ref ?? null,
        definition.summary,
        definition.prompt_asset,
        definition.default_model_preference ?? null,
        stringifyJsonValue(definition),
        now,
        definition.id,
      );
    } else {
      this.db.prepare(`
        INSERT INTO role_definitions (
          id, name, member_kind, source, source_ref, summary, prompt_asset_path, default_model_preference, payload, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        definition.id,
        definition.name,
        definition.member_kind,
        definition.source,
        definition.source_ref ?? null,
        definition.summary,
        definition.prompt_asset,
        definition.default_model_preference ?? null,
        stringifyJsonValue(definition),
        now,
        now,
      );
    }
    return this.getRoleDefinition(definition.id)!;
  }

  seedFromPackDir(packDir: string): { inserted: number; updated: number; manifest: RolePackManifestDto | null } {
    const manifestPath = resolve(packDir, 'manifest.json');
    if (!existsSync(manifestPath)) {
      return { inserted: 0, updated: 0, manifest: null };
    }

    const manifest = rolePackManifestSchema.parse(JSON.parse(readFileSync(manifestPath, 'utf8')));
    let inserted = 0;
    let updated = 0;
    for (const role of manifest.roles) {
      const existing = this.getRoleDefinition(role.id);
      this.saveRoleDefinition(role);
      if (existing) {
        updated += 1;
      } else {
        inserted += 1;
      }
    }
    return { inserted, updated, manifest };
  }

  private parseRow(row: Record<string, unknown>): StoredRoleDefinition {
    return {
      id: String(row.id),
      version: Number(row.version),
      name: String(row.name),
      member_kind: String(row.member_kind) as RoleDefinitionDto['member_kind'],
      source: String(row.source),
      source_ref: row.source_ref === null ? null : String(row.source_ref),
      summary: String(row.summary),
      prompt_asset_path: String(row.prompt_asset_path),
      default_model_preference: row.default_model_preference === null ? null : String(row.default_model_preference),
      payload: parseJsonValue<RoleDefinitionDto>(row.payload, {} as RoleDefinitionDto),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    };
  }
}
