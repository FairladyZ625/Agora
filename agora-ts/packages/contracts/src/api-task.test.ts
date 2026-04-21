import { describe, expect, it } from 'vitest';
import {
  approveTaskRequestSchema,
  createSubtasksRequestSchema,
  createSubtasksResponseSchema,
  createTaskRequestSchema,
  currentImTaskApproveRequestSchema,
  currentImTaskContextRequestSchema,
  currentImTaskRejectRequestSchema,
  probeInactiveTasksRequestSchema,
  taskStatusSchema,
  workflowSchema,
  teamSchema,
} from './task-api.js';

describe('task api contracts', () => {
  it('parses create task payloads', () => {
    expect(
      createTaskRequestSchema.parse({
        title: '实现认证中间件',
        type: 'coding',
        creator: 'archon',
        description: '给 API 加认证',
        priority: 'high',
        project_id: 'proj-auth',
      }).type,
    ).toBe('coding');
    expect(
      createTaskRequestSchema.parse({
        title: '实现认证中间件',
        type: 'coding',
        creator: 'archon',
        description: '给 API 加认证',
        priority: 'high',
        project_id: 'proj-auth',
      }).project_id,
    ).toBe('proj-auth');
  });

  it('parses create task payloads with team/workflow/im target overrides', () => {
    expect(
      createTaskRequestSchema.parse({
        title: '定向拉起 coding 任务',
        type: 'coding',
        creator: 'archon',
        description: '覆盖模板默认 team',
        priority: 'high',
        team_override: {
          members: [
            {
              role: 'architect',
              agentId: 'opus',
              member_kind: 'controller',
              model_preference: 'strong_reasoning',
              agent_origin: 'agora_managed',
              briefing_mode: 'overlay_delta',
            },
            { role: 'developer', agentId: 'sonnet', member_kind: 'citizen', model_preference: 'fast_coding' },
            { role: 'craftsman', agentId: 'codex', member_kind: 'craftsman', model_preference: 'coding_cli' },
          ],
        },
        workflow_override: {
          type: 'custom',
          stages: [
            { id: 'triage', mode: 'discuss', gate: { type: 'command' } },
            { id: 'ship', mode: 'execute', gate: { type: 'all_subtasks_done' } },
          ],
        },
        im_target: {
          provider: 'discord',
          conversation_ref: 'channel-123',
          visibility: 'private',
          participant_refs: ['opus', 'sonnet'],
        },
      }).team_override?.members[2]?.member_kind,
    ).toBe('craftsman');
    expect(
      createTaskRequestSchema.parse({
        title: '定向拉起 coding 任务',
        type: 'coding',
        creator: 'archon',
        description: '覆盖模板默认 team',
        priority: 'high',
        team_override: {
          members: [
            {
              role: 'architect',
              agentId: 'opus',
              member_kind: 'controller',
              model_preference: 'strong_reasoning',
              agent_origin: 'agora_managed',
              briefing_mode: 'overlay_delta',
            },
          ],
        },
      }).team_override?.members[0]?.briefing_mode,
    ).toBe('overlay_delta');
  });

  it('parses task status responses with runtime target selection metadata on team members', () => {
    expect(
      taskStatusSchema.parse({
        task: {
          id: 'OC-RT-001',
          version: 1,
          title: 'runtime target metadata',
          description: null,
          type: 'coding',
          priority: 'normal',
          creator: 'archon',
          locale: 'zh-CN',
          project_id: 'proj-runtime',
          state: 'active',
          archive_status: null,
          current_stage: 'build',
          controller_ref: null,
          authority: null,
          skill_policy: null,
          created_at: '2026-04-21T12:00:00.000Z',
          updated_at: '2026-04-21T12:00:00.000Z',
          team: {
            members: [
              {
                role: 'developer',
                agentId: 'cc-connect:agora-codex',
                member_kind: 'citizen',
                model_preference: 'codex',
                runtime_target_ref: 'cc-connect:agora-codex',
                runtime_flavor: 'codex',
                runtime_selection_source: 'project_flavor_default',
                runtime_selection_reason: 'project runtime_targets.flavors.codex',
              },
            ],
          },
          workflow: {
            type: 'custom',
            stages: [
              { id: 'build', mode: 'execute', gate: { type: 'command' } },
            ],
          },
          control: null,
          scheduler: null,
          scheduler_snapshot: null,
          discord: null,
          metrics: null,
          error_detail: null,
        },
        flow_log: [],
        progress_log: [],
        subtasks: [],
      }).task.team?.members[0]?.runtime_selection_reason,
    ).toBe('project runtime_targets.flavors.codex');
  });

  it('parses create task payloads with member kind hints for orchestration control', () => {
    expect(
      createTaskRequestSchema.parse({
        title: 'controller aware task',
        type: 'coding',
        creator: 'archon',
        description: 'mark controller/citizen/craftsman separately',
        priority: 'normal',
        team_override: {
          members: [
            { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
            { role: 'developer', agentId: 'sonnet', member_kind: 'citizen', model_preference: 'fast_coding' },
            { role: 'craftsman', agentId: 'codex', member_kind: 'craftsman', model_preference: 'coding_cli' },
          ],
        },
      }).team_override?.members[0]?.member_kind,
    ).toBe('controller');
  });

  it('parses create task payloads with global and role-scoped skill policy', () => {
    expect(
      createTaskRequestSchema.parse({
        title: 'task with skill policy',
        type: 'coding',
        creator: 'archon',
        description: 'inject required skills into briefing',
        priority: 'normal',
        skill_policy: {
          global_refs: ['planning-with-files', 'agora-bootstrap'],
          role_refs: {
            architect: ['brainstorming'],
            developer: ['refactoring-ui'],
          },
          enforcement: 'required',
        },
      }).skill_policy,
    ).toEqual({
      global_refs: ['planning-with-files', 'agora-bootstrap'],
      role_refs: {
        architect: ['brainstorming'],
        developer: ['refactoring-ui'],
      },
      enforcement: 'required',
    });
  });

  it('parses create task payloads with orchestrator direct-create intake metadata', () => {
    expect(
      createTaskRequestSchema.parse({
        title: 'orchestrator direct create',
        type: 'coding',
        creator: 'workspace-orchestrator',
        description: '',
        priority: 'high',
        control: {
          mode: 'normal',
          orchestrator_intake: {
            kind: 'direct_create',
            source: 'conversation',
            confirmation_mode: 'oral',
            orchestrator_ref: 'workspace-orchestrator',
            confirmed_by: 'archon',
            confirmed_at: '2026-04-10T11:05:00.000Z',
            source_ref: 'discord:thread-123',
          },
        },
      }).control?.orchestrator_intake?.confirmation_mode,
    ).toBe('oral');
  });

  it('parses task status responses with nested flow/progress/subtasks', () => {
    expect(
      taskStatusSchema.parse({
        task: {
          id: 'OC-001',
          version: 1,
          title: '任务',
          description: null,
          type: 'coding',
          priority: 'normal',
          creator: 'archon',
          locale: 'zh-CN',
          project_id: 'proj-alpha',
          state: 'active',
          archive_status: null,
          controller_ref: 'opus',
          current_stage: 'develop',
          skill_policy: {
            global_refs: ['planning-with-files'],
            role_refs: {
              developer: ['refactoring-ui'],
            },
            enforcement: 'required',
          },
          team: { members: [] },
          workflow: { stages: [] },
          scheduler: null,
          scheduler_snapshot: null,
          discord: null,
          metrics: null,
          error_detail: null,
          created_at: '2026-03-08T00:00:00Z',
          updated_at: '2026-03-08T00:00:00Z',
        },
        task_blueprint: {
          graph_version: 1,
          entry_nodes: ['develop'],
          controller_ref: 'opus',
          nodes: [
            { id: 'develop', name: '开发', mode: 'execute', gate_type: 'all_subtasks_done' },
            { id: 'review', name: '审查', mode: 'discuss', gate_type: 'approval' },
          ],
          edges: [
            { from: 'develop', to: 'review', kind: 'advance' },
            { from: 'review', to: 'develop', kind: 'reject' },
          ],
          artifact_contracts: [
            { node_id: 'develop', artifact_type: 'stage_output' },
          ],
          role_bindings: [
            { role: 'developer', agentId: 'sonnet', model_preference: 'fast_coding' },
          ],
        },
        current_stage_roster: {
          stage_id: 'develop',
          roster: {
            include_roles: ['developer'],
            keep_controller: true,
          },
          desired_participant_refs: ['opus', 'sonnet'],
          joined_participant_refs: ['opus'],
          participant_states: [
            {
              agent_ref: 'opus',
              task_role: 'architect',
              join_status: 'joined',
              desired_exposure: 'in_thread',
              exposure_reason: 'controller_preserved',
              runtime_provider: 'openclaw',
              runtime_session_ref: 'session-opus',
              presence_state: 'active',
              runtime_binding_reason: 'controller_preserved',
              desired_runtime_presence: 'attached',
              runtime_reconcile_stage_id: 'develop',
              runtime_reconciled_at: '2026-03-17T10:00:00Z',
              runtime_closed_at: null,
            },
            {
              agent_ref: 'sonnet',
              task_role: 'developer',
              join_status: 'pending',
              desired_exposure: 'in_thread',
              exposure_reason: 'stage_roster_selected',
              runtime_provider: null,
              runtime_session_ref: null,
              presence_state: null,
              runtime_binding_reason: null,
              desired_runtime_presence: null,
              runtime_reconcile_stage_id: null,
              runtime_reconciled_at: null,
              runtime_closed_at: null,
            },
          ],
        },
        flow_log: [],
        progress_log: [],
        subtasks: [],
      }),
    ).toMatchObject({
      task: {
        id: 'OC-001',
        archive_status: null,
        controller_ref: 'opus',
        project_id: 'proj-alpha',
        skill_policy: {
          global_refs: ['planning-with-files'],
          role_refs: {
            developer: ['refactoring-ui'],
          },
          enforcement: 'required',
        },
      },
      task_blueprint: {
        entry_nodes: ['develop'],
        controller_ref: 'opus',
      },
      current_stage_roster: {
        stage_id: 'develop',
        desired_participant_refs: ['opus', 'sonnet'],
        joined_participant_refs: ['opus'],
        participant_states: expect.arrayContaining([
          expect.objectContaining({
            agent_ref: 'opus',
            desired_exposure: 'in_thread',
            exposure_reason: 'controller_preserved',
            runtime_binding_reason: 'controller_preserved',
            desired_runtime_presence: 'attached',
          }),
        ]),
      },
    });
  });

  it('parses approve action payloads', () => {
    expect(
      approveTaskRequestSchema.parse({
        approver_id: 'glm5',
        comment: 'looks good',
      }).approver_id,
    ).toBe('glm5');
  });

  it('parses thread-scoped IM approval payloads', () => {
    expect(currentImTaskApproveRequestSchema.parse({
      thread_ref: 'thread-123',
      actor_id: 'reviewer-1',
      comment: 'ship it',
    }).thread_ref).toBe('thread-123');
    expect(currentImTaskRejectRequestSchema.parse({
      conversation_ref: 'channel-1',
      actor_id: 'reviewer-1',
      reason: 'needs more tests',
    }).conversation_ref).toBe('channel-1');
    expect(currentImTaskContextRequestSchema.parse({
      thread_ref: 'thread-123',
      audience: 'craftsman',
      allowed_citizen_ids: ['citizen-alpha'],
    }).audience).toBe('craftsman');
  });

  it('rejects invalid participant/runtime state values in current stage roster payloads', () => {
    expect(() => taskStatusSchema.parse({
      task: {
        id: 'OC-BAD-ROSTER',
        version: 1,
        title: 'bad roster',
        description: null,
        type: 'coding',
        priority: 'normal',
        creator: 'archon',
        locale: 'zh-CN',
        project_id: null,
        state: 'active',
        archive_status: null,
        controller_ref: 'glm5',
        current_stage: 'draft',
        skill_policy: null,
        team: { members: [] },
        workflow: { stages: [] },
        scheduler: null,
        scheduler_snapshot: null,
        discord: null,
        metrics: null,
        control: null,
        authority: null,
        error_detail: null,
        created_at: '2026-04-13T00:00:00.000Z',
        updated_at: '2026-04-13T00:00:00.000Z',
      },
      flow: [],
      progress: [],
      subtasks: [],
      current_stage_roster: {
        stage_id: 'draft',
        desired_participant_refs: ['glm5'],
        joined_participant_refs: ['glm5'],
        participant_states: [
          {
            agent_ref: 'glm5',
            task_role: 'citizen',
            join_status: 'waiting',
            desired_exposure: 'in_thread',
            exposure_reason: 'stage_roster_selected',
            runtime_provider: 'relay',
            runtime_session_ref: null,
            presence_state: 'running',
          },
        ],
      },
    })).toThrow();
  });

  it('parses probe inactive tasks payloads', () => {
    expect(probeInactiveTasksRequestSchema.parse({
      controller_after_ms: 1000,
      roster_after_ms: 2000,
      inbox_after_ms: 3000,
    }).inbox_after_ms).toBe(3000);
  });

  it('parses create subtasks request/response payloads', () => {
    expect(createSubtasksRequestSchema.parse({
      caller_id: 'opus',
      subtasks: [
        {
          id: 'build-api',
          title: 'Build API',
          assignee: 'sonnet',
          execution_target: 'craftsman',
          craftsman: {
            adapter: 'codex',
            mode: 'one_shot',
            workdir: '/tmp/build-api',
          },
        },
      ],
    })).toMatchObject({
      caller_id: 'opus',
      subtasks: [
        {
          id: 'build-api',
          execution_target: 'craftsman',
          craftsman: {
            adapter: 'codex',
            mode: 'one_shot',
          },
        },
      ],
    });

    expect(createSubtasksResponseSchema.parse({
      task: {
        id: 'OC-SUBTASK-1',
        version: 1,
        title: 'Subtask create',
        description: null,
        type: 'coding',
        priority: 'normal',
        creator: 'archon',
        locale: 'zh-CN',
        state: 'active',
        archive_status: null,
        controller_ref: 'opus',
        current_stage: 'develop',
        team: { members: [] },
        workflow: { stages: [] },
        scheduler: null,
        scheduler_snapshot: null,
        discord: null,
        metrics: null,
        error_detail: null,
        created_at: '2026-03-13T00:00:00.000Z',
        updated_at: '2026-03-13T00:00:00.000Z',
      },
      subtasks: [
        {
          id: 'build-api',
          task_id: 'OC-SUBTASK-1',
          stage_id: 'develop',
          title: 'Build API',
          assignee: 'sonnet',
          status: 'in_progress',
          output: null,
          craftsman_type: 'codex',
          craftsman_session: 'tmux:codex-1',
          craftsman_workdir: '/tmp/build-api',
          craftsman_prompt: null,
          dispatch_status: 'running',
          dispatched_at: '2026-03-13T00:00:00.000Z',
          done_at: null,
        },
      ],
      dispatched_executions: [
        {
          execution_id: 'exec-subtask-1',
          task_id: 'OC-SUBTASK-1',
          subtask_id: 'build-api',
          adapter: 'codex',
          mode: 'one_shot',
          session_id: 'tmux:codex-1',
          status: 'running',
          brief_path: null,
          workdir: '/tmp/build-api',
          callback_payload: null,
          error: null,
          started_at: '2026-03-13T00:00:00.000Z',
          finished_at: null,
          created_at: '2026-03-13T00:00:00.000Z',
          updated_at: '2026-03-13T00:00:00.000Z',
        },
      ],
    }).dispatched_executions[0]?.execution_id).toBe('exec-subtask-1');
  });

  it('accepts team members with empty model_preference for legacy and quick tasks', () => {
    expect(
      teamSchema.parse({
        members: [{ role: 'executor', agentId: 'haiku', model_preference: '' }],
      }).members[0]?.model_preference,
    ).toBe('');
  });

  it('rejects multiple controller members in a single team override', () => {
    expect(() =>
      teamSchema.parse({
        members: [
          { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
          { role: 'developer', agentId: 'sonnet', member_kind: 'controller', model_preference: 'fast_coding' },
        ],
      }),
    ).toThrow(/more than one controller/i);
  });

  it('rejects unsupported workflow gate and mode values', () => {
    expect(() =>
      workflowSchema.parse({
        type: 'linear',
        stages: [{ id: 'draft', mode: 'sidequest', gate: { type: 'magic_gate' } }],
      }),
    ).toThrow();
  });

  it('rejects unsupported team roles', () => {
    expect(() =>
      teamSchema.parse({
        members: [{ role: 'wizard', agentId: 'opus', model_preference: 'reasoning' }],
      }),
    ).toThrow();
  });

  it('rejects invalid workflow gate field combinations', () => {
    expect(() =>
      workflowSchema.parse({
        type: 'linear',
        stages: [{ id: 'review', gate: { type: 'approval' } }],
      }),
    ).toThrow(/approver/i);

    expect(() =>
      workflowSchema.parse({
        type: 'linear',
        stages: [{ id: 'vote', gate: { type: 'quorum', required: 1 } }],
      }),
    ).toThrow(/required/i);

    expect(() =>
      workflowSchema.parse({
        type: 'linear',
        stages: [{ id: 'wait', gate: { type: 'auto_timeout' } }],
      }),
    ).toThrow(/timeout_sec/i);

    expect(() =>
      workflowSchema.parse({
        type: 'linear',
        stages: [{ id: 'draft', gate: { type: 'command', approver: 'reviewer' } }],
      }),
    ).toThrow(/must not declare approver/i);
  });

  it('rejects duplicate workflow stage ids', () => {
    expect(() =>
      workflowSchema.parse({
        type: 'linear',
        stages: [
          { id: 'draft', gate: { type: 'command' } },
          { id: 'draft', gate: { type: 'archon_review' } },
        ],
      }),
    ).toThrow(/duplicate stage id/i);
  });

  it('rejects graph branch condition fields because explicit next_stage_id remains the only supported branch selector', () => {
    expect(() =>
      workflowSchema.parse({
        type: 'custom',
        stages: [
          { id: 'triage', gate: { type: 'command' } },
          { id: 'fast-path', gate: { type: 'command' } },
          { id: 'deep-review', gate: { type: 'approval', approver: 'reviewer' } },
        ],
        graph: {
          graph_version: 1,
          entry_nodes: ['triage'],
          nodes: [
            { id: 'triage', kind: 'stage', gate: { type: 'command' } },
            { id: 'fast-path', kind: 'stage', gate: { type: 'command' } },
            { id: 'deep-review', kind: 'stage', gate: { type: 'approval', approver: 'reviewer' } },
          ],
          edges: [
            { id: 'triage__branch__fast-path', from: 'triage', to: 'fast-path', kind: 'branch', condition: 'score < 0.5' },
            { id: 'triage__branch__deep-review', from: 'triage', to: 'deep-review', kind: 'branch' },
          ],
        },
      }),
    ).toThrow();
  });

  it('parses timeout edges and terminal contracts in task blueprints', () => {
    expect(
      taskStatusSchema.parse({
        task: {
          id: 'OC-TIMEOUT-BLUEPRINT',
          version: 1,
          title: 'timeout blueprint',
          description: null,
          type: 'custom',
          priority: 'normal',
          creator: 'archon',
          locale: 'zh-CN',
          state: 'active',
          archive_status: null,
          current_stage: 'wait',
          team: { members: [] },
          workflow: { stages: [] },
          scheduler: null,
          scheduler_snapshot: null,
          discord: null,
          metrics: null,
          error_detail: null,
          created_at: '2026-04-11T00:00:00Z',
          updated_at: '2026-04-11T00:00:00Z',
        },
        task_blueprint: {
          graph_version: 1,
          entry_nodes: ['wait'],
          nodes: [
            { id: 'wait', kind: 'stage', name: 'Wait', mode: 'discuss', gate_type: 'auto_timeout' },
            { id: 'escalate', kind: 'stage', name: 'Escalate', mode: 'discuss', gate_type: 'command' },
            {
              id: 'done',
              kind: 'terminal',
              name: 'Done',
              mode: null,
              gate_type: null,
              terminal: {
                outcome: 'timed_out_done',
                summary: 'Timed out into terminal closeout',
              },
            },
          ],
          edges: [
            { from: 'wait', to: 'escalate', kind: 'timeout' },
            { from: 'escalate', to: 'done', kind: 'complete' },
          ],
          artifact_contracts: [],
          role_bindings: [],
        },
        flow_log: [],
        progress_log: [],
        subtasks: [],
      }).task_blueprint?.nodes[2]?.terminal?.outcome,
    ).toBe('timed_out_done');
  });

  it('supports reject_target backedges to earlier stages and rejects invalid targets', () => {
    expect(
      workflowSchema.parse({
        type: 'linear',
        stages: [
          { id: 'draft', gate: { type: 'command' } },
          { id: 'review', gate: { type: 'approval', approver: 'reviewer' }, reject_target: 'draft' },
        ],
      }).stages?.[1]?.reject_target,
    ).toBe('draft');

    expect(() =>
      workflowSchema.parse({
        type: 'linear',
        stages: [
          { id: 'draft', gate: { type: 'command' } },
          { id: 'review', gate: { type: 'approval', approver: 'reviewer' }, reject_target: 'missing' },
        ],
      }),
    ).toThrow(/unknown reject_target/i);

    expect(() =>
      workflowSchema.parse({
        type: 'linear',
        stages: [
          { id: 'draft', gate: { type: 'command' }, reject_target: 'draft' },
        ],
      }),
    ).toThrow(/must reference an earlier stage/i);

    expect(() =>
      workflowSchema.parse({
        type: 'linear',
        stages: [
          { id: 'draft', gate: { type: 'command' } },
          { id: 'review', gate: { type: 'approval', approver: 'reviewer' }, reject_target: 'review' },
        ],
      }),
    ).toThrow(/must reference an earlier stage/i);
  });

  it('accepts explicit workflow execution semantics and allowed actions', () => {
    expect(
      workflowSchema.parse({
        type: 'linear',
        stages: [
          {
            id: 'implement',
            mode: 'execute',
            execution_kind: 'craftsman_dispatch',
            allowed_actions: ['dispatch_craftsman'],
            gate: { type: 'all_subtasks_done' },
          },
        ],
      }).stages?.[0],
    ).toMatchObject({
      execution_kind: 'craftsman_dispatch',
      allowed_actions: ['dispatch_craftsman'],
    });

    expect(() => createSubtasksRequestSchema.parse({
      caller_id: 'opus',
      subtasks: [
        {
          id: 'manual-build',
          title: 'Manual Build',
          assignee: 'sonnet',
        },
      ],
    })).toThrow(/execution_target/i);
  });

  it('accepts stage roster semantics and rejects empty roster objects', () => {
    expect(
      workflowSchema.parse({
        type: 'linear',
        stages: [
          {
            id: 'review',
            mode: 'discuss',
            roster: {
              include_roles: ['reviewer'],
              include_agents: ['opus'],
              exclude_agents: ['sonnet'],
              keep_controller: true,
            },
            gate: { type: 'approval', approver: 'reviewer' },
          },
        ],
      }).stages?.[0]?.roster,
    ).toMatchObject({
      include_roles: ['reviewer'],
      include_agents: ['opus'],
      exclude_agents: ['sonnet'],
      keep_controller: true,
    });

    expect(() =>
      workflowSchema.parse({
        type: 'linear',
        stages: [
          {
            id: 'review',
            roster: {},
            gate: { type: 'command' },
          },
        ],
      }),
    ).toThrow(/stage roster must declare/i);
  });
});
