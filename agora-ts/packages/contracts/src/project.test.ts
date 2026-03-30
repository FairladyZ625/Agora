import { describe, expect, it } from 'vitest';
import {
  createProjectRequestSchema,
  listProjectsResponseSchema,
  projectSchema,
} from './project.js';
import {
  createProjectAgentRosterEntrySchema,
  projectAgentRosterSchema,
} from './project-agent-roster.js';
import {
  createProjectMembershipSchema,
  projectMembershipSchema,
} from './project-membership.js';

describe('project contracts', () => {
  it('parses create project payloads without requiring a caller-provided id', () => {
    expect(createProjectRequestSchema.parse({
      name: 'Alpha',
      summary: 'Thin slice',
      owner: 'archon',
      repo_path: '/tmp/alpha',
      initialize_repo: true,
      nomos_id: 'agora/default',
      admins: [{ account_id: 1 }],
      members: [{ account_id: 2, role: 'member' }],
      default_agents: [{ agent_ref: 'workspace-orchestrator', kind: 'orchestrator' }],
    })).toMatchObject({
      name: 'Alpha',
      owner: 'archon',
      repo_path: '/tmp/alpha',
      initialize_repo: true,
      nomos_id: 'agora/default',
      admins: [{ account_id: 1 }],
      members: [{ account_id: 2, role: 'member' }],
      default_agents: [{ agent_ref: 'workspace-orchestrator', kind: 'orchestrator' }],
    });
  });

  it('parses project records and list responses', () => {
    expect(projectSchema.parse({
      id: 'proj-alpha',
      name: 'Alpha',
      summary: null,
      status: 'active',
      owner: null,
      metadata: { tier: 'internal' },
      created_at: '2026-03-16T00:00:00.000Z',
      updated_at: '2026-03-16T00:00:00.000Z',
    }).status).toBe('active');

    expect(listProjectsResponseSchema.parse({
      projects: [{
        id: 'proj-alpha',
        name: 'Alpha',
        summary: null,
        status: 'active',
        owner: null,
        created_at: '2026-03-16T00:00:00.000Z',
        updated_at: '2026-03-16T00:00:00.000Z',
      }],
    }).projects).toHaveLength(1);
  });

  it('parses project membership contracts with minimal admin member roles', () => {
    expect(projectMembershipSchema.parse({
      id: 'pm-1',
      project_id: 'proj-alpha',
      account_id: 7,
      role: 'admin',
      status: 'active',
      added_by_account_id: 1,
      created_at: '2026-03-30T00:00:00.000Z',
      updated_at: '2026-03-30T00:00:00.000Z',
    })).toMatchObject({
      role: 'admin',
      status: 'active',
    });

    expect(createProjectMembershipSchema.parse({
      account_id: 8,
      role: 'member',
    })).toMatchObject({
      account_id: 8,
      role: 'member',
    });
  });

  it('parses project agent roster contracts with orchestrator worker specialist kinds', () => {
    expect(projectAgentRosterSchema.parse({
      id: 'par-1',
      project_id: 'proj-alpha',
      agent_ref: 'workspace-orchestrator',
      kind: 'orchestrator',
      default_inclusion: true,
      status: 'active',
      created_at: '2026-03-30T00:00:00.000Z',
      updated_at: '2026-03-30T00:00:00.000Z',
    })).toMatchObject({
      kind: 'orchestrator',
      default_inclusion: true,
    });

    expect(createProjectAgentRosterEntrySchema.parse({
      agent_ref: 'project-worker',
      kind: 'worker',
    })).toMatchObject({
      agent_ref: 'project-worker',
      kind: 'worker',
    });
  });
});
