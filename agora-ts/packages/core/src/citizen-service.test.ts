import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgoraDatabase, runMigrations } from '@agora-ts/db';
import { OpenClawCitizenProjectionAdapter } from './adapters/openclaw-citizen-projection-adapter.js';
import { CitizenService } from './citizen-service.js';
import { ProjectService } from './project-service.js';
import { RolePackService } from './role-pack-service.js';

const tempPaths: string[] = [];

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-citizen-service-'));
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

describe('citizen service', () => {
  it('creates project-scoped citizens and renders OpenClaw previews', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const projectService = new ProjectService(db);
    projectService.createProject({
      id: 'proj-alpha',
      name: 'Project Alpha',
    });
    const rolePackService = new RolePackService({ db });
    rolePackService.saveRoleDefinition({
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
    const service = new CitizenService(db, {
      projectService,
      rolePackService,
      projectionPorts: [new OpenClawCitizenProjectionAdapter()],
    });

    const citizen = service.createCitizen({
      citizen_id: 'citizen-alpha',
      project_id: 'proj-alpha',
      role_id: 'architect',
      display_name: 'Alpha Architect',
      persona: 'Systems thinker',
      boundaries: ['Keep runtime adapters outside core.'],
      skills_ref: ['system-design'],
      runtime_projection: {
        adapter: 'openclaw',
        auto_provision: false,
      },
    });

    expect(service.listCitizens('proj-alpha')).toEqual([
      expect.objectContaining({
        citizen_id: 'citizen-alpha',
        project_id: 'proj-alpha',
      }),
    ]);
    expect(citizen.display_name).toBe('Alpha Architect');

    const preview = service.previewProjection('citizen-alpha');
    expect(preview.adapter).toBe('openclaw');
    expect(preview.files).toEqual([
      expect.objectContaining({
        path: '.openclaw/citizens/citizen-alpha/profile.json',
      }),
      expect.objectContaining({
        path: '.openclaw/citizens/citizen-alpha/brain/03-citizen-scaffold.md',
      }),
    ]);
    expect(preview.files[1]?.content).toContain('Think in systems.');
    expect(preview.files[1]?.content).toContain('Keep runtime adapters outside core.');
  });
});
