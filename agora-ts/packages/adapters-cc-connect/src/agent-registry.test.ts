import { describe, expect, it } from 'vitest';
import { CcConnectAgentRegistry } from './agent-registry.js';

describe('CcConnectAgentRegistry', () => {
  it('maps configured cc-connect projects into provider-neutral inventory entries', () => {
    const registry = new CcConnectAgentRegistry({
      env: {
        AGORA_CC_CONNECT_CONFIG_PATHS: '/tmp/cc-connect.toml',
      },
      exists: () => true,
      readFile: () => `
[management]
enabled = true
port = 9820
token = "secret"

[[projects]]
name = "agora-codex"

[projects.agent]
type = "codex"

[projects.agent.options]
work_dir = "/repo/agora"
model = "gpt-5.4"

[[projects.platforms]]
type = "discord"

[[projects]]
name = "agora-claude"

[projects.agent]
type = "claude"

[projects.agent.options]
work_dir = "/repo/claude"

[[projects.platforms]]
type = "slack"
`,
    });

    expect(registry.listAgents()).toEqual([
      {
        id: 'cc-connect:agora-claude',
        host_framework: 'cc-connect',
        channel_providers: ['slack'],
        inventory_sources: ['cc-connect'],
        primary_model: null,
        workspace_dir: '/repo/claude',
        agent_origin: 'user_managed',
      },
      {
        id: 'cc-connect:agora-codex',
        host_framework: 'cc-connect',
        channel_providers: ['discord'],
        inventory_sources: ['cc-connect'],
        primary_model: 'gpt-5.4',
        workspace_dir: '/repo/agora',
        agent_origin: 'user_managed',
      },
    ]);
  });

  it('returns an empty inventory when no configured targets exist', () => {
    const registry = new CcConnectAgentRegistry({
      env: {
        AGORA_CC_CONNECT_CONFIG_PATHS: '/tmp/missing.toml',
      },
      exists: () => false,
    });

    expect(registry.listAgents()).toEqual([]);
  });
});
