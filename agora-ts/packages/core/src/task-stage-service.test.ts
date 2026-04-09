import { describe, expect, it, vi } from 'vitest';
import type { TaskRecord } from '@agora-ts/contracts';
import { TaskState } from './enums.js';
import { TaskStageService } from './task-stage-service.js';

function makeTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 'OC-STAGE-1',
    title: 'Stage task',
    description: '',
    type: 'coding',
    priority: 'normal',
    creator: 'archon',
    locale: 'zh-CN',
    state: 'active',
    current_stage: 'draft',
    version: 3,
    workflow: {
      type: 'custom',
      stages: [
        { id: 'draft', mode: 'discuss', gate: { type: 'approval' } },
        { id: 'review', mode: 'discuss', gate: { type: 'command' } },
      ],
    },
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

function createStageService() {
  const task = makeTask();
  const currentStage = task.workflow.stages?.[0];
  const nextStage = task.workflow.stages?.[1];
  if (!currentStage || !nextStage) {
    throw new Error('stage fixture is missing workflow stages');
  }
  const flowLogs: Array<Record<string, unknown>> = [];
  const progressLogs: Array<Record<string, unknown>> = [];
  const mirrors: Array<Record<string, unknown>> = [];
  const statusBroadcasts: Array<Record<string, unknown>> = [];
  const stateBroadcasts: Array<Record<string, unknown>> = [];
  const ensureApprovalRequestForGate = vi.fn(() => ({
    request: { id: 'APR-1', gate_type: 'approval', summary_path: '/tmp/summary.md' },
    shouldBroadcast: true,
  }));
  const updateTask = vi.fn((taskId: string, version: number, patch: Record<string, unknown>) => ({
    ...task,
    ...patch,
  }));
  const service = new TaskStageService({
    getTaskOrThrow: () => task,
    getCurrentStageOrThrow: () => currentStage,
    assertStageRosterAction: () => {},
    routeGateCommand: () => {},
    checkGate: () => true,
    ensureApprovalRequestForGate,
    publishTaskStatusBroadcast: (currentTask, input) => {
      statusBroadcasts.push({ taskId: currentTask.id, ...input });
    },
    advanceWorkflow: () => ({
      currentStage,
      nextStage,
      completesTask: false,
    }),
    getRejectStage: () => nextStage,
    reconcileStageExitSubtasks: () => [],
    exitStage: () => {},
    runTaskDoneAutomation: () => {},
    updateTask,
    refreshTaskBrainWorkspace: () => {},
    materializeTaskCloseRecap: () => {},
    ensureArchiveJobForTask: () => ({ id: 'archive-1' }),
    insertFlowLog: (input) => {
      flowLogs.push(input);
    },
    mirrorConversationEntry: (taskId, input) => {
      mirrors.push({ taskId, ...input });
    },
    publishControllerCloseoutReminder: () => {},
    enterStage: () => {},
    insertProgressLog: (input) => {
      progressLogs.push(input);
    },
    describeGateState: () => ['Waiting human approval before further progress.'],
    buildSmokeStageEntryCommands: () => [],
    reconcileStageParticipants: () => {},
    validateTransition: () => true,
    buildSchedulerSnapshot: () => null,
    dbBegin: () => {},
    dbCommit: () => {},
    dbRollback: () => {},
    applyStateTransitionSideEffects: () => undefined,
    cancelOpenWork: () => {},
    buildStateChangeDetail: () => undefined,
    buildStateConversationBody: () => 'Task resumed',
    getStateActionEvent: () => 'resumed',
    resumeDeferredCallbacks: () => {},
    failMissingCraftsmanSessionsOnResume: () => {},
    syncImContextForTaskState: (_taskId, _fromState, _toState, _reason, onSuccess) => {
      onSuccess?.();
    },
    publishTaskStateBroadcast: (currentTask, fromState, toState, reason) => {
      stateBroadcasts.push({ taskId: currentTask.id, fromState, toState, reason });
    },
    getDoneStateBroadcastLines: () => ['Task reached done state and has been queued for archive handling.'],
  });

  return {
    service,
    task,
    currentStage,
    nextStage,
    flowLogs,
    progressLogs,
    mirrors,
    statusBroadcasts,
    stateBroadcasts,
    ensureApprovalRequestForGate,
    updateTask,
  };
}

describe('TaskStageService', () => {
  it('broadcasts gate waiting when advance is blocked by an approval gate', () => {
    const fixture = createStageService();
    const blocked = new TaskStageService({
      ...fixture.service['options'],
      checkGate: () => false,
    } as never);

    expect(() => blocked.advanceTask('OC-STAGE-1', { callerId: 'opus' })).toThrow(/Gate check failed/);
    expect(fixture.ensureApprovalRequestForGate).toHaveBeenCalled();
    expect(fixture.statusBroadcasts).toContainEqual(expect.objectContaining({
      taskId: 'OC-STAGE-1',
      kind: 'gate_waiting',
    }));
  });

  it('force advances tasks into done state and emits archive-facing side effects', () => {
    const fixture = createStageService();
    const doneTask = makeTask({ current_stage: 'review' });
    const completes = new TaskStageService({
      ...fixture.service['options'],
      getTaskOrThrow: () => doneTask,
      getCurrentStageOrThrow: () => fixture.nextStage,
      advanceWorkflow: () => ({
        currentStage: fixture.nextStage,
        nextStage: null,
        completesTask: true,
      }),
      updateTask: vi.fn((taskId: string, version: number, patch: Record<string, unknown>) => ({
        ...doneTask,
        ...patch,
      })),
    } as never);

    const done = completes.forceAdvanceTask('OC-STAGE-1', { reason: 'operator override' });

    expect(done.state).toBe('done');
    expect(fixture.flowLogs).toContainEqual(expect.objectContaining({
      event: 'force_advance',
      task_id: 'OC-STAGE-1',
    }));
  });

  it('routes state transitions through resume-time broadcast syncing', () => {
    const fixture = createStageService();
    const pausedTask = makeTask({ state: 'paused' });
    const resumed = new TaskStageService({
      ...fixture.service['options'],
      getTaskOrThrow: () => pausedTask,
      updateTask: vi.fn((taskId: string, version: number, patch: Record<string, unknown>) => ({
        ...pausedTask,
        ...patch,
      })),
    } as never);

    const updated = resumed.updateTaskState('OC-STAGE-1', TaskState.ACTIVE, { reason: 'resumed' });

    expect(updated.state).toBe('active');
    expect(fixture.stateBroadcasts).toContainEqual({
      taskId: 'OC-STAGE-1',
      fromState: 'paused',
      toState: 'active',
      reason: 'resumed',
    });
    expect(fixture.flowLogs).toContainEqual(expect.objectContaining({
      event: 'state_changed',
      task_id: 'OC-STAGE-1',
    }));
  });
});
