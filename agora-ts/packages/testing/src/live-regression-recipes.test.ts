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
});
