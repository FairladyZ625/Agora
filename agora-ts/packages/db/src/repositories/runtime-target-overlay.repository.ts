import {
  type IRuntimeTargetOverlayRepository,
  runtimeTargetPresentationModeSchema,
  type RuntimeTargetOverlayRecord,
  type UpsertRuntimeTargetOverlayInput,
} from '@agora-ts/contracts';
import type { AgoraDatabase } from '../database.js';
import { parseJsonValue, stringifyJsonValue } from './json.js';

export type StoredRuntimeTargetOverlay = RuntimeTargetOverlayRecord;

export class RuntimeTargetOverlayRepository implements IRuntimeTargetOverlayRepository {
  constructor(private readonly db: AgoraDatabase) {}

  upsertOverlay(input: UpsertRuntimeTargetOverlayInput): StoredRuntimeTargetOverlay {
    const existing = this.getOverlay(input.runtime_target_ref);
    const now = new Date().toISOString();
    const next: StoredRuntimeTargetOverlay = {
      runtime_target_ref: input.runtime_target_ref,
      enabled: input.enabled ?? existing?.enabled ?? true,
      display_name: input.display_name ?? existing?.display_name ?? null,
      tags: input.tags ?? existing?.tags ?? [],
      allowed_projects: input.allowed_projects ?? existing?.allowed_projects ?? [],
      default_roles: input.default_roles ?? existing?.default_roles ?? [],
      presentation_mode: input.presentation_mode ?? existing?.presentation_mode ?? 'headless',
      presentation_provider: input.presentation_provider ?? existing?.presentation_provider ?? null,
      presentation_identity_ref: input.presentation_identity_ref ?? existing?.presentation_identity_ref ?? null,
      metadata: input.metadata ?? existing?.metadata ?? null,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };

    this.db.prepare(`
      INSERT INTO runtime_target_overlays (
        runtime_target_ref,
        enabled,
        display_name,
        tags,
        allowed_projects,
        default_roles,
        presentation_mode,
        presentation_provider,
        presentation_identity_ref,
        metadata,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(runtime_target_ref) DO UPDATE SET
        enabled = excluded.enabled,
        display_name = excluded.display_name,
        tags = excluded.tags,
        allowed_projects = excluded.allowed_projects,
        default_roles = excluded.default_roles,
        presentation_mode = excluded.presentation_mode,
        presentation_provider = excluded.presentation_provider,
        presentation_identity_ref = excluded.presentation_identity_ref,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
    `).run(
      next.runtime_target_ref,
      next.enabled ? 1 : 0,
      next.display_name,
      stringifyJsonValue(next.tags),
      stringifyJsonValue(next.allowed_projects),
      stringifyJsonValue(next.default_roles),
      next.presentation_mode,
      next.presentation_provider,
      next.presentation_identity_ref,
      stringifyJsonValue(next.metadata),
      next.created_at,
      next.updated_at,
    );

    return this.getOverlay(input.runtime_target_ref)!;
  }

  getOverlay(runtimeTargetRef: string): StoredRuntimeTargetOverlay | null {
    const row = this.db.prepare(
      'SELECT * FROM runtime_target_overlays WHERE runtime_target_ref = ?',
    ).get(runtimeTargetRef) as Record<string, unknown> | undefined;
    return row ? this.parseRow(row) : null;
  }

  listOverlays(): StoredRuntimeTargetOverlay[] {
    const rows = this.db.prepare(
      'SELECT * FROM runtime_target_overlays ORDER BY runtime_target_ref ASC',
    ).all() as Record<string, unknown>[];
    return rows.map((row) => this.parseRow(row));
  }

  deleteOverlay(runtimeTargetRef: string): boolean {
    const result = this.db.prepare(
      'DELETE FROM runtime_target_overlays WHERE runtime_target_ref = ?',
    ).run(runtimeTargetRef);
    return Number(result.changes ?? 0) > 0;
  }

  private parseRow(row: Record<string, unknown>): StoredRuntimeTargetOverlay {
    return {
      runtime_target_ref: String(row.runtime_target_ref),
      enabled: Number(row.enabled) === 1,
      display_name: row.display_name === null ? null : String(row.display_name),
      tags: parseJsonValue<string[]>(row.tags, []),
      allowed_projects: parseJsonValue<string[]>(row.allowed_projects, []),
      default_roles: parseJsonValue<string[]>(row.default_roles, []),
      presentation_mode: runtimeTargetPresentationModeSchema.parse(String(row.presentation_mode)),
      presentation_provider: row.presentation_provider === null ? null : String(row.presentation_provider),
      presentation_identity_ref: row.presentation_identity_ref === null ? null : String(row.presentation_identity_ref),
      metadata: row.metadata ? parseJsonValue<Record<string, unknown>>(row.metadata, {}) : null,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    };
  }
}
