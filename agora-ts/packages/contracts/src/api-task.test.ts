import { describe, expect, it } from 'vitest';
import {
  approveTaskRequestSchema,
  createTaskRequestSchema,
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
      }).type,
    ).toBe('coding');
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
            { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
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
        flow_log: [],
        progress_log: [],
        subtasks: [],
      }),
    ).toMatchObject({
      task: {
        id: 'OC-001',
        archive_status: null,
        controller_ref: 'opus',
      },
      task_blueprint: {
        entry_nodes: ['develop'],
        controller_ref: 'opus',
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
});
