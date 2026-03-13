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

    expectFetchCall('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        title: '实现看板',
        type: 'coding',
        creator: 'archon',
        description: '补齐 kanban',
        priority: 'high',
      }),
    });
  });

  it('posts create-task overrides to the real backend route', async () => {
    const api = await import('@/lib/api');

    await api.createTask({
      title: '实现私有线程任务',
      type: 'coding',
      creator: 'archon',
      description: '补 create flow',
      priority: 'high',
      team_override: {
        members: [
          { role: 'architect', agentId: 'opus', model_preference: 'strong_reasoning' },
          { role: 'developer', agentId: 'codex', model_preference: 'fast_coding' },
        ],
      },
      im_target: {
        provider: 'discord',
        visibility: 'private',
        participant_refs: ['opus', 'codex'],
      },
    });

    expectFetchCall('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        title: '实现私有线程任务',
        type: 'coding',
        creator: 'archon',
        description: '补 create flow',
        priority: 'high',
        team_override: {
          members: [
            { role: 'architect', agentId: 'opus', model_preference: 'strong_reasoning' },
            { role: 'developer', agentId: 'codex', model_preference: 'fast_coding' },
          ],
        },
        im_target: {
          provider: 'discord',
          visibility: 'private',
          participant_refs: ['opus', 'codex'],
        },
      }),
    });
  });

  it('targets the remaining task action routes with the expected payloads', async () => {
    const api = await import('@/lib/api');

    await api.advanceTask('OC-001', 'opus');
    await api.approveTask('OC-001', 'glm5', '通过');
    await api.rejectTask('OC-001', 'glm5', '需要修复');
    await api.confirmTask('OC-001', 'sonnet', 'approve', '同意');
    await api.subtaskDone('OC-001', 'dev-api', 'sonnet', 'done');
    await api.closeSubtask('OC-001', 'dev-api', 'opus', '完成交付');
    await api.archiveSubtask('OC-001', 'dev-api', 'opus', '阶段冻结');
    await api.cancelSubtask('OC-001', 'dev-api', 'opus', '不再继续');
    await api.forceAdvanceTask('OC-001', '人工确认');
    await api.pauseTask('OC-001', '等待确认');
    await api.resumeTask('OC-001');
    await api.cancelTask('OC-001', '不再需要');
    await api.unblockTask('OC-001', '解除阻塞');
    await api.unblockTask('OC-001', '重试失败子任务', 'retry');
    await api.unblockTask('OC-001', '跳过失败子任务', 'skip');
    await api.unblockTask('OC-001', '重新分配失败子任务', 'reassign', 'claude', 'claude');

    expectFetchCall('/api/tasks/OC-001/advance', { method: 'POST', body: JSON.stringify({ caller_id: 'opus' }) });
    expectFetchCall('/api/tasks/OC-001/approve', { method: 'POST', body: JSON.stringify({ approver_id: 'glm5', comment: '通过' }) });
    expectFetchCall('/api/tasks/OC-001/reject', { method: 'POST', body: JSON.stringify({ rejector_id: 'glm5', reason: '需要修复' }) });
    expectFetchCall('/api/tasks/OC-001/confirm', { method: 'POST', body: JSON.stringify({ voter_id: 'sonnet', vote: 'approve', comment: '同意' }) });
    expectFetchCall('/api/tasks/OC-001/subtask-done', { method: 'POST', body: JSON.stringify({ subtask_id: 'dev-api', caller_id: 'sonnet', output: 'done' }) });
    expectFetchCall('/api/tasks/OC-001/subtasks/dev-api/close', { method: 'POST', body: JSON.stringify({ caller_id: 'opus', note: '完成交付' }) });
    expectFetchCall('/api/tasks/OC-001/subtasks/dev-api/archive', { method: 'POST', body: JSON.stringify({ caller_id: 'opus', note: '阶段冻结' }) });
    expectFetchCall('/api/tasks/OC-001/subtasks/dev-api/cancel', { method: 'POST', body: JSON.stringify({ caller_id: 'opus', note: '不再继续' }) });
    expectFetchCall('/api/tasks/OC-001/force-advance', { method: 'POST', body: JSON.stringify({ reason: '人工确认' }) });
    expectFetchCall('/api/tasks/OC-001/pause', { method: 'POST', body: JSON.stringify({ reason: '等待确认' }) });
    expectFetchCall('/api/tasks/OC-001/resume', {
      method: 'POST',
      headers: expect.not.objectContaining({
        'Content-Type': 'application/json',
      }),
    });
    expectFetchCall('/api/tasks/OC-001/cancel', { method: 'POST', body: JSON.stringify({ reason: '不再需要' }) });
    expectFetchCall('/api/tasks/OC-001/unblock', { method: 'POST', body: JSON.stringify({ reason: '解除阻塞' }) });
    expectFetchCall('/api/tasks/OC-001/unblock', { method: 'POST', body: JSON.stringify({ reason: '重试失败子任务', action: 'retry' }) });
    expectFetchCall('/api/tasks/OC-001/unblock', { method: 'POST', body: JSON.stringify({ reason: '跳过失败子任务', action: 'skip' }) });
    expectFetchCall('/api/tasks/OC-001/unblock', {
      method: 'POST',
      body: JSON.stringify({ reason: '重新分配失败子任务', action: 'reassign', assignee: 'claude', craftsman_type: 'claude' }),
    });
  });

  it('supports orphan cleanup through the task cleanup route', async () => {
    const api = await import('@/lib/api');

    await api.cleanupTasks();
    await api.cleanupTasks('OC-001');

    expectFetchCall('/api/tasks/cleanup', { method: 'POST', body: JSON.stringify({}) });
    expectFetchCall('/api/tasks/cleanup', { method: 'POST', body: JSON.stringify({ task_id: 'OC-001' }) });
  });

  it('sends reviewer_id for archon review actions', async () => {
    const api = await import('@/lib/api');

    await api.archonApprove('OC-001', 'looks good');
    await api.archonReject('OC-001', 'needs revision');

    expectFetchCall('/api/tasks/OC-001/archon-approve', {
      method: 'POST',
      body: JSON.stringify({ reviewer_id: 'archon', comment: 'looks good' }),
    });
    expectFetchCall('/api/tasks/OC-001/archon-reject', {
      method: 'POST',
      body: JSON.stringify({ reviewer_id: 'archon', reason: 'needs revision' }),
    });
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
