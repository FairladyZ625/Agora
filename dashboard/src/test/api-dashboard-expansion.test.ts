import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('dashboard expansion api client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true }),
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
});
