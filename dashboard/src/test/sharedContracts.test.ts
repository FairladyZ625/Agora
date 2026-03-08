import { describe, expect, it } from 'vitest';
import { agentsStatusSchema, taskSchema } from '@agora-ts/contracts';

describe('shared contracts', () => {
  it('allows dashboard to import and parse task dto schemas from agora-ts', () => {
    const parsed = taskSchema.parse({
      id: 'OC-900',
      version: 1,
      title: 'shared contract task',
      description: null,
      type: 'coding',
      priority: 'high',
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
      created_at: '2026-03-08T00:00:00.000Z',
      updated_at: '2026-03-08T00:00:00.000Z',
    });

    expect(parsed.id).toBe('OC-900');
  });

  it('allows dashboard to import and parse dashboard dto schemas from agora-ts', () => {
    const parsed = agentsStatusSchema.parse({
      summary: {
        active_tasks: 1,
        active_agents: 2,
        total_agents: 3,
        online_agents: 2,
        busy_craftsmen: 1,
      },
      agents: [],
      craftsmen: [],
    });

    expect(parsed.summary.active_tasks).toBe(1);
  });
});
