import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgoraDatabase, runMigrations, RoleDefinitionRepository } from '@agora-ts/db';
import { RolePackService } from './role-pack-service.js';

const tempPaths: string[] = [];

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-role-pack-service-db-'));
  tempPaths.push(dir);
  return join(dir, 'tasks.db');
}

function makeRolePackDir() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-role-pack-service-'));
  tempPaths.push(dir);
  mkdirSync(join(dir, 'roles'), { recursive: true });
  writeFileSync(join(dir, 'roles', 'controller.md'), '# Controller\n');
  writeFileSync(join(dir, 'roles', 'architect.md'), '# Architect\n');
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
        citizen_scaffold: {
          soul: 'Keep task state coherent.',
          boundaries: ['Do not fabricate approval.'],
          heartbeat: ['Restate the current objective before changing plan.'],
          recap_expectations: ['Summarize owner, risk, and next action.'],
        },
      },
      {
        id: 'architect',
        name: 'Architect',
        member_kind: 'citizen',
        summary: 'Leads architecture discussion.',
        prompt_asset: 'roles/architect.md',
        source: 'agora',
        allowed_target_kinds: ['runtime_agent'],
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

describe('role pack service', () => {
  it('loads role definitions from the configured pack directory', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);

    const service = new RolePackService({
      db,
      rolePacksDir: makeRolePackDir(),
    });

    expect(service.listRoleDefinitions().map((role) => role.id)).toEqual(['architect', 'controller']);
    expect(service.getRoleDefinition('controller')?.payload.citizen_scaffold).toMatchObject({
      soul: 'Keep task state coherent.',
      boundaries: ['Do not fabricate approval.'],
    });
  });

  it('resolves bindings by explicit scope precedence', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = new RolePackService({
      db,
      rolePacksDir: makeRolePackDir(),
    });

    service.saveBinding({
      id: 'binding-1',
      role_id: 'controller',
      scope: 'workspace',
      scope_ref: 'default',
      target_kind: 'runtime_agent',
      target_adapter: 'openclaw',
      target_ref: 'opus',
      binding_mode: 'overlay',
    });
    service.saveBinding({
      id: 'binding-2',
      role_id: 'controller',
      scope: 'template',
      scope_ref: 'coding',
      target_kind: 'runtime_agent',
      target_adapter: 'openclaw',
      target_ref: 'sonnet',
      binding_mode: 'overlay',
    });

    expect(service.resolveRoleTarget('controller', [
      { scope: 'task', scope_ref: 'OC-1' },
      { scope: 'template', scope_ref: 'coding' },
      { scope: 'workspace', scope_ref: 'default' },
    ])?.target_ref).toBe('sonnet');
  });

  it('resolves template team members from template and workspace bindings before suggested defaults', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = new RolePackService({
      db,
      rolePacksDir: makeRolePackDir(),
    });

    service.saveBinding({
      id: 'binding-3',
      role_id: 'architect',
      scope: 'workspace',
      scope_ref: 'default',
      target_kind: 'runtime_agent',
      target_adapter: 'openclaw',
      target_ref: 'opus',
      binding_mode: 'overlay',
    });

    const members = service.resolveTemplateTeam('coding', {
      name: 'Coding',
      type: 'coding',
      defaultTeam: {
        architect: {
          member_kind: 'citizen',
          suggested: ['fallback-architect'],
        },
        controller: {
          member_kind: 'controller',
          suggested: ['fallback-controller'],
        },
      },
      stages: [{ id: 'discuss', mode: 'discuss', gate: { type: 'command' } }],
    }, [{ scope: 'workspace', scope_ref: 'default' }]);

    expect(members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'architect', agentId: 'opus' }),
        expect.objectContaining({ role: 'controller', agentId: 'fallback-controller' }),
      ]),
    );
  });

  it('marks generated bindings as agora-managed delta briefing members', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = new RolePackService({
      db,
      rolePacksDir: makeRolePackDir(),
    });

    service.saveBinding({
      id: 'binding-generated-1',
      role_id: 'architect',
      scope: 'workspace',
      scope_ref: 'default',
      target_kind: 'runtime_agent',
      target_adapter: 'openclaw',
      target_ref: 'architect-managed',
      binding_mode: 'generated',
    });

    const members = service.resolveTemplateTeam('coding', {
      name: 'Coding',
      type: 'coding',
      defaultTeam: {
        architect: {
          member_kind: 'citizen',
          suggested: ['fallback-architect'],
        },
      },
      stages: [{ id: 'discuss', mode: 'discuss', gate: { type: 'command' } }],
    }, [{ scope: 'workspace', scope_ref: 'default' }]);

    expect(members).toEqual([
      expect.objectContaining({
        role: 'architect',
        agentId: 'architect-managed',
        agent_origin: 'agora_managed',
        briefing_mode: 'overlay_delta',
      }),
    ]);
  });

  it('rejects partial injection — roleDefinitions without roleBindings and no db', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const repo = new RoleDefinitionRepository(db);

    expect(() => new RolePackService({ roleDefinitions: repo })).toThrow(
      /requires either db or both roleDefinitions and roleBindings/,
    );
  });
});
