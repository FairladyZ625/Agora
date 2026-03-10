import { beforeEach, describe, expect, it, vi } from 'vitest';

function buildTaskResponse() {
  return {
    id: 'OC-001',
    version: 1,
    title: 'task',
    description: '',
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
  };
}

describe('dashboard task action api client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    globalThis.fetch = vi.fn(async (input) => ({
      ok: true,
      json: async () => {
        const url = String(input);
        if (url.endsWith('/cleanup')) {
          return { cleaned: 1 };
        }
        return buildTaskResponse();
      },
    })) as unknown as typeof fetch;
  });

  it('posts task creation to the real backend route', async () => {
    const api = await import('@/lib/api');

    await api.createTask({
      title: '实现看板',
      type: 'coding',
      creator: 'archon',
      description: '补齐 kanban',
      priority: 'high',
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/tasks',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          title: '实现看板',
          type: 'coding',
          creator: 'archon',
          description: '补齐 kanban',
          priority: 'high',
        }),
      }),
    );
  });

  it('targets the remaining task action routes with the expected payloads', async () => {
    const api = await import('@/lib/api');

    await api.advanceTask('OC-001', 'opus');
    await api.approveTask('OC-001', 'glm5', '通过');
    await api.rejectTask('OC-001', 'glm5', '需要修复');
    await api.confirmTask('OC-001', 'sonnet', 'approve', '同意');
    await api.subtaskDone('OC-001', 'dev-api', 'sonnet', 'done');
    await api.forceAdvanceTask('OC-001', '人工确认');
    await api.pauseTask('OC-001', '等待确认');
    await api.resumeTask('OC-001');
    await api.cancelTask('OC-001', '不再需要');
    await api.unblockTask('OC-001', '解除阻塞');
    await api.unblockTask('OC-001', '重试失败子任务', 'retry');
    await api.unblockTask('OC-001', '跳过失败子任务', 'skip');
    await api.unblockTask('OC-001', '重新分配失败子任务', 'reassign', 'claude', 'claude');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/tasks/OC-001/advance',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ caller_id: 'opus' }) }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/tasks/OC-001/approve',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ approver_id: 'glm5', comment: '通过' }) }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/tasks/OC-001/reject',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ rejector_id: 'glm5', reason: '需要修复' }) }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/tasks/OC-001/confirm',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ voter_id: 'sonnet', vote: 'approve', comment: '同意' }) }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/tasks/OC-001/subtask-done',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ subtask_id: 'dev-api', caller_id: 'sonnet', output: 'done' }) }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/tasks/OC-001/force-advance',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ reason: '人工确认' }) }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/tasks/OC-001/pause',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ reason: '等待确认' }) }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/tasks/OC-001/resume',
      expect.objectContaining({
        method: 'POST',
        headers: expect.not.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/tasks/OC-001/cancel',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ reason: '不再需要' }) }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/tasks/OC-001/unblock',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ reason: '解除阻塞' }) }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/tasks/OC-001/unblock',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ reason: '重试失败子任务', action: 'retry' }) }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/tasks/OC-001/unblock',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ reason: '跳过失败子任务', action: 'skip' }) }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/tasks/OC-001/unblock',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ reason: '重新分配失败子任务', action: 'reassign', assignee: 'claude', craftsman_type: 'claude' }),
      }),
    );
  });

  it('supports orphan cleanup through the task cleanup route', async () => {
    const api = await import('@/lib/api');

    await api.cleanupTasks();
    await api.cleanupTasks('OC-001');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/tasks/cleanup',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({}) }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/tasks/cleanup',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ task_id: 'OC-001' }) }),
    );
  });

  it('sends reviewer_id for archon review actions', async () => {
    const api = await import('@/lib/api');

    await api.archonApprove('OC-001', 'looks good');
    await api.archonReject('OC-001', 'needs revision');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/tasks/OC-001/archon-approve',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ reviewer_id: 'archon', comment: 'looks good' }),
      }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/tasks/OC-001/archon-reject',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ reviewer_id: 'archon', reason: 'needs revision' }),
      }),
    );
  });

  it('rejects malformed task responses during runtime parsing', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: 'OC-001' }),
    })) as unknown as typeof fetch;
    const api = await import('@/lib/api');

    await expect(api.getTask('OC-001')).rejects.toThrow();
  });
});
