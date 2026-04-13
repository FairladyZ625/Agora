import { describe, expect, it } from 'vitest';
import { buildLiveRegressionRecipe } from './live-regression-recipes.js';

describe('buildLiveRegressionRecipe', () => {
  it('builds the default command-gated recipe', () => {
    const recipe = buildLiveRegressionRecipe('command-gated', {
      taskId: 'OC-REG-RECIPE-1',
    });

    expect(recipe).toMatchObject({
      name: 'command-gated',
      expectCurrentStage: 'execute',
      participantRefs: ['glm5'],
      target: {
        createTask: {
          control: { mode: 'regression_test' },
          workflow_override: {
            stages: [
              { id: 'triage', gate: { type: 'command' } },
              { id: 'execute', gate: { type: 'all_subtasks_done' } },
            ],
          },
        },
      },
    });
    expect(recipe.taskAction).toBeUndefined();
  });

  it('builds an approval-gated recipe that relies on automatic reviewer approval', () => {
    const recipe = buildLiveRegressionRecipe('approval-gated', {
      taskId: 'OC-REG-RECIPE-2',
      title: 'Approval recipe smoke',
    });

    expect(recipe).toMatchObject({
      name: 'approval-gated',
      expectCurrentStage: 'execute',
      participantRefs: ['glm5', 'haiku'],
      target: {
        createTask: {
          title: 'Approval recipe smoke',
          workflow_override: {
            stages: [
              { id: 'review', gate: { type: 'approval', approver_role: 'reviewer' } },
              { id: 'execute', gate: { type: 'all_subtasks_done' } },
            ],
          },
        },
      },
    });
    expect(recipe.taskAction).toBeUndefined();
  });

  it('builds an archon-review-gated recipe that relies on automatic archon approval', () => {
    const recipe = buildLiveRegressionRecipe('archon-review-gated', {
      taskId: 'OC-REG-RECIPE-ARCHON',
    });

    expect(recipe).toMatchObject({
      name: 'archon-review-gated',
      expectCurrentStage: 'execute',
      participantRefs: ['glm5'],
      target: {
        createTask: {
          workflow_override: {
            stages: [
              { id: 'review', gate: { type: 'archon_review' } },
              { id: 'execute', gate: { type: 'all_subtasks_done' } },
            ],
          },
        },
      },
    });
    expect(recipe.taskAction).toBeUndefined();
  });

  it('builds a quorum-gated recipe that relies on automatic in-roster voting', () => {
    const recipe = buildLiveRegressionRecipe('quorum-gated', {
      taskId: 'OC-REG-RECIPE-3',
    });

    expect(recipe).toMatchObject({
      name: 'quorum-gated',
      expectCurrentStage: 'vote',
      participantRefs: ['glm5', 'haiku'],
      target: {
        createTask: {
          workflow_override: {
            stages: [
              {
                id: 'vote',
                gate: { type: 'quorum', required: 2 },
                roster: { include_roles: ['reviewer'], keep_controller: false },
              },
              { id: 'execute', gate: { type: 'all_subtasks_done' } },
            ],
          },
        },
      },
    });
    expect(recipe.taskAction).toBeUndefined();
  });

  it('builds an auto-timeout-gated recipe with deterministic wait settings', () => {
    const recipe = buildLiveRegressionRecipe('auto-timeout-gated', {
      taskId: 'OC-REG-RECIPE-TIMEOUT',
    });

    expect(recipe).toMatchObject({
      name: 'auto-timeout-gated',
      expectCurrentStage: 'escalate',
      participantRefs: ['glm5'],
      waitFor: {
        currentStage: 'escalate',
        timeoutMs: 4000,
        pollIntervalMs: 250,
        driveAutoTimeouts: true,
      },
      target: {
        createTask: {
          workflow_override: {
            stages: [
              { id: 'wait', gate: { type: 'auto_timeout', timeout_sec: 1 } },
              { id: 'escalate', gate: { type: 'command' } },
            ],
          },
        },
      },
    });
    expect(recipe.taskAction).toBeUndefined();
  });
});
