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
      locale: 'zh-CN',
      state: 'active',
      archive_status: null,
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
        stale_agents: 1,
        disconnected_agents: 0,
        busy_craftsmen: 1,
      },
      agents: [],
      craftsmen: [],
      channel_summaries: [
        {
          channel: 'discord',
          total_agents: 3,
          busy_agents: 1,
          online_agents: 1,
          stale_agents: 1,
          disconnected_agents: 0,
          offline_agents: 1,
          overall_presence: 'stale',
          last_seen_at: '2026-03-08T07:30:25.241Z',
          presence_reason: 'stale_gateway_log',
          affected_agents: [
            {
              id: 'main',
              status: 'busy',
              presence: 'online',
              presence_reason: 'live_session',
              last_seen_at: '2026-03-08T07:30:25.241Z',
              account_id: 'main',
            },
          ],
          history: [
            {
              occurred_at: '2026-03-08T07:30:25.241Z',
              agent_id: 'main',
              account_id: 'main',
              presence: 'online',
              reason: 'provider_start',
            },
          ],
          signal_status: 'healthy',
          last_signal_at: '2026-03-08T07:30:25.241Z',
          signal_counts: {
            ready_events: 1,
            restart_events: 0,
            transport_errors: 0,
          },
          signals: [
            {
              occurred_at: '2026-03-08T07:30:25.241Z',
              channel: 'discord',
              agent_id: 'main',
              account_id: 'main',
              kind: 'provider_ready',
              severity: 'info',
              detail: 'Main ready',
            },
          ],
        },
      ],
      host_summaries: [
        {
          host: 'openclaw',
          total_agents: 3,
          busy_agents: 1,
          online_agents: 1,
          stale_agents: 1,
          disconnected_agents: 0,
          offline_agents: 1,
          overall_presence: 'stale',
          last_seen_at: '2026-03-08T07:30:25.241Z',
          presence_reason: 'stale_gateway_log',
          affected_agents: [
            {
              id: 'main',
              status: 'busy',
              presence: 'online',
              presence_reason: 'live_session',
              last_seen_at: '2026-03-08T07:30:25.241Z',
              account_id: 'main',
            },
          ],
        },
      ],
      tmux_runtime: null,
    });

    expect(parsed.summary.active_tasks).toBe(1);
    expect(parsed.channel_summaries[0]?.channel).toBe('discord');
    expect(parsed.host_summaries[0]?.host).toBe('openclaw');
  });

  it('allows dashboard to parse tmux runtime continuity provenance fields', () => {
    const parsed = agentsStatusSchema.parse({
      summary: {
        active_tasks: 0,
        active_agents: 0,
        total_agents: 0,
        online_agents: 0,
        stale_agents: 0,
        disconnected_agents: 0,
        busy_craftsmen: 0,
      },
      agents: [],
      craftsmen: [],
      channel_summaries: [],
      host_summaries: [],
      tmux_runtime: {
        session: 'agora-craftsmen',
        panes: [
          {
            agent: 'gemini',
            pane_id: '%2',
            current_command: 'gemini',
            active: true,
            ready: true,
            tail_preview: 'tail',
            continuity_backend: 'gemini_session_id',
            resume_capability: 'native_resume',
            session_reference: '3d479f8c-ec0a-4b7f-9f92-123456789abc',
            identity_source: 'chat_file',
            identity_source_rank: 3,
            identity_conflict_count: 0,
            last_recovery_mode: 'resume_exact',
            transport_session_id: 'tmux:agora-craftsmen:gemini',
          },
        ],
      },
    });

    expect(parsed.tmux_runtime?.panes[0]?.identity_source).toBe('chat_file');
    expect(parsed.tmux_runtime?.panes[0]?.session_reference).toBe('3d479f8c-ec0a-4b7f-9f92-123456789abc');
  });
});
