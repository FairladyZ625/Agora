import { describe, expect, it } from 'vitest';
import type {
  ApiAgentsStatusDto,
  ApiArchiveJobDto,
  ApiTemplateDetailDto,
  ApiTemplateSummaryDto,
  ApiTodoDto,
} from '@/types/api';
import {
  mapAgentsStatusDto,
  mapArchiveJobDto,
  mapTemplateDetailDto,
  mapTemplateSummaryDto,
  mapTodoDto,
} from '@/lib/dashboardExpansionMappers';

describe('dashboard expansion mappers', () => {
  it('maps agent status payloads into stable dashboard view models', () => {
    const dto: ApiAgentsStatusDto = {
      summary: {
        active_tasks: 2,
        active_agents: 1,
        total_agents: 2,
        online_agents: 2,
        stale_agents: 1,
        disconnected_agents: 0,
        busy_craftsmen: 1,
      },
      agents: [
        {
          id: 'sonnet',
          role: 'developer',
          status: 'busy',
          presence: 'online',
          presence_reason: 'live_session',
          channel_providers: ['discord'],
          host_framework: 'openclaw',
          inventory_sources: ['openclaw'],
          primary_model: 'gac/claude-sonnet-4-6',
          workspace_dir: '/tmp/sonnet',
          active_task_ids: ['OC-101'],
          active_subtask_ids: ['dev-api'],
          load: 1,
          last_active_at: '2026-03-07T10:00:00.000Z',
          last_seen_at: '2026-03-07T10:01:00.000Z',
          account_id: 'sonnet',
        },
      ],
      channel_summaries: [
        {
          channel: 'discord',
          total_agents: 2,
          busy_agents: 1,
          online_agents: 1,
          stale_agents: 1,
          disconnected_agents: 0,
          offline_agents: 0,
          overall_presence: 'stale',
          last_seen_at: '2026-03-07T10:01:00.000Z',
          presence_reason: 'stale_gateway_log',
          affected_agents: [
            {
              id: 'sonnet',
              status: 'busy',
              presence: 'online',
              presence_reason: 'live_session',
              last_seen_at: '2026-03-07T10:01:00.000Z',
              account_id: 'sonnet',
            },
          ],
          history: [
            {
              occurred_at: '2026-03-07T10:01:00.000Z',
              agent_id: 'sonnet',
              account_id: 'sonnet',
              presence: 'online',
              reason: 'provider_start',
            },
          ],
          signal_status: 'degraded',
          last_signal_at: '2026-03-07T10:05:00.000Z',
          signal_counts: {
            ready_events: 1,
            restart_events: 1,
            transport_errors: 1,
          },
          signals: [
            {
              occurred_at: '2026-03-07T10:05:00.000Z',
              channel: 'discord',
              agent_id: 'sonnet',
              account_id: 'sonnet',
              kind: 'transport_error',
              severity: 'error',
              detail: 'code 1005',
            },
          ],
        },
      ],
      host_summaries: [
        {
          host: 'openclaw',
          total_agents: 2,
          busy_agents: 1,
          online_agents: 1,
          stale_agents: 1,
          disconnected_agents: 0,
          offline_agents: 0,
          overall_presence: 'stale',
          last_seen_at: '2026-03-07T10:01:00.000Z',
          presence_reason: 'stale_gateway_log',
          affected_agents: [
            {
              id: 'sonnet',
              status: 'busy',
              presence: 'online',
              presence_reason: 'live_session',
              last_seen_at: '2026-03-07T10:01:00.000Z',
              account_id: 'sonnet',
            },
          ],
        },
      ],
      tmux_runtime: {
        session: 'agora-craftsmen',
        panes: [
          {
            agent: 'codex',
            pane_id: '%0',
            current_command: 'bash',
            active: true,
            ready: true,
            tail_preview: 'tail:codex',
          continuity_backend: 'codex_session_file',
          resume_capability: 'native_resume',
          session_reference: 'codex-session-123',
          identity_source: 'session_file',
          identity_source_rank: 0,
          identity_conflict_count: 0,
          identity_path: '/tmp/codex/session.json',
          session_observed_at: '2026-03-08T23:01:00.000Z',
          last_recovery_mode: 'resume_exact',
          transport_session_id: 'tmux:agora-craftsmen:codex',
        },
        ],
      },
      craftsmen: [
        {
          id: 'codex',
          status: 'busy',
          task_id: 'OC-101',
          subtask_id: 'dev-api',
          title: '实现 API',
          running_since: '2026-03-07T09:30:00.000Z',
          recent_executions: [
            {
              execution_id: 'exec-dashboard-1',
              status: 'running',
              session_id: 'tmux:agora-craftsmen:codex',
              transport: 'tmux-pane',
              runtime_mode: 'tmux',
              started_at: '2026-03-07T09:30:00.000Z',
            },
          ],
        },
      ],
    };

    const status = mapAgentsStatusDto(dto);

    expect(status.summary.activeTasks).toBe(2);
    expect(status.summary.activeAgents).toBe(1);
    expect(status.summary.totalAgents).toBe(2);
    expect(status.summary.onlineAgents).toBe(2);
    expect(status.summary.staleAgents).toBe(1);
    expect(status.summary.disconnectedAgents).toBe(0);
    expect(status.channelSummaries[0]?.channel).toBe('discord');
    expect(status.channelSummaries[0]?.overallPresence).toBe('stale');
    expect(status.channelSummaries[0]?.affectedAgents[0]?.id).toBe('sonnet');
    expect(status.channelSummaries[0]?.history[0]?.agentId).toBe('sonnet');
    expect(status.channelSummaries[0]?.signalStatus).toBe('degraded');
    expect(status.hostSummaries[0]?.host).toBe('openclaw');
    expect(status.tmuxRuntime?.session).toBe('agora-craftsmen');
    expect(status.tmuxRuntime?.panes[0]?.tailPreview).toBe('tail:codex');
    expect(status.tmuxRuntime?.panes[0]?.identitySource).toBe('session_file');
    expect(status.tmuxRuntime?.panes[0]?.sessionReference).toBe('codex-session-123');
    expect(status.tmuxRuntime?.panes[0]?.identityPath).toBe('/tmp/codex/session.json');
    expect(status.tmuxRuntime?.panes[0]?.sessionObservedAt).toBe('2026-03-08T23:01:00.000Z');
    expect(status.channelSummaries[0]?.signals[0]?.kind).toBe('transport_error');
    expect(status.agents[0]?.taskCount).toBe(1);
    expect(status.agents[0]?.presence).toBe('online');
    expect(status.agents[0]?.presenceReason).toBe('live_session');
    expect(status.agents[0]?.channelProviders).toEqual(['discord']);
    expect(status.agents[0]?.hostFramework).toBe('openclaw');
    expect(status.agents[0]?.lastSeenAt).toBe('2026-03-07T10:01:00.000Z');
    expect(status.agents[0]?.accountId).toBe('sonnet');
    expect(status.agents[0]?.inventorySources).toEqual(['openclaw']);
    expect(status.agents[0]?.primaryModel).toBe('gac/claude-sonnet-4-6');
    expect(status.craftsmen[0]?.taskId).toBe('OC-101');
    expect(status.craftsmen[0]?.recentExecutions[0]?.transport).toBe('tmux-pane');
  });

  it('maps todos while preserving tags and promoted task links', () => {
    const dto: ApiTodoDto = {
      id: 3,
      text: '补页面',
      status: 'pending',
      due: '2026-03-09',
      created_at: '2026-03-07T09:00:00.000Z',
      completed_at: null,
      tags: ['dashboard', 'frontend'],
      promoted_to: 'OC-201',
    };

    const todo = mapTodoDto(dto);

    expect(todo.id).toBe(3);
    expect(todo.tagLabel).toBe('dashboard / frontend');
    expect(todo.promotedTo).toBe('OC-201');
  });

  it('maps archive jobs into retry-friendly view models', () => {
    const dto: ApiArchiveJobDto = {
      id: 7,
      task_id: 'OC-301',
      task_title: '归档日报',
      task_type: 'document',
      status: 'failed',
      target_path: 'ZeYu-AI-Brain/docs/',
      writer_agent: 'writer-agent',
      commit_hash: null,
      requested_at: '2026-03-07T08:00:00.000Z',
      completed_at: null,
      payload: { error_message: 'timeout' },
    };

    const job = mapArchiveJobDto(dto);

    expect(job.id).toBe(7);
    expect(job.taskTitle).toBe('归档日报');
    expect(job.payloadSummary).toContain('timeout');
    expect(job.canConfirm).toBe(false);
    expect(job.canRetry).toBe(true);
  });

  it('maps pending archive jobs into confirmable view models', () => {
    const dto: ApiArchiveJobDto = {
      id: 8,
      task_id: 'OC-302',
      task_title: '待归档任务',
      task_type: 'document',
      status: 'pending',
      target_path: 'ZeYu-AI-Brain/docs/',
      writer_agent: 'writer-agent',
      commit_hash: null,
      requested_at: '2026-03-07T08:00:00.000Z',
      completed_at: null,
      payload: { state: 'cancelled' },
    };

    const job = mapArchiveJobDto(dto);

    expect(job.canConfirm).toBe(true);
    expect(job.canRetry).toBe(false);
  });

  it('maps template summaries and details for explorer-style rendering', () => {
    const summaryDto: ApiTemplateSummaryDto = {
      id: 'coding',
      name: 'Coding Task',
      type: 'coding',
      description: '实现代码任务',
      governance: 'standard',
      stage_count: 4,
    };
    const detailDto: ApiTemplateDetailDto = {
      type: 'coding',
      name: 'Coding Task',
      description: '实现代码任务',
      governance: 'standard',
      defaultTeam: {
        architect: {
          model_preference: 'strong_reasoning',
          suggested: ['opus'],
        },
      },
      stages: [
        { id: 'discuss', name: '讨论', mode: 'discuss', gate: { type: 'approval', approver: 'reviewer' } },
        { id: 'develop', name: '开发', mode: 'execute', gate: { type: 'quorum', required: 2 }, reject_target: 'discuss' },
        { id: 'wait', name: '等待', mode: 'discuss', gate: { type: 'auto_timeout', timeout_sec: 600 } },
      ],
    };

    const summary = mapTemplateSummaryDto(summaryDto);
    const detail = mapTemplateDetailDto('coding', detailDto);

    expect(summary.stageCountLabel).toBe('4 stages');
    expect(detail.id).toBe('coding');
    expect(detail.stageCount).toBe(3);
    expect(detail.defaultTeamRoles[0]).toBe('architect');
    expect(detail.defaultTeam[0]).toEqual({
      role: 'architect',
      modelPreference: 'strong_reasoning',
      suggested: ['opus'],
    });
    expect(detail.stages[0]).toMatchObject({
      gateType: 'approval',
      gateApprover: 'reviewer',
    });
    expect(detail.stages[1]?.rejectTarget).toBe('discuss');
    expect(detail.stages[1]).toMatchObject({
      gateType: 'quorum',
      gateRequired: 2,
    });
    expect(detail.stages[2]).toMatchObject({
      gateType: 'auto_timeout',
      gateTimeoutSec: 600,
    });
  });
});
