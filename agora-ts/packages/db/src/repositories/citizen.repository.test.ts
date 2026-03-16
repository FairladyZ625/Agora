import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgoraDatabase, runMigrations } from '../database.js';
import { CitizenRepository } from './citizen.repository.js';
import { ProjectRepository } from './project.repository.js';
import { RoleDefinitionRepository } from './role-definition.repository.js';

const tempPaths: string[] = [];

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-citizen-repository-'));
  tempPaths.push(dir);
  return join(dir, 'tasks.db');
}

afterEach(() => {
  while (tempPaths.length > 0) {
    const dir = tempPaths.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('citizen repository', () => {
  it('persists citizens with role and project references', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    new ProjectRepository(db).insertProject({
      id: 'proj-alpha',
      name: 'Alpha',
    });
    new RoleDefinitionRepository(db).saveRoleDefinition({
      id: 'architect',
      name: 'Architect',
      member_kind: 'citizen',
      summary: 'Design systems.',
      prompt_asset: 'roles/architect.md',
      source: 'test',
      citizen_scaffold: {
        soul: 'Think in systems.',
        boundaries: ['Stay core-first.'],
        heartbeat: ['Restate objective.'],
        recap_expectations: ['Summarize next step.'],
      },
    });
    const repository = new CitizenRepository(db);

    const created = repository.insertCitizen({
      citizen_id: 'citizen-alpha',
      project_id: 'proj-alpha',
      role_id: 'architect',
      display_name: 'Alpha Architect',
      persona: 'Systems thinker',
      boundaries: ['Do not drift into provider logic.'],
      skills_ref: ['system-design'],
      runtime_projection: {
        adapter: 'openclaw',
        auto_provision: false,
        metadata: { channel: 'discord' },
      },
    });

    expect(created).toMatchObject({
      citizen_id: 'citizen-alpha',
      project_id: 'proj-alpha',
      role_id: 'architect',
      display_name: 'Alpha Architect',
      runtime_projection: {
        adapter: 'openclaw',
        auto_provision: false,
        metadata: { channel: 'discord' },
      },
    });
    expect(repository.listCitizens('proj-alpha')).toHaveLength(1);
  });
});
