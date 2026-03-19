import { describe, expect, it } from 'vitest';
import { StageRosterService } from './stage-roster-service.js';

describe('stage roster service', () => {
  it('falls back to all interactive team members when stage roster is missing', () => {
    const service = new StageRosterService();

    const plan = service.buildPlan({
      members: [
        { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
        { role: 'developer', agentId: 'sonnet', member_kind: 'citizen', model_preference: 'fast_coding' },
        { role: 'craftsman', agentId: 'codex', member_kind: 'craftsman', model_preference: 'coding_cli' },
      ],
    }, {
      id: 'build',
      mode: 'execute',
    }, []);

    expect(plan).toEqual({
      desired_refs: ['opus', 'sonnet'],
      to_join: ['opus', 'sonnet'],
      to_leave: [],
    });
  });

  it('selects stage-specific reviewers, preserves controller by default, and computes join/leave diffs', () => {
    const service = new StageRosterService();

    const plan = service.buildPlan({
      members: [
        { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
        { role: 'developer', agentId: 'sonnet', member_kind: 'citizen', model_preference: 'fast_coding' },
        { role: 'reviewer', agentId: 'glm5', member_kind: 'citizen', model_preference: 'review' },
      ],
    }, {
      id: 'review',
      mode: 'discuss',
      roster: {
        include_roles: ['reviewer'],
        exclude_agents: ['sonnet'],
      },
    }, [
      {
        id: 'pb-opus',
        task_id: 'OC-1',
        binding_id: 'binding-1',
        agent_ref: 'opus',
        runtime_provider: 'openclaw',
        task_role: 'architect',
        source: 'template',
        join_status: 'joined',
        desired_exposure: 'in_thread',
        exposure_reason: 'controller_preserved',
        exposure_stage_id: 'review',
        reconciled_at: '2026-03-16T00:00:00.000Z',
        created_at: '2026-03-16T00:00:00.000Z',
        joined_at: '2026-03-16T00:00:00.000Z',
        left_at: null,
      },
      {
        id: 'pb-sonnet',
        task_id: 'OC-1',
        binding_id: 'binding-1',
        agent_ref: 'sonnet',
        runtime_provider: 'openclaw',
        task_role: 'developer',
        source: 'template',
        join_status: 'joined',
        desired_exposure: 'hidden',
        exposure_reason: 'stage_roster_excluded',
        exposure_stage_id: 'review',
        reconciled_at: '2026-03-16T00:00:00.000Z',
        created_at: '2026-03-16T00:00:00.000Z',
        joined_at: '2026-03-16T00:00:00.000Z',
        left_at: null,
      },
      {
        id: 'pb-glm5',
        task_id: 'OC-1',
        binding_id: 'binding-1',
        agent_ref: 'glm5',
        runtime_provider: null,
        task_role: 'reviewer',
        source: 'template',
        join_status: 'left',
        desired_exposure: 'in_thread',
        exposure_reason: 'stage_roster_selected',
        exposure_stage_id: 'review',
        reconciled_at: '2026-03-16T00:00:00.000Z',
        created_at: '2026-03-16T00:00:00.000Z',
        joined_at: '2026-03-16T00:00:00.000Z',
        left_at: '2026-03-16T00:10:00.000Z',
      },
    ]);

    expect(plan).toEqual({
      desired_refs: ['opus', 'glm5'],
      to_join: ['glm5'],
      to_leave: ['sonnet'],
    });
  });

  it('can explicitly drop the controller from a stage roster', () => {
    const service = new StageRosterService();

    expect(service.resolveDesiredRefs({
      members: [
        { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
        { role: 'reviewer', agentId: 'glm5', member_kind: 'citizen', model_preference: 'review' },
      ],
    }, {
      id: 'review',
      roster: {
        include_roles: ['reviewer'],
        keep_controller: false,
      },
    })).toEqual(['glm5']);
  });
});
