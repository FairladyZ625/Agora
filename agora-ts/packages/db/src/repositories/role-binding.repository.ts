import type { IRoleBindingRepository, RoleBindingDto, RoleBindingSaveInput } from '@agora-ts/contracts';
import type { AgoraDatabase } from '../database.js';
import { parseJsonValue, stringifyJsonValue } from './json.js';

export class RoleBindingRepository implements IRoleBindingRepository {
  constructor(private readonly db: AgoraDatabase) {}

  saveBinding(input: RoleBindingSaveInput): RoleBindingDto {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO role_bindings (
        id, role_id, scope, scope_ref, target_kind, target_adapter, target_ref, binding_mode, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(scope, scope_ref, role_id) DO UPDATE SET
        target_kind = excluded.target_kind,
        target_adapter = excluded.target_adapter,
        target_ref = excluded.target_ref,
        binding_mode = excluded.binding_mode,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
    `).run(
      input.id,
      input.role_id,
      input.scope,
      input.scope_ref,
      input.target_kind,
      input.target_adapter,
      input.target_ref,
      input.binding_mode,
      input.metadata ? stringifyJsonValue(input.metadata) : null,
      now,
      now,
    );

    return this.requireBinding(input.scope, input.scope_ref, input.role_id);
  }

  getBinding(scope: RoleBindingDto['scope'], scopeRef: string, roleId: string): RoleBindingDto | null {
    const row = this.db.prepare(
      'SELECT * FROM role_bindings WHERE scope = ? AND scope_ref = ? AND role_id = ?',
    ).get(scope, scopeRef, roleId) as Record<string, unknown> | undefined;
    return row ? this.parseRow(row) : null;
  }

  listBindingsByScope(scope: RoleBindingDto['scope'], scopeRef: string): RoleBindingDto[] {
    const rows = this.db.prepare(
      'SELECT * FROM role_bindings WHERE scope = ? AND scope_ref = ? ORDER BY role_id',
    ).all(scope, scopeRef) as Record<string, unknown>[];
    return rows.map((row) => this.parseRow(row));
  }

  private parseRow(row: Record<string, unknown>): RoleBindingDto {
    return {
      id: String(row.id),
      role_id: String(row.role_id),
      scope: String(row.scope) as RoleBindingDto['scope'],
      scope_ref: String(row.scope_ref),
      target_kind: String(row.target_kind) as RoleBindingDto['target_kind'],
      target_adapter: String(row.target_adapter),
      target_ref: String(row.target_ref),
      binding_mode: String(row.binding_mode) as RoleBindingDto['binding_mode'],
      metadata: row.metadata === null ? null : parseJsonValue<Record<string, unknown>>(row.metadata, {}),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    };
  }

  private requireBinding(scope: RoleBindingDto['scope'], scopeRef: string, roleId: string): RoleBindingDto {
    const binding = this.getBinding(scope, scopeRef, roleId);
    if (!binding) {
      throw new Error(`Failed to retrieve role binding ${scope}/${scopeRef}/${roleId} after save`);
    }
    return binding;
  }
}
