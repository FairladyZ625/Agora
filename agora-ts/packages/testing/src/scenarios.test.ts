import { afterEach, describe, expect, it } from 'vitest';
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
      'inbox-promote',
      'authoring-smoke',
      'craftsman-happy-path',
      'craftsman-callback-failure',
      'craftsman-retry',
      'craftsman-timeout-escalation',
    ]);
  });

  it('runs a happy path scenario to completion', () => {
    runtime = createTestRuntime({
      taskIdGenerator: () => 'OC-900',
    });

    const result = runScenario(runtime, 'happy-path');

    expect(result.name).toBe('happy-path');
    expect(result.taskId).toBe('OC-900');
    expect(result.finalState).toBe('done');
    expect(result.events).toEqual(
      expect.arrayContaining(['state_changed', 'archon_approved', 'subtask_done', 'stage_advanced', 'gate_passed']),
    );
  });

  it('runs a reject/rework scenario and records both rejection and final approval', () => {
    runtime = createTestRuntime();

    const result = runScenario(runtime, 'reject-rework');

    expect(result.name).toBe('reject-rework');
    expect(result.finalState).toBe('done');
    expect(result.events).toEqual(
      expect.arrayContaining(['rejected', 'gate_failed', 'gate_passed', 'stage_advanced']),
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

    expect(result.name).toBe('cleanup-orphaned');
    expect(result.cleaned).toBe(1);
    expect(result.taskId).toBe('OC-CLEAN');
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
});
