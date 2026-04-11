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
import { CcConnectCitizenProjectionAdapter } from '@agora-ts/adapters-cc-connect';
import { CitizenService } from './citizen-service.js';
import { ProjectAgentRosterService } from './project-agent-roster-service.js';
import { ProjectMembershipService } from './project-membership-service.js';
import { ProjectService } from './project-service.js';
import { RolePackService } from './role-pack-service.js';

const tempPaths: string[] = [];

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-citizen-service-cc-connect-'));
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

describe('citizen service cc-connect projection', () => {
  it('creates citizens and renders cc-connect previews', () => {
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
      projectionPorts: [new CcConnectCitizenProjectionAdapter()],
    });

    service.createCitizen({
      citizen_id: 'citizen-cc',
      project_id: 'proj-alpha',
      role_id: 'architect',
      display_name: 'CC Architect',
      persona: 'Systems thinker',
      boundaries: ['Keep provider state outside core.'],
      skills_ref: ['system-design'],
      channel_policies: {},
      brain_scaffold_mode: 'role_default',
      runtime_projection: {
        adapter: 'cc-connect',
        auto_provision: false,
        metadata: {},
      },
    });

    const preview = service.previewProjection('citizen-cc');
    expect(preview.adapter).toBe('cc-connect');
    expect(preview.files).toEqual([
      expect.objectContaining({
        path: '.cc-connect/citizens/citizen-cc/profile.json',
      }),
      expect.objectContaining({
        path: '.cc-connect/citizens/citizen-cc/brain/03-citizen-scaffold.md',
      }),
    ]);
    expect(preview.files[1]?.content).toContain('bridge_host: `cc-connect`');
    expect(preview.files[1]?.content).toContain('Keep provider state outside core.');
    expect(preview.metadata).toEqual({
      project_id: 'proj-alpha',
      role_id: 'architect',
      auto_provision: false,
      bridge_host: 'cc-connect',
    });

    db.close();
  });
});
