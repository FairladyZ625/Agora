import { beforeEach, describe, expect, it, vi } from 'vitest';

function expectFetchCall(path: string, init: Record<string, unknown>) {
  expect(globalThis.fetch).toHaveBeenCalledWith(
    expect.stringContaining(path),
    expect.objectContaining(init),
  );
}

function buildTaskResponse() {
  return {
    id: 'OC-001',
    version: 1,
    title: 'task',
    description: '',
    type: 'quick',
    priority: 'high',
    creator: 'archon',
    locale: 'zh-CN',
    state: 'active',
    archive_status: null,
    current_stage: 'execute',
    team: { members: [] },
    workflow: { stages: [] },
    scheduler: null,
    scheduler_snapshot: null,
    discord: null,
    metrics: null,
    error_detail: null,
    created_at: '2026-03-08T00:00:00.000Z',
    updated_at: '2026-03-08T00:00:00.000Z',
  };
}

describe('dashboard expansion api client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    globalThis.fetch = vi.fn(async (input, init) => ({
      ok: true,
      json: async () => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (url.includes('/agents/status')) {
          return {
            summary: { active_tasks: 1, active_agents: 1, total_agents: 2, online_agents: 1, stale_agents: 1, disconnected_agents: 0, busy_craftsmen: 0 },
            agents: [{
              id: 'main',
              role: null,
              status: 'busy',
              presence: 'online',
              presence_reason: 'live_session',
              active_task_ids: ['OC-001'],
              active_subtask_ids: [],
              load: 1,
              last_active_at: '2026-03-08T00:00:00.000Z',
              last_seen_at: '2026-03-08T00:00:00.000Z',
              channel_providers: ['discord'],
              account_id: 'main',
              host_framework: 'openclaw',
              inventory_sources: ['openclaw', 'discord'],
              primary_model: 'openai-codex/gpt-5.3-codex',
              workspace_dir: '/tmp/main',
            }],
            craftsmen: [{
              id: 'codex',
              status: 'busy',
              task_id: 'OC-001',
              subtask_id: 'dev-api',
              title: '实现 API',
              running_since: '2026-03-08T00:00:00.000Z',
              recent_executions: [{
                execution_id: 'exec-dashboard-1',
                status: 'running',
                session_id: 'tmux:agora-craftsmen:codex',
                transport: 'tmux-pane',
                runtime_mode: 'tmux',
                started_at: '2026-03-08T00:00:00.000Z',
              }],
            }],
            channel_summaries: [{
              channel: 'discord',
              total_agents: 2,
              busy_agents: 1,
              online_agents: 1,
              stale_agents: 1,
              disconnected_agents: 0,
              offline_agents: 0,
              overall_presence: 'stale',
              last_seen_at: '2026-03-08T00:00:00.000Z',
              presence_reason: 'stale_gateway_log',
              affected_agents: [],
              history: [],
              signal_status: 'unknown',
              last_signal_at: null,
              signal_counts: {
                ready_events: 0,
                restart_events: 0,
                transport_errors: 0,
              },
              signals: [],
            }],
            host_summaries: [{
              host: 'openclaw',
              total_agents: 2,
              busy_agents: 1,
              online_agents: 1,
              stale_agents: 1,
              disconnected_agents: 0,
              offline_agents: 0,
              overall_presence: 'stale',
              last_seen_at: '2026-03-08T00:00:00.000Z',
              presence_reason: 'stale_gateway_log',
              affected_agents: [],
            }],
            tmux_runtime: {
              session: 'agora-craftsmen',
              panes: [{
                agent: 'codex',
                pane_id: '%0',
                current_command: 'bash',
                active: true,
                ready: true,
                tail_preview: null,
                continuity_backend: 'codex_session_file',
                resume_capability: 'native_resume',
                session_reference: 'codex-session-123',
                identity_source: 'session_file',
                identity_source_rank: 0,
                identity_conflict_count: 0,
                last_recovery_mode: 'resume_exact',
                transport_session_id: 'tmux:agora-craftsmen:codex',
              }],
            },
          };
        }
        if (url.includes('/agents/channels/')) {
          return {
            channel: 'discord',
            total_agents: 2,
            busy_agents: 1,
            online_agents: 1,
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
              detail: 'Main ready',
            }],
          };
        }
        if (url.includes('/craftsmen/tmux/tail/')) {
          return { output: 'tail:codex' };
        }
        if (url.includes('/craftsmen/governance')) {
          return {
            limits: {
              max_concurrent_running: 4,
              max_concurrent_per_agent: 2,
              host_memory_utilization_limit: 0.8,
              host_swap_utilization_limit: 0.2,
              host_load_per_cpu_limit: 1.5,
            },
            active_executions: 1,
            active_by_assignee: [{ assignee: 'opus', count: 1 }],
            host: null,
          };
        }
        if (url.includes('/craftsmen/observe')) {
          return { scanned: 1, probed: 1, progressed: 0 };
        }
        if (/\/craftsmen\/executions\/[^/]+\/probe$/.test(url)) {
          return { ok: true, execution_id: 'exec-1', status: 'running', probed: true };
        }
        if (/\/craftsmen\/executions\/[^/]+\/input-text$/.test(url)) {
          return { ok: true, execution_id: 'exec-1' };
        }
        if (/\/craftsmen\/executions\/[^/]+\/input-keys$/.test(url)) {
          return { ok: true, execution_id: 'exec-1' };
        }
        if (/\/craftsmen\/executions\/[^/]+\/submit-choice$/.test(url)) {
          return { ok: true, execution_id: 'exec-1' };
        }
        if (/\/craftsmen\/tasks\/[^/]+\/subtasks\/[^/]+\/executions$/.test(url)) {
          return [{
            execution_id: 'exec-1',
            task_id: 'OC-001',
            subtask_id: 'sub-1',
            adapter: 'codex',
            mode: 'task',
            session_id: 'tmux:1',
            status: 'needs_input',
            brief_path: null,
            workdir: '/tmp/agora',
            callback_payload: null,
            error: null,
            started_at: '2026-03-08T00:00:00.000Z',
            finished_at: null,
            created_at: '2026-03-08T00:00:00.000Z',
            updated_at: '2026-03-08T00:00:00.000Z',
          }];
        }
        if (url.includes('/archive/jobs')) {
          if (url.endsWith('/scan-stale')) {
            return { failed: 1 };
          }
          if (url.endsWith('/scan-receipts')) {
            return { processed: 1, synced: 1, failed: 0 };
          }
          return url.endsWith('/retry') || url.endsWith('/notify') || /\/archive\/jobs\/\d+$/.test(url) || /\/archive\/jobs\/\d+\/status$/.test(url)
            ? {
                id: 7,
                task_id: 'OC-001',
                task_title: 'archive',
                task_type: 'document',
                status: url.endsWith('/notify') ? 'notified' : (url.endsWith('/status') ? 'synced' : 'pending'),
                target_path: null,
                writer_agent: null,
                commit_hash: url.endsWith('/status') ? 'abc123' : null,
                requested_at: '2026-03-08T00:00:00.000Z',
                completed_at: url.endsWith('/status') ? '2026-03-08T00:10:00.000Z' : null,
                payload: url.endsWith('/notify')
                  ? {
                      notified_at: '2026-03-09T15:00:00.000Z',
                      notification_receipt: {
                        notification_id: 'archive-job-7',
                        outbox_path: '/tmp/archive-job-7.json',
                      },
                    }
                  : null,
              }
            : [{
                id: 7,
                task_id: 'OC-001',
                task_title: 'archive',
                task_type: 'document',
                status: 'failed',
                target_path: null,
                writer_agent: null,
                commit_hash: null,
                requested_at: '2026-03-08T00:00:00.000Z',
                completed_at: null,
                payload: null,
              }];
        }
        if (url.includes('/todos')) {
          if (url.endsWith('/promote')) {
            return {
              todo: {
                id: 3,
                text: '补前端页面 v2',
                status: 'done',
                due: null,
                created_at: '2026-03-08T00:00:00.000Z',
                completed_at: '2026-03-08T01:00:00.000Z',
                tags: [],
                promoted_to: 'OC-001',
              },
              task: buildTaskResponse(),
            };
          }
          if (method === 'GET' && (url.endsWith('/todos') || url.includes('/todos?'))) {
            return [{
              id: 3,
              text: '补前端页面',
              status: 'pending',
              due: '2026-03-09',
              created_at: '2026-03-08T00:00:00.000Z',
              completed_at: null,
              tags: ['dashboard'],
              promoted_to: null,
            }];
          }
          if (method !== 'GET' && url.endsWith('/todos')) {
            return {
              id: 3,
              text: '补前端页面',
              status: 'pending',
              due: '2026-03-09',
              created_at: '2026-03-08T00:00:00.000Z',
              completed_at: null,
              tags: ['dashboard'],
              promoted_to: null,
            };
          }
          if (method === 'DELETE' && /\/todos\/\d+$/.test(url)) {
            return { deleted: true };
          }
          if (/\/todos\/\d+$/.test(url)) {
            return {
              id: 3,
              text: '补前端页面 v2',
              status: 'done',
              due: '2026-03-09',
              created_at: '2026-03-08T00:00:00.000Z',
              completed_at: '2026-03-08T01:00:00.000Z',
              tags: ['dashboard'],
              promoted_to: null,
            };
          }
        }
        if (url.endsWith('/templates')) {
          return [{
            id: 'coding',
            name: 'Coding',
            type: 'coding',
            description: 'template',
            governance: null,
            stage_count: 3,
          }];
        }
        if (method === 'PUT' && url.includes('/templates/')) {
          return {
            id: 'coding',
            saved: true,
            template: JSON.parse(String(init?.body ?? '{}')),
          };
        }
        if (method === 'POST' && /\/templates\/[^/]+\/duplicate$/.test(url)) {
          return {
            id: 'coding_copy',
            template: {
              name: 'Coding Copy',
              type: 'coding_copy',
              description: 'template copy',
              defaultWorkflow: 'linear',
              defaultTeam: {
                architect: {
                  member_kind: 'controller',
                  suggested: ['opus'],
                },
              },
              stages: [{ id: 'draft', name: 'Draft', mode: 'discuss' }],
            },
          };
        }
        if (method === 'POST' && url.endsWith('/workflows/validate')) {
          return {
            valid: true,
            errors: [],
            normalized: {
              name: 'workflow',
              type: 'workflow',
              defaultWorkflow: 'linear',
              defaultTeam: {
                architect: {
                  member_kind: 'controller',
                  suggested: ['opus'],
                },
              },
              stages: [{ id: 'draft', name: 'Draft', mode: 'discuss' }],
            },
          };
        }
        if (url.includes('/templates/')) {
          return {
            name: 'Coding',
            type: 'coding',
            description: 'template',
            defaultWorkflow: 'linear',
            defaultTeam: {
              architect: {
                member_kind: 'controller',
                suggested: ['opus'],
              },
            },
            stages: [{ id: 'draft', name: 'Draft', mode: 'discuss' }],
          };
        }
        return {};
      },
    })) as unknown as typeof fetch;
  });

  it('targets the agents and archive read models with the expected query strings', async () => {
    const api = await import('@/lib/api');

    await api.getAgentsStatus();
    await api.getAgentChannelDetail('discord');
    await api.getTmuxTail('codex', 20);
    await api.listArchiveJobs();
    await api.listArchiveJobs({ status: 'failed', taskId: 'OC-001' });
    await api.getArchiveJob(7);
    await api.retryArchiveJob(7, 'manual retry');
    await api.notifyArchiveJob(7);
    await api.updateArchiveJobStatus(7, 'notified');
    await api.updateArchiveJobStatus(7, 'failed', { errorMessage: 'writer timeout' });
    await api.updateArchiveJobStatus(7, 'synced', { commitHash: 'abc123' });
    await api.scanStaleArchiveJobs(60_000);
    await api.scanArchiveJobReceipts();
    await api.getCraftsmanGovernance();
    await api.observeCraftsmanExecutions({ running_after_ms: 120000, waiting_after_ms: 60000 });
    await api.listSubtaskExecutions('OC-001', 'sub-1');
    await api.probeCraftsmanExecution('exec-1');
    await api.sendCraftsmanExecutionInputText('exec-1', { text: 'Continue' });
    await api.sendCraftsmanExecutionInputKeys('exec-1', { keys: ['Down'] });
    await api.submitCraftsmanExecutionChoice('exec-1', { keys: ['Enter'] });

    expectFetchCall('/api/agents/status', { method: 'GET' });
    expectFetchCall('/api/agents/channels/discord', { method: 'GET' });
    expectFetchCall('/api/craftsmen/tmux/tail/codex?lines=20', { method: 'GET' });
    expectFetchCall('/api/archive/jobs', { method: 'GET' });
    expectFetchCall('/api/archive/jobs?status=failed&task_id=OC-001', { method: 'GET' });
    expectFetchCall('/api/archive/jobs/7', { method: 'GET' });
    expectFetchCall('/api/archive/jobs/7/retry', {
      method: 'POST',
      body: JSON.stringify({ reason: 'manual retry' }),
    });
    expectFetchCall('/api/archive/jobs/7/notify', { method: 'POST' });
    expectFetchCall('/api/archive/jobs/7/status', {
      method: 'POST',
      body: JSON.stringify({ status: 'notified' }),
    });
    expectFetchCall('/api/archive/jobs/7/status', {
      method: 'POST',
      body: JSON.stringify({ status: 'failed', error_message: 'writer timeout' }),
    });
    expectFetchCall('/api/archive/jobs/7/status', {
      method: 'POST',
      body: JSON.stringify({ status: 'synced', commit_hash: 'abc123' }),
    });
    expectFetchCall('/api/archive/jobs/scan-stale', {
      method: 'POST',
      body: JSON.stringify({ timeout_ms: 60000 }),
    });
    expectFetchCall('/api/archive/jobs/scan-receipts', { method: 'POST' });
    expectFetchCall('/api/craftsmen/governance', { method: 'GET' });
    expectFetchCall('/api/craftsmen/observe', {
      method: 'POST',
      body: JSON.stringify({ running_after_ms: 120000, waiting_after_ms: 60000 }),
    });
    expectFetchCall('/api/craftsmen/tasks/OC-001/subtasks/sub-1/executions', { method: 'GET' });
    expectFetchCall('/api/craftsmen/executions/exec-1/probe', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    expectFetchCall('/api/craftsmen/executions/exec-1/input-text', {
      method: 'POST',
      body: JSON.stringify({ text: 'Continue' }),
    });
    expectFetchCall('/api/craftsmen/executions/exec-1/input-keys', {
      method: 'POST',
      body: JSON.stringify({ keys: ['Down'] }),
    });
    expectFetchCall('/api/craftsmen/executions/exec-1/submit-choice', {
      method: 'POST',
      body: JSON.stringify({ keys: ['Enter'] }),
    });
  });

  it('targets todo CRUD and promote routes with the expected payloads', async () => {
    const api = await import('@/lib/api');

    await api.listTodos();
    await api.listTodos('done');
    await api.createTodo({ text: '补前端页面', due: '2026-03-09', tags: ['dashboard'] });
    await api.updateTodo(3, { text: '补前端页面 v2', status: 'done' });
    await api.deleteTodo(3);
    await api.promoteTodo(3, { type: 'quick', creator: 'archon', priority: 'high' });

    expectFetchCall('/api/todos', { method: 'GET' });
    expectFetchCall('/api/todos?status=done', { method: 'GET' });
    expectFetchCall('/api/todos', {
      method: 'POST',
      body: JSON.stringify({ text: '补前端页面', due: '2026-03-09', tags: ['dashboard'] }),
    });
    expectFetchCall('/api/todos/3', {
      method: 'PATCH',
      body: JSON.stringify({ text: '补前端页面 v2', status: 'done' }),
    });
    expectFetchCall('/api/todos/3', { method: 'DELETE' });
    expectFetchCall('/api/todos/3/promote', {
      method: 'POST',
      body: JSON.stringify({ type: 'quick', creator: 'archon', priority: 'high' }),
    });
  });

  it('loads template summaries and full template details from the real backend routes', async () => {
    const api = await import('@/lib/api');

    await api.listTemplates();
    await api.getTemplate('coding');
    await api.updateTemplate('coding', {
      name: 'Coding',
      type: 'coding',
      description: 'updated template',
      governance: 'standard',
      defaultWorkflow: 'linear',
      defaultTeam: {
        architect: {
          member_kind: 'controller',
          model_preference: 'strong_reasoning',
          suggested: ['opus', 'codex'],
        },
      },
      stages: [{ id: 'draft', name: 'Draft', mode: 'discuss' }],
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/templates$/),
      expect.objectContaining({ method: 'GET' }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/templates\/coding$/),
      expect.objectContaining({ method: 'GET' }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/templates\/coding$/),
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          name: 'Coding',
          type: 'coding',
          description: 'updated template',
          governance: 'standard',
          defaultWorkflow: 'linear',
          defaultTeam: {
            architect: {
              member_kind: 'controller',
              model_preference: 'strong_reasoning',
              suggested: ['opus', 'codex'],
            },
          },
          stages: [{ id: 'draft', name: 'Draft', mode: 'discuss' }],
        }),
      }),
    );
  });

  it('targets template authoring routes for duplicate and workflow validation', async () => {
    const api = await import('@/lib/api');

    await api.duplicateTemplate('coding', {
      new_id: 'coding_copy',
      name: 'Coding Copy',
    });
    await api.validateWorkflow({
      defaultWorkflow: 'linear',
      stages: [{ id: 'draft', name: 'Draft', mode: 'discuss' }],
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/templates\/coding\/duplicate$/),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          new_id: 'coding_copy',
          name: 'Coding Copy',
        }),
      }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/workflows\/validate$/),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          defaultWorkflow: 'linear',
          stages: [{ id: 'draft', name: 'Draft', mode: 'discuss' }],
        }),
      }),
    );
  });

  it('rejects malformed dashboard expansion responses during runtime parsing', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ summary: {} }),
    })) as unknown as typeof fetch;
    const api = await import('@/lib/api');

    await expect(api.getAgentsStatus()).rejects.toThrow();
  });
});
