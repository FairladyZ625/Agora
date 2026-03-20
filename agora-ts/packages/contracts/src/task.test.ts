import { describe, expect, it } from 'vitest';
import { taskPrioritySchema, taskStateSchema } from './task.js';
import {
  agentsStatusSchema,
  dashboardSessionLoginRequestSchema,
  dashboardSessionStatusResponseSchema,
  dashboardUserBindIdentityRequestSchema,
  dashboardUserCreateRequestSchema,
  dashboardUserListResponseSchema,
  todoItemSchema,
} from './dashboard.js';

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
          selectability: 'selectable',
          selectability_reason: 'live_session',
          presence_reason: 'live_session',
          active_task_ids: [],
          active_subtask_ids: [],
          load: 1,
          last_active_at: null,
          last_seen_at: '2026-03-08T00:00:00.000Z',
          channel_providers: ['discord'],
          host_framework: 'openclaw',
          inventory_sources: ['discord', 'openclaw'],
          account_id: 'main',
          primary_model: 'openai-codex/gpt-5.4',
          workspace_dir: '/tmp/main',
        }],
        craftsmen: [],
        channel_summaries: [{
          channel: 'discord',
          total_agents: 3,
          busy_agents: 1,
          online_agents: 2,
          stale_agents: 1,
          disconnected_agents: 0,
          offline_agents: 0,
          overall_presence: 'stale',
          last_seen_at: '2026-03-08T00:00:00.000Z',
          presence_reason: 'stale_gateway_log',
          affected_agents: [{
            id: 'main',
            status: 'busy',
            presence: 'online',
            presence_reason: 'live_session',
            last_seen_at: '2026-03-08T00:00:00.000Z',
            account_id: 'main',
          }],
          history: [{
            occurred_at: '2026-03-08T00:00:00.000Z',
            agent_id: 'main',
            account_id: 'main',
            presence: 'online',
            reason: 'provider_start',
          }],
          signal_status: 'healthy',
          last_signal_at: '2026-03-08T00:00:00.000Z',
          signal_counts: {
            ready_events: 1,
            restart_events: 0,
            transport_errors: 0,
          },
          signals: [{
            occurred_at: '2026-03-08T00:00:00.000Z',
            channel: 'discord',
            agent_id: 'main',
            account_id: 'main',
            kind: 'provider_ready',
            severity: 'info',
            detail: 'logged in',
          }],
        }],
        host_summaries: [{
          host: 'openclaw',
          total_agents: 1,
          busy_agents: 1,
          online_agents: 1,
          stale_agents: 0,
          disconnected_agents: 0,
          offline_agents: 0,
          overall_presence: 'online',
          last_seen_at: '2026-03-08T00:00:00.000Z',
          presence_reason: 'live_session',
          affected_agents: [{
            id: 'main',
            status: 'busy',
            presence: 'online',
            presence_reason: 'live_session',
            last_seen_at: '2026-03-08T00:00:00.000Z',
            account_id: 'main',
          }],
        }],
        craftsman_runtime: null,
      }).agents[0]?.selectability,
    ).toBe('selectable');

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
          selectability: 'selectable',
          selectability_reason: 'live_session',
          presence_reason: 'live_session',
          active_task_ids: [],
          active_subtask_ids: [],
          load: 1,
          last_active_at: null,
          last_seen_at: '2026-03-08T00:00:00.000Z',
          channel_providers: ['discord'],
          host_framework: 'openclaw',
          inventory_sources: ['discord', 'openclaw'],
          account_id: 'main',
          primary_model: 'openai-codex/gpt-5.4',
          workspace_dir: '/tmp/main',
        }],
        craftsmen: [],
        channel_summaries: [{
          channel: 'discord',
          total_agents: 3,
          busy_agents: 1,
          online_agents: 2,
          stale_agents: 1,
          disconnected_agents: 0,
          offline_agents: 0,
          overall_presence: 'stale',
          last_seen_at: '2026-03-08T00:00:00.000Z',
          presence_reason: 'stale_gateway_log',
          affected_agents: [{
            id: 'main',
            status: 'busy',
            presence: 'online',
            presence_reason: 'live_session',
            last_seen_at: '2026-03-08T00:00:00.000Z',
            account_id: 'main',
          }],
          history: [{
            occurred_at: '2026-03-08T00:00:00.000Z',
            agent_id: 'main',
            account_id: 'main',
            presence: 'online',
            reason: 'provider_start',
          }],
          signal_status: 'healthy',
          last_signal_at: '2026-03-08T00:00:00.000Z',
          signal_counts: {
            ready_events: 1,
            restart_events: 0,
            transport_errors: 0,
          },
          signals: [{
            occurred_at: '2026-03-08T00:00:00.000Z',
            channel: 'discord',
            agent_id: 'main',
            account_id: 'main',
            kind: 'provider_ready',
            severity: 'info',
            detail: 'logged in',
          }],
        }],
        host_summaries: [{
          host: 'openclaw',
          total_agents: 1,
          busy_agents: 1,
          online_agents: 1,
          stale_agents: 0,
          disconnected_agents: 0,
          offline_agents: 0,
          overall_presence: 'online',
          last_seen_at: '2026-03-08T00:00:00.000Z',
          presence_reason: 'live_session',
          affected_agents: [{
            id: 'main',
            status: 'busy',
            presence: 'online',
            presence_reason: 'live_session',
            last_seen_at: '2026-03-08T00:00:00.000Z',
            account_id: 'main',
          }],
        }],
        craftsman_runtime: null,
      }).summary.active_tasks,
    ).toBe(1);

    expect(
      todoItemSchema.parse({
        id: 1,
        text: '补 TS workspace',
        project_id: 'proj-alpha',
        status: 'pending',
        due: null,
        created_at: '2026-03-07T00:00:00Z',
        completed_at: null,
        tags: [],
        promoted_to: null,
      }).status,
    ).toBe('pending');
  });

  it('parses dashboard session DTOs', () => {
    expect(dashboardSessionLoginRequestSchema.parse({
      username: 'lizeyu',
      password: 'secret-pass',
    })).toMatchObject({
      username: 'lizeyu',
      password: 'secret-pass',
    });

    expect(dashboardSessionStatusResponseSchema.parse({
      authenticated: true,
      method: 'session',
      username: 'lizeyu',
      role: 'admin',
    })).toMatchObject({
      authenticated: true,
      method: 'session',
      username: 'lizeyu',
      role: 'admin',
    });
  });

  it('parses dashboard user management DTOs', () => {
    expect(dashboardUserCreateRequestSchema.parse({
      username: 'alice',
      password: 'alice-pass',
    })).toMatchObject({
      username: 'alice',
      password: 'alice-pass',
    });

    expect(dashboardUserBindIdentityRequestSchema.parse({
      provider: 'discord',
      external_user_id: 'discord-user-123',
    })).toMatchObject({
      provider: 'discord',
      external_user_id: 'discord-user-123',
    });

    expect(dashboardUserListResponseSchema.parse({
      users: [{
        username: 'alice',
        role: 'member',
        enabled: true,
        identities: [{
          provider: 'discord',
          external_user_id: 'discord-user-123',
        }],
      }],
    }).users[0]?.username).toBe('alice');
  });
});
