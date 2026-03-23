import { describe, expect, it } from 'vitest';
import type { TeamDto } from '@agora-ts/contracts';
import { PermissionService } from './permission-service.js';

const team: TeamDto = {
  members: [
    { role: 'architect', agentId: 'opus', model_preference: 'strong_reasoning' },
    { role: 'reviewer', agentId: 'sonnet', model_preference: 'review' },
  ],
};

describe('permission service', () => {
  it('allows controller and archon to advance regardless of allowAgents fallback', () => {
    const permissions = new PermissionService({
      archonUsers: ['archon'],
      allowAgents: {
        '*': { canCall: [], canAdvance: false },
      },
    });
    const controllerTeam: TeamDto = {
      members: [
        { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
        { role: 'reviewer', agentId: 'sonnet', model_preference: 'review' },
      ],
    };

    expect(permissions.canAdvance('opus', controllerTeam)).toBe(true);
    expect(permissions.canAdvance('archon', controllerTeam)).toBe(true);
    expect(permissions.canAdvance('sonnet', controllerTeam)).toBe(false);
  });

  it('honors allowAgents canAdvance for non-controller agents', () => {
    const permissions = new PermissionService({
      archonUsers: ['archon'],
      allowAgents: {
        opus: { canCall: ['sonnet'], canAdvance: true },
        sonnet: { canCall: [], canAdvance: false },
        '*': { canCall: [], canAdvance: false },
      },
    });

    expect(permissions.canAdvance('opus', team)).toBe(true);
    expect(permissions.canAdvance('sonnet', team)).toBe(false);
    expect(permissions.canAdvance('archon', team)).toBe(true);
  });

  it('supports canCall with explicit and wildcard allowAgents entries', () => {
    const permissions = new PermissionService({
      archonUsers: ['archon'],
      allowAgents: {
        opus: { canCall: ['sonnet', 'glm5'], canAdvance: true },
        '*': { canCall: ['haiku'], canAdvance: false },
      },
    });

    expect(permissions.canCall('opus', 'sonnet')).toBe(true);
    expect(permissions.canCall('opus', 'haiku')).toBe(false);
    expect(permissions.canCall('unknown', 'haiku')).toBe(true);
    expect(permissions.canCall('unknown', 'sonnet')).toBe(false);
  });

  it('falls back to default archon users when config passes an empty archonUsers list', () => {
    const permissions = new PermissionService({
      archonUsers: [],
      allowAgents: {
        '*': { canCall: [], canAdvance: false },
      },
    });

    expect(permissions.isArchon('archon')).toBe(true);
    expect(permissions.isArchon('lizeyu')).toBe(true);
  });
});
