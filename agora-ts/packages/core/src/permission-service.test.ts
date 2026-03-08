import { describe, expect, it } from 'vitest';
import { PermissionService } from './permission-service.js';

const team = {
  members: [
    { role: 'architect', agentId: 'opus', model_preference: 'strong_reasoning' },
    { role: 'reviewer', agentId: 'sonnet', model_preference: 'review' },
  ],
};

describe('permission service', () => {
  it('honors allowAgents canAdvance instead of granting every team member advance rights', () => {
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
});
