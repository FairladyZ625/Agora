import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CitizenRepository,
  createAgoraDatabase,
  HumanAccountRepository,
  ProjectAgentRosterRepository,
  ProjectMembershipRepository,
  ProjectRepository,
  RoleBindingRepository,
  RoleDefinitionRepository,
  runMigrations,
  TaskRepository,
} from '@agora-ts/db';
import { OpenClawCitizenProjectionAdapter } from './adapters/openclaw-citizen-projection-adapter.js';
import { CitizenService } from './citizen-service.js';
import { ProjectAgentRosterService } from './project-agent-roster-service.js';
import { ProjectMembershipService } from './project-membership-service.js';
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
    const projectService = new ProjectService({
      projectRepository: new ProjectRepository(db),
      taskRepository: new TaskRepository(db),
      membershipService: new ProjectMembershipService({
        membershipRepository: new ProjectMembershipRepository(db),
        accountRepository: new HumanAccountRepository(db),
      }),
      agentRosterService: new ProjectAgentRosterService({
        repository: new ProjectAgentRosterRepository(db),
      }),
      transactionManager: {
        begin: () => db.exec('BEGIN'),
        commit: () => db.exec('COMMIT'),
        rollback: () => db.exec('ROLLBACK'),
      },
    });
    projectService.createProject({
      id: 'proj-alpha',
      name: 'Project Alpha',
    });
    const rolePackService = new RolePackService({
      roleDefinitions: new RoleDefinitionRepository(db),
      roleBindings: new RoleBindingRepository(db),
    });
    rolePackService.saveRoleDefinition({
      id: 'architect',
      name: 'Architect',
      member_kind: 'citizen',
      summary: 'Design systems.',
      prompt_asset: 'roles/architect.md',
      source: 'test',
      source_ref: null,
      default_model_preference: null,
      allowed_target_kinds: ['runtime_agent'],
      citizen_scaffold: {
        soul: 'Think in systems.',
        boundaries: ['Stay core-first.'],
        heartbeat: ['Restate objective.'],
        recap_expectations: ['Summarize next step.'],
      },
      metadata: {},
    });
    const service = new CitizenService({
      repository: new CitizenRepository(db),
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
      channel_policies: {},
      brain_scaffold_mode: 'role_default',
      runtime_projection: {
        adapter: 'openclaw',
        auto_provision: false,
        metadata: {},
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
    expect(preview.files[1]?.content).toContain('doc_type: citizen_scaffold');
    expect(preview.files[1]?.content).toContain('citizen_id: citizen-alpha');
  });
});
