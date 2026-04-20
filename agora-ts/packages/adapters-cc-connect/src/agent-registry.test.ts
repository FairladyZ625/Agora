import { describe, expect, it } from 'vitest';
import { CcConnectAgentRegistry, buildCcConnectDiscordParticipantUserIds } from './agent-registry.js';

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

[projects.platforms.options]
token = "MTQ5MTc4MTM0NDY2NDIyNzk0Mg.fake.fake"

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
        inventory_kind: 'runtime_target',
        host_framework: 'cc-connect',
        runtime_provider: 'cc-connect',
        runtime_flavor: 'claude-code',
        runtime_target_ref: 'cc-connect:agora-claude',
        channel_providers: ['slack'],
        inventory_sources: ['cc-connect'],
        primary_model: null,
        workspace_dir: '/repo/claude',
        discord_bot_user_ids: [],
        agent_origin: 'user_managed',
      },
      {
        id: 'cc-connect:agora-codex',
        inventory_kind: 'runtime_target',
        host_framework: 'cc-connect',
        runtime_provider: 'cc-connect',
        runtime_flavor: 'codex',
        runtime_target_ref: 'cc-connect:agora-codex',
        channel_providers: ['discord'],
        inventory_sources: ['cc-connect'],
        primary_model: 'gpt-5.4',
        workspace_dir: '/repo/agora',
        discord_bot_user_ids: ['1491781344664227942'],
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

  it('builds Discord participant user id mappings for cc-connect runtime targets', () => {
    expect(buildCcConnectDiscordParticipantUserIds([
      {
        configPath: '/tmp/cc-connect.toml',
        projectName: 'agora-codex',
        agentType: 'codex',
        runtimeFlavor: 'codex',
        workDir: '/repo/agora',
        primaryModel: 'gpt-5.4',
        channelProviders: ['discord'],
        discord: {
          bot_user_ids: ['1491781344664227942'],
        },
        management: {
          enabled: true,
          baseUrl: 'http://127.0.0.1:9820',
          token: 'secret',
        },
        bridge: {
          enabled: true,
          baseUrl: 'http://127.0.0.1:9810/bridge/ws',
          token: 'bridge-secret',
          path: '/bridge/ws',
        },
      },
      {
        configPath: '/tmp/cc-connect.toml',
        projectName: 'agora-slack',
        agentType: 'claude',
        runtimeFlavor: 'claude-code',
        workDir: '/repo/slack',
        primaryModel: null,
        channelProviders: ['slack'],
        discord: {
          bot_user_ids: [],
        },
        management: {
          enabled: true,
          baseUrl: 'http://127.0.0.1:9820',
          token: 'secret',
        },
        bridge: {
          enabled: true,
          baseUrl: 'http://127.0.0.1:9810/bridge/ws',
          token: 'bridge-secret',
          path: '/bridge/ws',
        },
      },
    ])).toEqual({
      'cc-connect:agora-codex': '1491781344664227942',
    });
  });
});
