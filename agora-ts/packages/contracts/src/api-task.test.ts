import { describe, expect, it } from 'vitest';
import {
  approveTaskRequestSchema,
  createTaskRequestSchema,
  taskStatusSchema,
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
});
