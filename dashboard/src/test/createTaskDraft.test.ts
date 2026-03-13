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
    defaultTeamRoles: ['architect', 'developer', 'craftsman'],
    defaultTeam: [
      { role: 'architect', memberKind: 'controller', modelPreference: 'strong_reasoning', suggested: ['opus'] },
      { role: 'developer', memberKind: 'citizen', modelPreference: 'fast_coding', suggested: ['sonnet'] },
      { role: 'craftsman', memberKind: 'craftsman', modelPreference: 'coding_cli', suggested: ['claude_code', 'codex'] },
    ],
    raw: {},
  };
}

describe('create task draft helpers', () => {
  it('initializes role assignments from template suggestions when agents exist', () => {
    const assignments = buildInitialRoleAssignments(buildTemplate(), {
      agents: [
        buildAgent('opus'),
        buildAgent('sonnet'),
        buildAgent('codex'),
      ],
      craftsmen: [
        { id: 'claude', label: 'Claude Code', selectable: true },
        { id: 'codex', label: 'Codex', selectable: true },
        { id: 'gemini', label: 'Gemini CLI', selectable: true },
      ],
    });

    expect(assignments).toEqual({
      architect: 'opus',
      developer: 'sonnet',
      craftsman: 'claude',
    });
  });

  it('builds a private-thread create payload without inviting craftsman adapters into participant refs', () => {
    const payload = buildCreateTaskInput({
      title: '实现动态选人',
      description: 'create flow',
      priority: 'high',
      locale: 'zh-CN',
      template: buildTemplate(),
      type: 'coding',
      visibility: 'private',
      assignments: {
        architect: 'opus',
        developer: 'codex',
        craftsman: 'claude',
      },
    });

    expect(payload).toMatchObject({
      title: '实现动态选人',
      type: 'coding',
      team_override: {
        members: [
          { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
          { role: 'developer', agentId: 'codex', member_kind: 'citizen', model_preference: 'fast_coding' },
          { role: 'craftsman', agentId: 'claude', member_kind: 'craftsman', model_preference: 'coding_cli' },
        ],
      },
      im_target: {
        provider: 'discord',
        visibility: 'private',
        participant_refs: ['opus', 'codex'],
      },
    });
  });

  it('fills empty model_preference strings for roles that omit a preference in the template', () => {
    const template = buildTemplate();
    template.defaultTeam = [
      { role: 'architect', memberKind: 'controller', modelPreference: null, suggested: ['opus'] },
      { role: 'developer', memberKind: 'citizen', modelPreference: null, suggested: ['sonnet'] },
    ];

    const payload = buildCreateTaskInput({
      title: 'null model preference payload',
      description: '',
      priority: 'normal',
      locale: 'zh-CN',
      template,
      type: 'coding',
      visibility: 'private',
      assignments: {
        architect: 'opus',
        developer: 'sonnet',
      },
    });

    expect(payload.team_override?.members).toEqual([
      { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: '' },
      { role: 'developer', agentId: 'sonnet', member_kind: 'citizen', model_preference: '' },
    ]);
  });
});
