import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgoraDatabase, runMigrations } from '../database.js';
import { RoleBindingRepository } from './role-binding.repository.js';
import { RoleDefinitionRepository } from './role-definition.repository.js';

const tempPaths: string[] = [];

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-role-binding-'));
  tempPaths.push(dir);
  return join(dir, 'tasks.db');
}

function makeRolePackDir() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-role-pack-'));
  tempPaths.push(dir);
  mkdirSync(join(dir, 'roles'), { recursive: true });
  writeFileSync(join(dir, 'roles', 'controller.md'), '# Controller\n');
  writeFileSync(join(dir, 'roles', 'craftsman.md'), '# Craftsman\n');
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({
    id: 'agora-default',
    name: 'Agora Default',
    version: 1,
    roles: [
      {
        id: 'controller',
        name: 'Controller',
        member_kind: 'controller',
        summary: 'Owns orchestration flow.',
        prompt_asset: 'roles/controller.md',
        source: 'agora',
        allowed_target_kinds: ['runtime_agent'],
      },
      {
        id: 'craftsman',
        name: 'Craftsman',
        member_kind: 'craftsman',
        summary: 'Executes code through CLI craftsmen.',
        prompt_asset: 'roles/craftsman.md',
        source: 'agora',
        allowed_target_kinds: ['craftsman_executor'],
      },
    ],
  }), 'utf8');
  return dir;
}

afterEach(() => {
  while (tempPaths.length > 0) {
    const dir = tempPaths.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('role repositories', () => {
  it('seeds role definitions from a role pack manifest', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const repository = new RoleDefinitionRepository(db);

    const seeded = repository.seedFromPackDir(makeRolePackDir());

    expect(seeded.inserted).toBe(2);
    expect(repository.getRoleDefinition('controller')).toMatchObject({
      id: 'controller',
      member_kind: 'controller',
      prompt_asset_path: 'roles/controller.md',
    });
  });

  it('stores and updates scoped role bindings', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const roleDefinitions = new RoleDefinitionRepository(db);
    roleDefinitions.seedFromPackDir(makeRolePackDir());
    const bindings = new RoleBindingRepository(db);

    const created = bindings.saveBinding({
      id: 'binding-1',
      role_id: 'controller',
      scope: 'workspace',
      scope_ref: 'default',
      target_kind: 'runtime_agent',
      target_adapter: 'openclaw',
      target_ref: 'opus',
      binding_mode: 'overlay',
      metadata: { source: 'manual' },
    });
    const updated = bindings.saveBinding({
      id: 'binding-2',
      role_id: 'controller',
      scope: 'workspace',
      scope_ref: 'default',
      target_kind: 'runtime_agent',
      target_adapter: 'openclaw',
      target_ref: 'sonnet',
      binding_mode: 'overlay',
      metadata: { source: 'manual-updated' },
    });

    expect(created.target_ref).toBe('opus');
    expect(updated.target_ref).toBe('sonnet');
    expect(bindings.listBindingsByScope('workspace', 'default')).toHaveLength(1);
    expect(bindings.getBinding('workspace', 'default', 'controller')).toMatchObject({
      target_ref: 'sonnet',
      metadata: { source: 'manual-updated' },
    });
  });
});
