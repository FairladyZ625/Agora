import { describe, expect, it } from 'vitest';
import { taskPrioritySchema, taskStateSchema } from './task.js';
import { agentsStatusSchema, todoItemSchema } from './dashboard.js';

describe('agora-ts contracts bootstrap', () => {
  it('parses canonical task states and rejects invalid values', () => {
    expect(taskStateSchema.parse('active')).toBe('active');
    expect(taskStateSchema.parse('done')).toBe('done');
    expect(() => taskStateSchema.parse('unknown')).toThrow();
  });

  it('parses task priorities', () => {
    expect(taskPrioritySchema.parse('normal')).toBe('normal');
    expect(() => taskPrioritySchema.parse('critical')).toThrow();
    expect(() => taskPrioritySchema.parse('urgent')).toThrow();
  });

  it('parses dashboard expansion DTOs', () => {
    expect(
      agentsStatusSchema.parse({
        summary: {
          active_tasks: 1,
          active_agents: 2,
          total_agents: 3,
          online_agents: 2,
          stale_agents: 1,
          disconnected_agents: 0,
          busy_craftsmen: 0,
        },
        agents: [{
          id: 'main',
          role: null,
          status: 'busy',
          presence: 'online',
          presence_reason: 'live_session',
          active_task_ids: [],
          active_subtask_ids: [],
          load: 1,
          last_active_at: null,
          last_seen_at: '2026-03-08T00:00:00.000Z',
          provider: 'discord',
          account_id: 'main',
          source: 'openclaw+discord',
          primary_model: 'openai-codex/gpt-5.4',
          workspace_dir: '/tmp/main',
        }],
        craftsmen: [],
      }).summary.active_tasks,
    ).toBe(1);

    expect(
      todoItemSchema.parse({
        id: 1,
        text: '补 TS workspace',
        status: 'pending',
        due: null,
        created_at: '2026-03-07T00:00:00Z',
        completed_at: null,
        tags: [],
        promoted_to: null,
      }).status,
    ).toBe('pending');
  });
});
