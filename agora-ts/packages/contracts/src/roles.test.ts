import { describe, expect, it } from 'vitest';
import {
  roleBindingSchema,
  rolePackManifestSchema,
} from './roles.js';

describe('role pack contracts', () => {
  it('parses a role pack manifest with Agora canonical roles', () => {
    expect(rolePackManifestSchema.parse({
      pack_id: 'agora-default',
      name: 'Agora Default',
      version: 1,
      roles: [
        {
          id: 'controller',
          name: 'Controller',
          member_kind: 'controller',
          summary: 'Owns orchestration flow and dispatch decisions.',
          prompt_asset: 'roles/controller.md',
          source: 'agora',
          source_ref: null,
          default_model_preference: 'strong_reasoning',
        },
        {
          id: 'craftsman',
          name: 'Craftsman',
          member_kind: 'craftsman',
          summary: 'Executes coding work through craftsman adapters.',
          prompt_asset: 'roles/craftsman.md',
          source: 'agora',
        },
      ],
    }).roles[1]?.allowed_target_kinds[0]).toBe('craftsman_executor');
  });

  it('parses scoped role bindings and keeps runtime/craftsman targets distinct', () => {
    expect(roleBindingSchema.parse({
      id: 'binding-1',
      role_id: 'craftsman',
      scope: 'template',
      scope_ref: 'coding_heavy',
      target_kind: 'craftsman_executor',
      target_adapter: 'codex',
      target_ref: 'codex',
      binding_mode: 'overlay',
      metadata: { reason: 'preferred executor' },
      created_at: '2026-03-11T00:00:00Z',
      updated_at: '2026-03-11T00:00:00Z',
    }).target_kind).toBe('craftsman_executor');
  });
});
