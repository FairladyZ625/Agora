import { afterEach, describe, expect, it } from 'vitest';
import { ArchiveJobRepository, CraftsmanExecutionRepository, SubtaskRepository } from '@agora-ts/db';
import { createTestRuntime, runScenario, scenarioNames } from './index.js';

let runtime: ReturnType<typeof createTestRuntime> | null = null;

afterEach(() => {
  runtime?.cleanup();
  runtime = null;
});

describe('agora-ts testing scenarios', () => {
  it('exposes the supported scenario names', () => {
    expect(scenarioNames).toEqual([
      'happy-path',
      'reject-rework',
      'quorum-approve',
      'cleanup-orphaned',
      'archive-notify',
      'archive-receipt',
      'unblock-retry',
      'unblock-skip',
      'unblock-reassign',
      'pause-resume-deferred-callback',
      'pause-resume-missing-session',
      'startup-recovery-missing-session',
      'cancel-active-task',
      'inbox-promote',
      'authoring-smoke',
      'craftsman-happy-path',
      'craftsman-callback-failure',
      'craftsman-concurrency-limit',
      'craftsman-workdir-isolation',
      'craftsman-retry',
      'craftsman-timeout-escalation',
      'craftsman-callback-notify-outbox',
      'runtime-session-binding',
    ]);
  });

  it('runs a happy path scenario to completion', () => {
    runtime = createTestRuntime({
      taskIdGenerator: () => 'OC-900',
    });

    const result = runScenario(runtime, 'happy-path');
    const archives = new ArchiveJobRepository(runtime.db);

    expect(result.name).toBe('happy-path');
    expect(result.taskId).toBe('OC-900');
    expect(result.finalState).toBe('done');
    expect(result.events).toEqual(
      expect.arrayContaining(['state_changed', 'archon_approved', 'subtask_done', 'stage_advanced', 'gate_passed']),
    );
    expect(archives.listArchiveJobs({ taskId: 'OC-900' })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          task_id: 'OC-900',
          status: 'pending',
        }),
      ]),
    );
  });

  it('runs a reject/rework scenario and records both rejection and final approval', () => {
    runtime = createTestRuntime();

    const result = runScenario(runtime, 'reject-rework');

    expect(result.name).toBe('reject-rework');
    expect(result.finalState).toBe('done');
    expect(result.completedSubtasks).toEqual(expect.arrayContaining(['write-rework', 'write-rework-2']));
    expect(result.events).toEqual(
      expect.arrayContaining(['rejected', 'gate_failed', 'stage_rewound', 'gate_passed', 'stage_advanced']),
    );
  });

  it('runs a quorum scenario and advances after the required votes are met', () => {
    runtime = createTestRuntime();

    const result = runScenario(runtime, 'quorum-approve');

    expect(result.name).toBe('quorum-approve');
    expect(result.finalState).toBe('done');
    expect(result.quorum).toEqual({ approved: 2, total: 2 });
    expect(result.events).toContain('quorum_vote');
  });

  it('runs cleanup for orphaned tasks', () => {
    runtime = createTestRuntime();

    const result = runScenario(runtime, 'cleanup-orphaned');
    const executions = new CraftsmanExecutionRepository(runtime.db);

    expect(result.name).toBe('cleanup-orphaned');
    expect(result.cleaned).toBe(1);
    expect(result.taskId).toBe('OC-CLEAN');
    expect(result.executions).toEqual(['exec-cleanup-1']);
    expect(executions.getExecution('exec-cleanup-1')).toBeNull();
  });

  it('runs archive notify and writes a writer outbox artifact', () => {
    runtime = createTestRuntime({
      taskIdGenerator: () => 'OC-ARCHIVE-NOTIFY',
    });

    const result = runScenario(runtime, 'archive-notify');
    const archives = new ArchiveJobRepository(runtime.db);

    expect(result.name).toBe('archive-notify');
    expect(result.taskId).toBe('OC-ARCHIVE-NOTIFY');
    expect(result.finalState).toBe('done');
    expect(archives.listArchiveJobs({ taskId: 'OC-ARCHIVE-NOTIFY' })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'notified',
          payload: expect.objectContaining({
            notification_receipt: expect.objectContaining({
              notification_id: 'archive-job-1',
            }),
          }),
        }),
      ]),
    );
  });

  it('runs archive receipt and advances the job to synced', () => {
    runtime = createTestRuntime({
      taskIdGenerator: () => 'OC-ARCHIVE-RECEIPT',
    });

    const result = runScenario(runtime, 'archive-receipt');
    const archives = new ArchiveJobRepository(runtime.db);

    expect(result.name).toBe('archive-receipt');
    expect(result.taskId).toBe('OC-ARCHIVE-RECEIPT');
    expect(result.finalState).toBe('done');
    expect(archives.listArchiveJobs({ taskId: 'OC-ARCHIVE-RECEIPT' })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'synced',
          commit_hash: 'archive-receipt-commit',
        }),
      ]),
    );
  });

  it('runs unblock retry and resets failed subtasks for the current stage', () => {
    runtime = createTestRuntime({
      taskIdGenerator: () => 'OC-UNBLOCK',
    });

    const result = runScenario(runtime, 'unblock-retry');
    const subtasks = new SubtaskRepository(runtime.db);

    expect(result.name).toBe('unblock-retry');
    expect(result.taskId).toBe('OC-UNBLOCK');
    expect(result.finalState).toBe('active');
    expect(result.events).toEqual(expect.arrayContaining(['blocked', 'unblocked']));
    expect(subtasks.listByTask('OC-UNBLOCK')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'retry-subtask',
          status: 'not_started',
          output: null,
          craftsman_session: null,
          dispatch_status: null,
          dispatched_at: null,
          done_at: null,
        }),
      ]),
    );
  });

  it('runs unblock skip and marks failed subtasks done for the current stage', () => {
    runtime = createTestRuntime({
      taskIdGenerator: () => 'OC-SKIP',
    });

    const result = runScenario(runtime, 'unblock-skip');
    const subtasks = new SubtaskRepository(runtime.db);

    expect(result.name).toBe('unblock-skip');
    expect(result.taskId).toBe('OC-SKIP');
    expect(result.finalState).toBe('active');
    expect(result.events).toEqual(expect.arrayContaining(['blocked', 'unblocked']));
    expect(subtasks.listByTask('OC-SKIP')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'skip-subtask',
          status: 'done',
          output: 'Skipped by archon: skip now',
          craftsman_session: null,
          dispatch_status: 'skipped',
        }),
      ]),
    );
  });

  it('runs unblock reassign and resets failed subtasks to a new assignee', () => {
    runtime = createTestRuntime({
      taskIdGenerator: () => 'OC-REASSIGN',
    });

    const result = runScenario(runtime, 'unblock-reassign');
    const subtasks = new SubtaskRepository(runtime.db);

    expect(result.name).toBe('unblock-reassign');
    expect(result.taskId).toBe('OC-REASSIGN');
    expect(result.finalState).toBe('active');
    expect(result.events).toEqual(expect.arrayContaining(['blocked', 'unblocked']));
    expect(subtasks.listByTask('OC-REASSIGN')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'reassign-subtask',
          status: 'not_started',
          assignee: 'claude',
          craftsman_type: 'claude',
          output: null,
          craftsman_session: null,
          dispatch_status: null,
        }),
      ]),
    );
  });

  it('runs pause-resume deferred callback and settles the subtask on resume', () => {
    runtime = createTestRuntime({
      taskIdGenerator: () => 'OC-PAUSE',
      executionIdGenerator: () => 'exec-pause-1',
    });

    const result = runScenario(runtime, 'pause-resume-deferred-callback');
    const subtasks = new SubtaskRepository(runtime.db);

    expect(result.name).toBe('pause-resume-deferred-callback');
    expect(result.taskId).toBe('OC-PAUSE');
    expect(result.finalState).toBe('active');
    expect(result.executions).toEqual(['exec-pause-1']);
    expect(result.events).toEqual(expect.arrayContaining(['paused', 'craftsman_callback_deferred', 'resumed', 'subtask_done']));
    expect(subtasks.listByTask('OC-PAUSE')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'resume-subtask',
          status: 'done',
          output: 'done while paused',
          dispatch_status: 'succeeded',
        }),
      ]),
    );
  });

  it('runs pause-resume missing session and fails running work on resume', () => {
    runtime = createTestRuntime({
      taskIdGenerator: () => 'OC-DEAD',
    });

    const result = runScenario(runtime, 'pause-resume-missing-session');
    const subtasks = new SubtaskRepository(runtime.db);
    const executions = new CraftsmanExecutionRepository(runtime.db);

    expect(result.name).toBe('pause-resume-missing-session');
    expect(result.taskId).toBe('OC-DEAD');
    expect(result.finalState).toBe('active');
    expect(result.executions).toEqual(['exec-dead-1']);
    expect(result.events).toEqual(
      expect.arrayContaining(['paused', 'resumed', 'craftsman_session_missing_on_resume']),
    );
    expect(subtasks.listByTask('OC-DEAD')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'dead-subtask',
          status: 'failed',
          dispatch_status: 'failed',
          output: 'Craftsman session not alive on resume: tmux:dead',
        }),
      ]),
    );
    expect(executions.getExecution('exec-dead-1')).toMatchObject({
      status: 'failed',
      error: 'Craftsman session not alive on resume: tmux:dead',
      finished_at: expect.any(String),
    });
  });

  it('runs startup recovery missing session and blocks the task on boot scan', () => {
    runtime = createTestRuntime({
      isCraftsmanSessionAlive: (sessionId) => sessionId !== 'tmux:dead',
    });

    const result = runScenario(runtime, 'startup-recovery-missing-session');
    const subtasks = new SubtaskRepository(runtime.db);
    const executions = new CraftsmanExecutionRepository(runtime.db);

    expect(result.name).toBe('startup-recovery-missing-session');
    expect(result.taskId).toBe('OC-STARTUP');
    expect(result.finalState).toBe('blocked');
    expect(result.executions).toEqual(['exec-startup-dead-1']);
    expect(result.events).toEqual(
      expect.arrayContaining(['craftsman_session_missing_on_startup', 'blocked']),
    );
    expect(subtasks.listByTask('OC-STARTUP')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'startup-dead',
          status: 'failed',
          dispatch_status: 'failed',
          output: 'Craftsman session not alive on startup recovery: tmux:dead',
        }),
      ]),
    );
    expect(executions.getExecution('exec-startup-dead-1')).toMatchObject({
      status: 'failed',
      error: 'Craftsman session not alive on startup recovery: tmux:dead',
      finished_at: expect.any(String),
    });
  });

  it('runs a cancel-active-task scenario and closes open work', () => {
    runtime = createTestRuntime({
      taskIdGenerator: () => 'OC-CANCEL',
      executionIdGenerator: () => 'exec-cancel-1',
    });

    const result = runScenario(runtime, 'cancel-active-task');

    expect(result.name).toBe('cancel-active-task');
    expect(result.taskId).toBe('OC-CANCEL');
    expect(result.finalState).toBe('cancelled');
    expect(result.events).toContain('state_changed');
    expect(result.completedSubtasks).toEqual(['keep-done']);
    expect(result.executions).toEqual(['exec-cancel-1']);
  });

  it('runs an inbox promote scenario across todo and task targets', () => {
    runtime = createTestRuntime({
      taskIdGenerator: () => 'OC-INBOX',
    });

    const result = runScenario(runtime, 'inbox-promote');

    expect(result.name).toBe('inbox-promote');
    expect(result.taskId).toBe('OC-INBOX');
    expect(result.finalState).toBe('active');
    expect(result.events).toEqual(expect.arrayContaining(['state_changed']));
    expect(result.promotedTargets).toEqual({
      todo: '1',
      task: 'OC-INBOX',
    });
  });

  it('runs an authoring smoke scenario covering validate/save/duplicate/workflow update', () => {
    runtime = createTestRuntime();

    const result = runScenario(runtime, 'authoring-smoke');

    expect(result.name).toBe('authoring-smoke');
    expect(result.taskId).toBe('flow_editor_manual_copy');
    expect(result.finalState).toBe('valid');
    expect(result.templateChecks).toEqual({
      validated: true,
      saved: true,
      duplicated: true,
      workflowValidated: true,
    });
  });

  it('runs a craftsman happy-path scenario', () => {
    runtime = createTestRuntime({
      taskIdGenerator: () => 'OC-CRAFT-1',
      executionIdGenerator: () => 'exec-craft-1',
    });

    const result = runScenario(runtime, 'craftsman-happy-path');

    expect(result.taskId).toBe('OC-CRAFT-1');
    expect(result.executions).toEqual(['exec-craft-1']);
    expect(result.completedSubtasks).toEqual(['craft-1']);
    expect(result.events).toContain('subtask_done');
  });

  it('runs a craftsman concurrency limit scenario', () => {
    runtime = createTestRuntime({
      taskIdGenerator: () => 'OC-CRAFT-LIMIT',
      executionIdGenerator: () => 'exec-craft-limit-1',
      maxConcurrentRunning: 1,
    });

    const result = runScenario(runtime, 'craftsman-concurrency-limit');
    const subtasks = new SubtaskRepository(runtime.db);

    expect(result.taskId).toBe('OC-CRAFT-LIMIT');
    expect(result.executions).toEqual(['exec-craft-limit-1']);
    expect(result.finalState).toBe('active');
    expect(subtasks.listByTask('OC-CRAFT-LIMIT')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'craft-limit-1', dispatch_status: 'running' }),
        expect.objectContaining({ id: 'craft-limit-2', dispatch_status: null }),
      ]),
    );
  });

  it('runs a craftsman workdir isolation scenario', () => {
    runtime = createTestRuntime({
      taskIdGenerator: () => 'OC-CRAFT-ISO',
      executionIdGenerator: () => 'exec-craft-iso-1',
      workdirIsolator: {
        isolate: () => '/isolated/codex/repo',
      },
    });

    const result = runScenario(runtime, 'craftsman-workdir-isolation');
    const subtasks = new SubtaskRepository(runtime.db);

    expect(result.taskId).toBe('OC-CRAFT-ISO');
    expect(result.executions).toEqual(['exec-craft-iso-1']);
    expect(result.templateChecks?.validated).toBe(true);
    expect(subtasks.listByTask('OC-CRAFT-ISO')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'craft-isolated',
          craftsman_workdir: '/isolated/codex/repo',
        }),
      ]),
    );
  });

  it('runs craftsman failure and retry scenarios', () => {
    runtime = createTestRuntime({
      taskIdGenerator: (() => {
        let count = 0;
        return () => `OC-CRAFT-${++count}`;
      })(),
      executionIdGenerator: (() => {
        let count = 0;
        return () => `exec-craft-${++count}`;
      })(),
    });

    const failed = runScenario(runtime, 'craftsman-callback-failure');
    const retried = runScenario(runtime, 'craftsman-retry');

    expect(failed.events).toContain('subtask_failed');
    expect(retried.executions).toEqual(['exec-craft-2', 'exec-craft-3']);
    expect(retried.completedSubtasks).toEqual(['craft-retry']);
    expect(retried.events).toEqual(expect.arrayContaining(['subtask_failed', 'subtask_done']));
  });

  it('runs a craftsman timeout failure scenario', () => {
    runtime = createTestRuntime({
      taskIdGenerator: () => 'OC-CRAFT-TIMEOUT',
      executionIdGenerator: () => 'exec-timeout-1',
    });

    const result = runScenario(runtime, 'craftsman-timeout-escalation');

    expect(result.executions).toEqual(['exec-timeout-1']);
    expect(result.events).toContain('subtask_failed');
  });

  it('runs a runtime session binding scenario and tracks participant join state', () => {
    runtime = createTestRuntime({
      agentRuntimePort: {
        resolveAgent(agentRef: string) {
          return {
            agent_ref: agentRef,
            runtime_provider: 'openclaw',
            runtime_actor_ref: agentRef,
          };
        },
      },
    });

    const result = runScenario(runtime, 'runtime-session-binding');

    expect(result.name).toBe('runtime-session-binding');
    expect(result.finalState).toBe('active');
    expect(result.participantBindings).toEqual(expect.arrayContaining(['sonnet:joined']));
    expect(result.runtimeSessionRefs).toEqual(['agent:sonnet:discord:thread:scenario-92']);
  });
});
