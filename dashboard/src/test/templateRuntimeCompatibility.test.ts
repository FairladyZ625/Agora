import { describe, expect, it } from 'vitest';
import { evaluateTemplateRuntimeCompatibility } from '@/lib/templateRuntimeCompatibility';
import type { AgentStatusItem, TemplateTeamPresetMember } from '@/types/dashboard';

function buildAgent(id: string, presence: AgentStatusItem['presence'] = 'online'): AgentStatusItem {
  return {
    id,
    role: null,
    status: 'idle',
    presence,
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

describe('template runtime compatibility', () => {
  it('checks craftsman roles against tmux craftsman inventory instead of citizen agents', () => {
    const members: TemplateTeamPresetMember[] = [
      { role: 'architect', modelPreference: null, suggested: ['opus'] },
      { role: 'craftsman', modelPreference: null, suggested: ['claude_code', 'gemini_cli'] },
    ];

    const compatibility = evaluateTemplateRuntimeCompatibility(
      members,
      [buildAgent('opus'), buildAgent('sonnet')],
      ['codex', 'claude', 'gemini'],
    );

    expect(compatibility).toEqual([
      {
        role: 'architect',
        compatibleSuggested: ['opus'],
        unavailableSuggested: [],
        missingSuggested: [],
      },
      {
        role: 'craftsman',
        compatibleSuggested: ['claude', 'gemini'],
        unavailableSuggested: [],
        missingSuggested: [],
      },
    ]);
  });
});
