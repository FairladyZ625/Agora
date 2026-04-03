import { describe, expect, it, vi } from 'vitest';
import type { TaskRecord } from '@agora-ts/contracts';
import { TaskCraftsmanService } from './task-craftsman-service.js';

function makeTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 'OC-CRAFT-1',
    title: 'Craftsman task',
    description: '',
    type: 'coding',
    priority: 'normal',
    creator: 'archon',
    locale: 'zh-CN',
    state: 'active',
    current_stage: 'execute',
    version: 1,
    workflow: { type: 'custom', stages: [] },
    team: { members: [] },
    created_at: '2026-04-03T00:00:00.000Z',
    updated_at: '2026-04-03T00:00:00.000Z',
    archive_status: null,
    skill_policy: null,
    control: null,
    scheduler: null,
    scheduler_snapshot: null,
    error_detail: null,
    project_id: null,
    archived_at: null,
    ...overrides,
  } as unknown as TaskRecord;
}

function buildService() {
  const task = makeTask();
  const subtask = {
    id: 'sub-1',
    assignee: 'codex',
    stage_id: 'execute',
    status: 'in_progress',
    output: null,
    dispatch_status: 'running',
    craftsman_workdir: '/tmp/task',
  };
  const execution = {
    execution_id: 'exec-1',
    task_id: task.id,
    subtask_id: subtask.id,
    adapter: 'codex',
    mode: 'interactive' as const,
    status: 'needs_input',
    session_id: 'tmux:1',
    workdir: '/tmp/task',
    updated_at: '2026-04-03T00:10:00.000Z',
    started_at: '2026-04-03T00:00:00.000Z',
    created_at: '2026-04-03T00:00:00.000Z',
  };
  const logs: Array<Record<string, unknown>> = [];
  const mirrors: Array<Record<string, unknown>> = [];
  const broadcasts: Array<Record<string, unknown>> = [];
  const updateSubtask = vi.fn();
  const updateExecution = vi.fn();
  const handleCraftsmanCallback = vi.fn(() => ({
    execution: {
      execution_id: 'exec-1',
      status: 'running',
    },
  }));
  const service = new TaskCraftsmanService({
    getTaskOrThrow: () => task,
    getSubtaskOrThrow: () => subtask,
    assertSubtaskControl: () => {},
    updateSubtask: (taskId, subtaskId, patch) => {
      updateSubtask(taskId, subtaskId, patch);
    },
    listExecutionsBySubtask: () => [execution],
    updateExecution: (executionId, patch) => {
      updateExecution(executionId, patch);
    },
    getExecution: () => execution,
    tailExecution: () => ({
      execution_id: 'exec-1',
      available: true,
      output: 'tail',
      source: 'tmux',
    }),
    insertFlowLog: (input) => logs.push(input),
    mirrorConversationEntry: (taskId, input) => mirrors.push({ taskId, ...input }),
    publishTaskStatusBroadcast: (currentTask, input) => broadcasts.push({ taskId: currentTask.id, ...input }),
    countActiveExecutions: () => 1,
    listActiveExecutionCountsByAssignee: () => [{ assignee: 'codex', count: 1 }],
    listActiveExecutions: () => [execution],
    readHostSnapshot: () => null,
    resolveHostPressureStatus: () => 'healthy',
    buildHostGovernanceWarnings: () => [],
    governanceLimits: {
      maxConcurrentRunning: 4,
      maxConcurrentPerAgent: 2,
      hostMemoryWarningUtilizationLimit: null,
      hostMemoryUtilizationLimit: null,
      hostSwapWarningUtilizationLimit: null,
      hostSwapUtilizationLimit: null,
      hostLoadPerCpuWarningLimit: null,
      hostLoadPerCpuLimit: null,
    },
    requireInteractiveExecution: () => ({
      executionId: 'exec-1',
      adapter: 'codex',
      sessionId: 'tmux:1',
      workdir: '/tmp/task',
      taskId: task.id,
      subtaskId: subtask.id,
    }),
    sendText: vi.fn(),
    sendKeys: vi.fn(),
    submitChoice: vi.fn(),
    recordCraftsmanInput: vi.fn(),
    probeViaPort: vi.fn(() => ({ execution_id: 'exec-1' } as never)),
    handleCraftsmanCallback,
    getCraftsmanProbeState: () => ({
      activityMs: Date.parse('2026-04-03T00:10:00.000Z'),
      lastProbeMs: null,
      attempts: 0,
    }),
    shouldProbeCraftsmanExecution: () => true,
    noteCraftsmanAutoProbe: vi.fn(),
  });
  return { service, task, subtask, execution, logs, mirrors, broadcasts, updateSubtask, updateExecution, handleCraftsmanCallback };
}

describe('TaskCraftsmanService', () => {
  it('archives subtasks and emits mirror/broadcast side effects', () => {
    const fixture = buildService();

    fixture.service.archiveSubtask('OC-CRAFT-1', {
      subtaskId: 'sub-1',
      callerId: 'archon',
      note: 'done for now',
    });

    expect(fixture.updateSubtask).toHaveBeenCalled();
    expect(fixture.logs).toContainEqual(expect.objectContaining({
      event: 'subtask_archived',
      task_id: 'OC-CRAFT-1',
    }));
    expect(fixture.broadcasts).toContainEqual(expect.objectContaining({
      taskId: 'OC-CRAFT-1',
      kind: 'subtask_archived',
    }));
  });

  it('cancels running executions when cancelling a subtask', () => {
    const fixture = buildService();

    fixture.service.cancelSubtask('OC-CRAFT-1', {
      subtaskId: 'sub-1',
      callerId: 'archon',
      note: 'stop it',
    });

    expect(fixture.updateExecution).toHaveBeenCalledWith('exec-1', expect.objectContaining({
      status: 'cancelled',
    }));
  });

  it('returns governance snapshots with active execution details', () => {
    const fixture = buildService();

    const snapshot = fixture.service.getCraftsmanGovernanceSnapshot();

    expect(snapshot.active_executions).toBe(1);
    expect(snapshot.active_execution_details[0]).toMatchObject({
      execution_id: 'exec-1',
      assignee: 'codex',
    });
  });

  it('records craftsman input and auto-probes after sending text', () => {
    const fixture = buildService();

    const result = fixture.service.sendCraftsmanInputText('exec-1', 'Continue');

    expect(result.executionId).toBe('exec-1');
    expect(fixture.handleCraftsmanCallback).toHaveBeenCalled();
  });
});
