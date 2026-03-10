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
        flow_log: [],
        progress_log: [],
        subtasks: [],
      }).task.id,
    ).toBe('OC-001');
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
