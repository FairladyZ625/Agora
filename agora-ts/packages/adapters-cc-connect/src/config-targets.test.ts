import { describe, expect, it } from 'vitest';
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

[[projects]]
name = "agora-codex-immediate"

[projects.agent]
type = "codex"

[projects.agent.options]
work_dir = "/repo/agora"
model = "gpt-5.4"

[[projects.platforms]]
type = "discord"
`;
        }
        return `
[management]
enabled = true
port = 9820
token = "default-secret"

[[projects]]
name = "agora-codex"

[projects.agent]
type = "codex"

[projects.agent.options]
work_dir = "/repo/agora"
model = "gpt-5.4"

[[projects.platforms]]
type = "discord"
`;
      },
    });

    expect(targets.map((item) => ({
      projectName: item.projectName,
      baseUrl: item.management.baseUrl,
      token: item.management.token,
    }))).toEqual([
      {
        projectName: 'agora-codex',
        baseUrl: 'http://127.0.0.1:9820',
        token: 'default-secret',
      },
      {
        projectName: 'agora-codex-immediate',
        baseUrl: 'http://127.0.0.1:9821',
        token: 'immediate-secret',
      },
    ]);
  });
});
