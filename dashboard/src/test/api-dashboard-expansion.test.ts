import { beforeEach, describe, expect, it, vi } from 'vitest';

function buildTaskResponse() {
  return {
    id: 'OC-001',
    version: 1,
    title: 'task',
    description: '',
    type: 'quick',
    priority: 'high',
    creator: 'archon',
    state: 'active',
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
              provider: 'discord',
              account_id: 'main',
              source: 'openclaw+discord',
              primary_model: 'openai-codex/gpt-5.3-codex',
              workspace_dir: '/tmp/main',
            }],
            craftsmen: [],
          };
        }
        if (url.includes('/archive/jobs')) {
          return url.endsWith('/retry') || /\/archive\/jobs\/\d+$/.test(url)
            ? {
                id: 7,
                task_id: 'OC-001',
                task_title: 'archive',
                task_type: 'document',
                status: 'pending',
                target_path: null,
                writer_agent: null,
                commit_hash: null,
                requested_at: '2026-03-08T00:00:00.000Z',
                completed_at: null,
                payload: null,
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
        if (url.includes('/templates/')) {
          return {
            name: 'Coding',
            type: 'coding',
            description: 'template',
            defaultWorkflow: 'linear',
            stages: [{ id: 'draft' }],
          };
        }
        return {};
      },
    })) as unknown as typeof fetch;
  });

  it('targets the agents and archive read models with the expected query strings', async () => {
    const api = await import('@/lib/api');

    await api.getAgentsStatus();
    await api.listArchiveJobs();
    await api.listArchiveJobs({ status: 'failed', taskId: 'OC-001' });
    await api.getArchiveJob(7);
    await api.retryArchiveJob(7, 'manual retry');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/agents/status',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/archive/jobs',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/archive/jobs?status=failed&task_id=OC-001',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/archive/jobs/7',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/archive/jobs/7/retry',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ reason: 'manual retry' }),
      }),
    );
  });

  it('targets todo CRUD and promote routes with the expected payloads', async () => {
    const api = await import('@/lib/api');

    await api.listTodos();
    await api.listTodos('done');
    await api.createTodo({ text: '补前端页面', due: '2026-03-09', tags: ['dashboard'] });
    await api.updateTodo(3, { text: '补前端页面 v2', status: 'done' });
    await api.deleteTodo(3);
    await api.promoteTodo(3, { type: 'quick', creator: 'archon', priority: 'high' });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/todos',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/todos?status=done',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/todos',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ text: '补前端页面', due: '2026-03-09', tags: ['dashboard'] }),
      }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/todos/3',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ text: '补前端页面 v2', status: 'done' }),
      }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/todos/3',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/todos/3/promote',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ type: 'quick', creator: 'archon', priority: 'high' }),
      }),
    );
  });

  it('loads template summaries and full template details from the real backend routes', async () => {
    const api = await import('@/lib/api');

    await api.listTemplates();
    await api.getTemplate('coding');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/templates',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/templates/coding',
      expect.objectContaining({ method: 'GET' }),
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
