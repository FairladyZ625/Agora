import type { TaskConversationInboundActionDto } from '@agora-ts/contracts';
import type { TaskService } from '@agora-ts/core';

export type LiveRegressionRecipeName = 'command-gated' | 'approval-gated' | 'quorum-gated';

export interface BuildLiveRegressionRecipeOptions {
  taskId: string;
  title?: string;
  goal?: string;
  message?: string;
}

export interface LiveRegressionRecipe {
  name: LiveRegressionRecipeName;
  goal: string;
  message: string;
  participantRefs: string[];
  expectCurrentStage: string;
  target: {
    createTask: Parameters<TaskService['createTask']>[0];
  };
  taskAction?: TaskConversationInboundActionDto;
}

export function buildLiveRegressionRecipe(
  recipeName: LiveRegressionRecipeName,
  options: BuildLiveRegressionRecipeOptions,
): LiveRegressionRecipe {
  const baseCreateTask: Parameters<TaskService['createTask']>[0] = {
    title: options.title ?? `Discord Regression Smoke ${options.taskId}`,
    type: 'coding',
    creator: 'archon',
    description: 'real discord live regression smoke',
    priority: 'normal',
    locale: 'zh-CN',
    control: { mode: 'regression_test' },
    team_override: {
      members: [
        { role: 'architect', agentId: 'glm5', member_kind: 'controller', model_preference: 'cost_regression' },
        { role: 'developer', agentId: 'glm47', member_kind: 'citizen', model_preference: 'cost_regression' },
        { role: 'reviewer', agentId: 'haiku', member_kind: 'citizen', model_preference: 'cost_regression' },
        { role: 'craftsman', agentId: 'claude_code', member_kind: 'craftsman', model_preference: 'coding_cli' },
      ],
    },
    im_target: {
      provider: 'discord',
      visibility: 'private',
    },
  };

  if (recipeName === 'approval-gated') {
    return {
      name: recipeName,
      goal: options.goal ?? 'verify approval-gated discord regression recipe',
      message: options.message ?? 'AgoraBot regression smoke: approve the current review gate and report blockers here.',
      participantRefs: ['glm5', 'haiku'],
      expectCurrentStage: 'execute',
      target: {
        createTask: {
          ...baseCreateTask,
          workflow_override: {
            type: 'custom',
            stages: [
              {
                id: 'review',
                mode: 'discuss',
                gate: { type: 'approval', approver_role: 'reviewer' },
              },
              {
                id: 'execute',
                mode: 'execute',
                gate: { type: 'all_subtasks_done' },
              },
            ],
          },
        },
      },
    };
  }

  if (recipeName === 'quorum-gated') {
    return {
      name: recipeName,
      goal: options.goal ?? 'verify quorum-gated discord regression recipe',
      message: options.message ?? 'AgoraBot regression smoke: cast the next quorum vote and report the tally here.',
      participantRefs: ['glm5', 'haiku'],
      expectCurrentStage: 'vote',
      target: {
        createTask: {
          ...baseCreateTask,
          workflow_override: {
            type: 'custom',
            stages: [
              {
                id: 'vote',
                mode: 'discuss',
                gate: { type: 'quorum', required: 2 },
                roster: {
                  include_roles: ['reviewer'],
                  keep_controller: false,
                },
              },
              {
                id: 'execute',
                mode: 'execute',
                gate: { type: 'all_subtasks_done' },
              },
            ],
          },
        },
      },
    };
  }

  return {
    name: 'command-gated',
    goal: options.goal ?? 'verify real discord regression smoke script',
    message: options.message ?? 'AgoraBot regression smoke: continue this command-gated task and report blockers here.',
    participantRefs: ['glm5'],
    expectCurrentStage: 'execute',
    target: {
      createTask: {
        ...baseCreateTask,
        workflow_override: {
          type: 'custom',
          stages: [
            {
              id: 'triage',
              mode: 'discuss',
              gate: { type: 'command' },
            },
            {
              id: 'execute',
              mode: 'execute',
              gate: { type: 'all_subtasks_done' },
            },
          ],
        },
      },
    },
  };
}
