import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { FlowLogRepository, InboxRepository, TaskContextBindingRepository, TaskRepository, createAgoraDatabase, runMigrations } from '@agora-ts/db';
import type { TaskRecord } from '@agora-ts/contracts';
import { TaskRecoveryService } from './task-recovery-service.js';

function makeDb() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-task-recovery-'));
  const db = createAgoraDatabase({ dbPath: join(dir, 'task-recovery.db') });
  runMigrations(db);
  return {
    dir,
    db,
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function getCurrentStageOrThrowForTest(taskRecord: TaskRecord) {
  const stage = taskRecord.workflow.stages?.find((candidate: NonNullable<TaskRecord['workflow']['stages']>[number]) => candidate.id === taskRecord.current_stage);
  if (!stage) {
    throw new Error(`missing stage ${taskRecord.current_stage ?? '<null>'}`);
  }
  return stage;
}

describe('TaskRecoveryService', () => {
  it('blocks impacted active tasks during startup recovery scan and mirrors the block event', () => {
    const fixture = makeDb();
    try {
      const { db } = fixture;
      const taskRepository = new TaskRepository(db);
      const taskContextBindingRepository = new TaskContextBindingRepository(db);
      const flowLogRepository = new FlowLogRepository(db);
      const inboxRepository = new InboxRepository(db);
      const task = taskRepository.insertTask({
        id: 'OC-RECOVERY-1',
        title: 'startup recovery',
        description: '',
        type: 'coding',
        creator: 'archon',
        priority: 'normal',
        locale: 'zh-CN',
        workflow: {
          type: 'custom',
          stages: [
            { id: 'build', mode: 'execute', gate: { type: 'all_subtasks_done' } },
          ],
        },
        team: {
          members: [
            { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
          ],
        },
      });
      taskRepository.updateTask(task.id, task.version, {
        state: 'active',
        current_stage: 'build',
      });
      const mirrored: Array<{ taskId: string; body: string }> = [];
      const service = new TaskRecoveryService({
        databasePort: db,
        taskRepository,
        taskContextBindingRepository,
        flowLogRepository,
        inboxRepository,
        escalationPolicy: {
          controllerAfterMs: 1_000,
          rosterAfterMs: 2_000,
          inboxAfterMs: 3_000,
        },
        getCraftsmanGovernanceSnapshot: () => ({
          active_executions: 0,
          active_by_assignee: [],
          active_execution_details: [],
          host_pressure_status: 'healthy',
          warnings: [],
          host: null,
        }),
        assertTaskRuntimeControl: () => {},
        resolveTaskRuntimeParticipant: () => ({
          runtime_provider: null,
          runtime_actor_ref: null,
        }),
        getCraftsmanExecution: () => ({
          execution_id: 'exec-1',
          task_id: 'OC-RECOVERY-1',
          subtask_id: 'sub-1',
          adapter: 'claude',
          session_id: null,
          workdir: null,
          status: 'running',
        }),
        getSubtaskOrThrow: () => ({
          id: 'sub-1',
          assignee: 'opus',
          stage_id: 'build',
        }),
        assertSubtaskControl: () => {},
        publishTaskStatusBroadcast: () => {},
        mirrorConversationEntry: (taskId, input) => {
          mirrored.push({ taskId, body: input.body });
        },
        buildSchedulerSnapshot: () => ({
          captured_at: '2026-03-12T00:00:00.000Z',
          reason: 'startup_recovery_scan',
          state: 'active',
          current_stage: 'build',
          error_detail: null,
          pending_subtasks: [],
          inflight_executions: [],
        }),
        failMissingCraftsmanSessions: () => [{ subtask_id: 'sub-1', execution_ids: ['exec-1', 'exec-2'] }],
        resolveLatestBusinessActivityMs: () => 0,
        getProbeState: () => ({
          controllerNotified: false,
          rosterNotified: false,
          humanApprovalNotified: false,
          inboxRaised: false,
        }),
        resolveApprovalWaitProbe: () => null,
        getCurrentStageOrThrow: getCurrentStageOrThrowForTest,
        checkGate: () => false,
        advanceTimedOutTask: (taskRecord) => taskRecord,
      });

      const result = service.startupRecoveryScan();
      const updated = taskRepository.getTask('OC-RECOVERY-1');

      expect(result).toEqual({
        scanned_tasks: 1,
        blocked_tasks: 1,
        failed_subtasks: 1,
        failed_executions: 2,
      });
      expect(updated?.state).toBe('blocked');
      expect(updated?.error_detail).toBe('startup recovery blocked task after missing craftsmen sessions');
      expect(flowLogRepository.listByTask('OC-RECOVERY-1').map((entry) => entry.event)).toEqual(
        expect.arrayContaining(['state_changed', 'blocked']),
      );
      expect(mirrored).toEqual([
        {
          taskId: 'OC-RECOVERY-1',
          body: 'Task blocked: startup recovery blocked task after missing craftsmen sessions',
        },
      ]);
    } finally {
      fixture.cleanup();
    }
  });

  it('sends a human approval ping when an approval-waiting task stays idle past the controller threshold', () => {
    const fixture = makeDb();
    try {
      const { db } = fixture;
      const taskRepository = new TaskRepository(db);
      const taskContextBindingRepository = new TaskContextBindingRepository(db);
      const flowLogRepository = new FlowLogRepository(db);
      const inboxRepository = new InboxRepository(db);
      const task = taskRepository.insertTask({
        id: 'OC-RECOVERY-2',
        title: 'approval waiting',
        description: '',
        type: 'coding',
        creator: 'archon',
        priority: 'normal',
        locale: 'zh-CN',
        workflow: {
          type: 'custom',
          stages: [
            { id: 'review', mode: 'discuss', gate: { type: 'approval', approver: 'reviewer' } },
          ],
        },
        team: {
          members: [
            { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
            { role: 'reviewer', agentId: 'glm5', member_kind: 'citizen', model_preference: 'review' },
          ],
        },
      });
      taskRepository.updateTask(task.id, task.version, {
        state: 'active',
        current_stage: 'review',
      });

      const broadcasts: Array<{
        taskId: string;
        kind: string;
        participantRefs: string[] | undefined;
        ensureParticipantRefsJoined: string[] | undefined;
        bodyLines: string[];
      }> = [];
      const service = new TaskRecoveryService({
        databasePort: db,
        taskRepository,
        taskContextBindingRepository,
        flowLogRepository,
        inboxRepository,
        escalationPolicy: {
          controllerAfterMs: 1_000,
          rosterAfterMs: 2_000,
          inboxAfterMs: 3_000,
        },
        getCraftsmanGovernanceSnapshot: () => ({
          active_executions: 0,
          active_by_assignee: [],
          active_execution_details: [],
          host_pressure_status: 'healthy',
          warnings: [],
          host: null,
        }),
        assertTaskRuntimeControl: () => {},
        resolveTaskRuntimeParticipant: () => ({
          runtime_provider: null,
          runtime_actor_ref: null,
        }),
        getCraftsmanExecution: () => ({
          execution_id: 'exec-2',
          task_id: 'OC-RECOVERY-2',
          subtask_id: 'sub-2',
          adapter: 'claude',
          session_id: null,
          workdir: null,
          status: 'running',
        }),
        getSubtaskOrThrow: () => ({
          id: 'sub-2',
          assignee: 'glm5',
          stage_id: 'review',
        }),
        assertSubtaskControl: () => {},
        publishTaskStatusBroadcast: (taskRecord, input) => {
          broadcasts.push({
            taskId: taskRecord.id,
            kind: input.kind,
            participantRefs: input.participantRefs,
            ensureParticipantRefsJoined: input.ensureParticipantRefsJoined,
            bodyLines: input.bodyLines,
          });
        },
        mirrorConversationEntry: () => {},
        buildSchedulerSnapshot: () => null,
        failMissingCraftsmanSessions: () => [],
        resolveLatestBusinessActivityMs: () => 0,
        getProbeState: () => ({
          controllerNotified: false,
          rosterNotified: false,
          humanApprovalNotified: false,
          inboxRaised: false,
        }),
        resolveApprovalWaitProbe: () => ({
          request: { id: 'approval-1' },
          participantRefs: ['human-reviewer-1'],
        }),
        getCurrentStageOrThrow: getCurrentStageOrThrowForTest,
        checkGate: () => false,
        advanceTimedOutTask: (taskRecord) => taskRecord,
      });

      const result = service.probeInactiveTasks({
        controllerAfterMs: 1_000,
        rosterAfterMs: 2_000,
        inboxAfterMs: 3_000,
        now: new Date('2026-03-12T01:00:00.000Z'),
      });

      expect(result).toEqual({
        scanned_tasks: 1,
        timeout_advances: 0,
        controller_pings: 0,
        roster_pings: 0,
        human_pings: 1,
        inbox_items: 0,
      });
      expect(broadcasts).toEqual([
        expect.objectContaining({
          taskId: 'OC-RECOVERY-2',
          kind: 'human_approval_pinged',
          participantRefs: ['human-reviewer-1'],
          ensureParticipantRefsJoined: ['human-reviewer-1'],
        }),
      ]);
      expect(flowLogRepository.listByTask('OC-RECOVERY-2').map((entry) => entry.event)).toEqual(
        expect.arrayContaining(['human_approval_pinged']),
      );
    } finally {
      fixture.cleanup();
    }
  });

  it('auto-advances timed-out auto-timeout stages before human inactivity escalation', () => {
    const fixture = makeDb();
    try {
      const { db } = fixture;
      const taskRepository = new TaskRepository(db);
      const taskContextBindingRepository = new TaskContextBindingRepository(db);
      const flowLogRepository = new FlowLogRepository(db);
      const inboxRepository = new InboxRepository(db);
      const task = taskRepository.insertTask({
        id: 'OC-RECOVERY-3',
        title: 'timeout edge',
        description: '',
        type: 'custom',
        creator: 'archon',
        priority: 'normal',
        locale: 'zh-CN',
        workflow: {
          type: 'custom',
          stages: [
            { id: 'wait', mode: 'discuss', gate: { type: 'auto_timeout', timeout_sec: 30 } },
            { id: 'escalate', mode: 'discuss', gate: { type: 'command' } },
          ],
        },
        team: {
          members: [
            { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
          ],
        },
      });
      taskRepository.updateTask(task.id, task.version, {
        state: 'active',
        current_stage: 'wait',
      });

      let advanced = false;
      const service = new TaskRecoveryService({
        databasePort: db,
        taskRepository,
        taskContextBindingRepository,
        flowLogRepository,
        inboxRepository,
        escalationPolicy: {
          controllerAfterMs: 1_000,
          rosterAfterMs: 2_000,
          inboxAfterMs: 3_000,
        },
        getCraftsmanGovernanceSnapshot: () => ({
          active_executions: 0,
          active_by_assignee: [],
          active_execution_details: [],
          host_pressure_status: 'healthy',
          warnings: [],
          host: null,
        }),
        assertTaskRuntimeControl: () => {},
        resolveTaskRuntimeParticipant: () => ({
          runtime_provider: null,
          runtime_actor_ref: null,
        }),
        getCraftsmanExecution: () => ({
          execution_id: 'exec-3',
          task_id: 'OC-RECOVERY-3',
          subtask_id: 'sub-3',
          adapter: 'claude',
          session_id: null,
          workdir: null,
          status: 'running',
        }),
        getSubtaskOrThrow: () => ({
          id: 'sub-3',
          assignee: 'opus',
          stage_id: 'wait',
        }),
        assertSubtaskControl: () => {},
        publishTaskStatusBroadcast: () => {},
        mirrorConversationEntry: () => {},
        buildSchedulerSnapshot: () => null,
        failMissingCraftsmanSessions: () => [],
        resolveLatestBusinessActivityMs: () => 0,
        getProbeState: () => ({
          controllerNotified: false,
          rosterNotified: false,
          humanApprovalNotified: false,
          inboxRaised: false,
        }),
        resolveApprovalWaitProbe: () => null,
        getCurrentStageOrThrow: getCurrentStageOrThrowForTest,
        checkGate: () => true,
        advanceTimedOutTask: (taskRecord) => {
          advanced = true;
          return taskRepository.updateTask(taskRecord.id, taskRecord.version, {
            current_stage: 'escalate',
          });
        },
      });

      const result = service.probeInactiveTasks({
        controllerAfterMs: 1_000,
        rosterAfterMs: 2_000,
        inboxAfterMs: 3_000,
        now: new Date('2026-04-11T01:00:00.000Z'),
      });

      expect(advanced).toBe(true);
      expect(result).toEqual({
        scanned_tasks: 1,
        timeout_advances: 1,
        controller_pings: 0,
        roster_pings: 0,
        human_pings: 0,
        inbox_items: 0,
      });
    } finally {
      fixture.cleanup();
    }
  });
});
