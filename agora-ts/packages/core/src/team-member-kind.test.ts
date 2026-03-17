import { describe, expect, it } from 'vitest';
import { isInteractiveParticipant, resolveControllerRef, resolveTeamMemberKind } from './team-member-kind.js';

describe('team member kind helpers', () => {
  it('infers member kind from explicit values and craftsman role fallback', () => {
    expect(resolveTeamMemberKind({ role: 'architect', member_kind: 'controller' })).toBe('controller');
    expect(resolveTeamMemberKind({ role: 'craftsman', member_kind: undefined })).toBe('craftsman');
    expect(resolveTeamMemberKind({ role: 'developer', member_kind: undefined })).toBe('citizen');
  });

  it('detects interactive participants and resolves controller refs', () => {
    expect(isInteractiveParticipant({ role: 'craftsman', member_kind: 'craftsman' })).toBe(false);
    expect(isInteractiveParticipant({ role: 'architect', member_kind: 'controller' })).toBe(true);
    expect(resolveControllerRef([
      { role: 'developer', member_kind: 'citizen', agentId: 'codex' },
      { role: 'architect', member_kind: 'controller', agentId: 'opus' },
    ])).toBe('opus');
    expect(resolveControllerRef([
      { role: 'developer', member_kind: 'citizen', agentId: 'codex' },
    ])).toBeNull();
  });
});
