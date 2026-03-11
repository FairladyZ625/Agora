import { describe, expect, it } from 'vitest';
import type { AgentStatusItem, TemplateDetail } from '@/types/dashboard';
import { buildCreateTaskInput, buildInitialRoleAssignments } from '@/lib/createTaskDraft';

function buildAgent(id: string): AgentStatusItem {
  return {
    id,
    role: null,
    status: 'idle',
    presence: 'online',
    presenceReason: null,
    channelProviders: ['discord'],
    hostFramework: 'openclaw',
    inventorySources: ['discord', 'openclaw'],
    primaryModel: null,
    workspaceDir: null,
    accountId: id,
    activeTaskIds: [],
    activeSubtaskIds: [],
    taskCount: 0,
    subtaskCount: 0,
    load: 0,
    lastActiveAt: null,
    lastSeenAt: null,
  };
}

function buildTemplate(): TemplateDetail {
  return {
    id: 'coding',
    name: '编码任务',
    type: 'coding',
    description: 'coding',
    governance: 'standard',
    stageCount: 2,
    stages: [
      { id: 'discuss', name: '讨论', mode: 'discuss', gateType: 'archon_review' },
      { id: 'develop', name: '开发', mode: 'execute', gateType: 'all_subtasks_done' },
    ],
    defaultTeamRoles: ['architect', 'developer'],
    defaultTeam: [
      { role: 'architect', modelPreference: 'strong_reasoning', suggested: ['opus'] },
      { role: 'developer', modelPreference: 'fast_coding', suggested: ['sonnet'] },
    ],
    raw: {},
  };
}

describe('create task draft helpers', () => {
  it('initializes role assignments from template suggestions when agents exist', () => {
    const assignments = buildInitialRoleAssignments(buildTemplate(), [
      buildAgent('opus'),
      buildAgent('sonnet'),
      buildAgent('codex'),
    ]);

    expect(assignments).toEqual({
      architect: 'opus',
      developer: 'sonnet',
    });
  });

  it('builds a private-thread create payload with team override from selected roles', () => {
    const payload = buildCreateTaskInput({
      title: '实现动态选人',
      description: 'create flow',
      priority: 'high',
      template: buildTemplate(),
      type: 'coding',
      visibility: 'private',
      assignments: {
        architect: 'opus',
        developer: 'codex',
      },
    });

    expect(payload).toMatchObject({
      title: '实现动态选人',
      type: 'coding',
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
  });
});
