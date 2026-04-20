import { describe, expect, it } from 'vitest';
import { createCcConnectDiscordMentionResolver } from './discord-mention-resolver.js';
import { loadCcConnectProjectTargets, parseCcConnectConfigPaths } from './config-targets.js';

describe('cc-connect config target discovery', () => {
  it('discovers all toml configs in ~/.cc-connect when no env override is set', () => {
    const paths = parseCcConnectConfigPaths({}, () => [
      'config-immediate.toml',
      'config.toml',
      'README.md',
    ]);

    expect(paths).toEqual([
      expect.stringMatching(/\.cc-connect\/config\.toml$/),
      expect.stringMatching(/\.cc-connect\/config-immediate\.toml$/),
    ]);
  });

  it('loads project targets from multiple discovered config files', () => {
    const targets = loadCcConnectProjectTargets({
      env: {},
      readDir: () => ['config.toml', 'config-immediate.toml'],
      exists: () => true,
      readFile: (path) => {
        if (path.endsWith('config-immediate.toml')) {
          return `
[management]
enabled = true
port = 9821
token = "immediate-secret"

[bridge]
enabled = true
port = 9811
token = "immediate-bridge-secret"
path = "/bridge/ws"

[[projects]]
name = "agora-codex-immediate"

[projects.agent]
type = "codex"

[projects.agent.options]
work_dir = "/repo/agora"
model = "gpt-5.4"

[[projects.platforms]]
type = "discord"

[projects.platforms.options]
token = "MTQ5MTc4MTM0NDY2NDIyNzk0Mg.fake.fake"
`;
        }
        return `
[management]
enabled = true
port = 9820
token = "default-secret"

[bridge]
enabled = true
port = 9810
token = "default-bridge-secret"

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
token = "MTQ5MTc0Nzg3Nzc5MjM4NzIwMw.fake.fake"
`;
      },
    });

    expect(targets.map((item) => ({
      projectName: item.projectName,
      runtimeFlavor: item.runtimeFlavor,
      baseUrl: item.management.baseUrl,
      token: item.management.token,
      bridgeBaseUrl: item.bridge.baseUrl,
      bridgeToken: item.bridge.token,
      discordBotUserIds: item.discord?.bot_user_ids ?? [],
    }))).toEqual([
      {
        projectName: 'agora-codex',
        runtimeFlavor: 'codex',
        baseUrl: 'http://127.0.0.1:9820',
        token: 'default-secret',
        bridgeBaseUrl: 'http://127.0.0.1:9810/bridge/ws',
        bridgeToken: 'default-bridge-secret',
        discordBotUserIds: ['1491747877792387203'],
      },
      {
        projectName: 'agora-codex-immediate',
        runtimeFlavor: 'codex',
        baseUrl: 'http://127.0.0.1:9821',
        token: 'immediate-secret',
        bridgeBaseUrl: 'http://127.0.0.1:9811/bridge/ws',
        bridgeToken: 'immediate-bridge-secret',
        discordBotUserIds: ['1491781344664227942'],
      },
    ]);
  });

  it('normalizes Claude Code agent types into runtime flavors', () => {
    const targets = loadCcConnectProjectTargets({
      env: { AGORA_CC_CONNECT_CONFIG_PATHS: '/tmp/cc-connect.toml' },
      exists: () => true,
      readFile: () => `
[[projects]]
name = "agora-claude"

[projects.agent]
type = "claude"

[projects.agent.options]
work_dir = "/repo/agora"
`,
    });

    expect(targets[0]).toMatchObject({
      projectName: 'agora-claude',
      agentType: 'claude',
      runtimeFlavor: 'claude-code',
    });
  });

  it('builds Discord native mention aliases for cc-connect projects', () => {
    const resolveMentions = createCcConnectDiscordMentionResolver([
      {
        configPath: '/tmp/config.toml',
        projectName: 'agora-codex-immediate',
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
          baseUrl: 'http://127.0.0.1:9821',
          token: 'secret',
        },
        bridge: {
          enabled: true,
          baseUrl: 'http://127.0.0.1:9811/bridge/ws',
          token: 'bridge-secret',
          path: '/bridge/ws',
        },
      },
    ]);

    expect(resolveMentions('<@1491781344664227942> hello')).toEqual([
      'cc-connect:agora-codex-immediate',
      'agora-codex-immediate',
    ]);
  });
});
