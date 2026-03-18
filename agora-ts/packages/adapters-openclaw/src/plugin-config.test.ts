import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  inspectAgoraPluginRegistration,
  loadOpenClawConfigDocument,
  upsertAgoraPluginRegistration,
} from './plugin-config.js';

const tempDirs: string[] = [];

function makeTempDir(prefix: string) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function makeConfigFile(payload: unknown) {
  const dir = makeTempDir('openclaw-plugin-config-test-');
  const configPath = join(dir, 'openclaw.json');
  writeFileSync(configPath, JSON.stringify(payload, null, 2));
  return configPath;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('loadOpenClawConfigDocument', () => {
  it('returns an empty document when the config file is missing', () => {
    const dir = makeTempDir('openclaw-plugin-config-missing-');
    const configPath = join(dir, 'missing.json');

    expect(loadOpenClawConfigDocument({ configPath })).toEqual({
      configPath,
      exists: false,
      data: {},
    });
  });

  it('throws a clear error when the config json is invalid', () => {
    const dir = makeTempDir('openclaw-plugin-config-invalid-');
    const configPath = join(dir, 'openclaw.json');
    writeFileSync(configPath, '{invalid-json', 'utf8');

    expect(() => loadOpenClawConfigDocument({ configPath })).toThrow(/invalid openclaw config json/i);
  });
});

describe('inspectAgoraPluginRegistration', () => {
  it('summarizes agora plugin registration status from the plugins tree', () => {
    const summary = inspectAgoraPluginRegistration({
      plugins: {
        allow: ['agora'],
        load: { paths: ['/tmp/agora-plugin'] },
        entries: {
          agora: {
            enabled: true,
            config: {
              serverUrl: 'http://127.0.0.1:18420',
              apiToken: 'secret-token',
            },
          },
        },
        installs: {
          agora: {
            source: 'path',
          },
        },
      },
    });

    expect(summary).toEqual({
      allowed: true,
      loadPathPresent: true,
      entryPresent: true,
      enabled: true,
      installPresent: true,
      serverUrl: 'http://127.0.0.1:18420',
      apiTokenConfigured: true,
    });
  });
});

describe('upsertAgoraPluginRegistration', () => {
  it('creates the minimal plugin registration tree when plugins are absent', () => {
    const updated = upsertAgoraPluginRegistration({}, {
      pluginPath: '/tmp/agora-plugin',
      serverUrl: 'http://127.0.0.1:18420',
      apiToken: 'secret-token',
      version: '0.1.0',
      installedAt: '2026-03-18T00:00:00.000Z',
    });

    expect(updated).toEqual({
      plugins: {
        allow: ['agora'],
        load: {
          paths: ['/tmp/agora-plugin'],
        },
        entries: {
          agora: {
            enabled: true,
            config: {
              serverUrl: 'http://127.0.0.1:18420',
              apiToken: 'secret-token',
            },
          },
        },
        installs: {
          agora: {
            source: 'path',
            sourcePath: '/tmp/agora-plugin',
            installPath: '/tmp/agora-plugin',
            version: '0.1.0',
            installedAt: '2026-03-18T00:00:00.000Z',
          },
        },
      },
    });
  });

  it('merges into an existing plugins tree without dropping neighboring entries', () => {
    const updated = upsertAgoraPluginRegistration({
      plugins: {
        allow: ['discord'],
        load: {
          paths: ['/tmp/discord-plugin'],
        },
        entries: {
          discord: {
            enabled: true,
          },
          agora: {
            enabled: false,
            config: {
              serverUrl: 'http://old-host:18420',
            },
          },
        },
      },
    }, {
      pluginPath: '/tmp/agora-plugin',
      serverUrl: 'http://127.0.0.1:19420',
      apiToken: 'fresh-token',
      version: '0.2.0',
      installedAt: '2026-03-18T01:00:00.000Z',
    });

    expect(updated).toEqual({
      plugins: {
        allow: ['discord', 'agora'],
        load: {
          paths: ['/tmp/discord-plugin', '/tmp/agora-plugin'],
        },
        entries: {
          discord: {
            enabled: true,
          },
          agora: {
            enabled: true,
            config: {
              serverUrl: 'http://127.0.0.1:19420',
              apiToken: 'fresh-token',
            },
          },
        },
        installs: {
          agora: {
            source: 'path',
            sourcePath: '/tmp/agora-plugin',
            installPath: '/tmp/agora-plugin',
            version: '0.2.0',
            installedAt: '2026-03-18T01:00:00.000Z',
          },
        },
      },
    });
  });

  it('can clear apiToken without touching other plugin policy sections', () => {
    const updated = upsertAgoraPluginRegistration({
      channels: {
        discord: {
          allowBots: 'mentions',
          guilds: {
            guild: {
              requireMention: true,
            },
          },
        },
      },
      plugins: {
        entries: {
          agora: {
            enabled: true,
            config: {
              serverUrl: 'http://127.0.0.1:18420',
              apiToken: 'stale-token',
            },
          },
        },
      },
    }, {
      pluginPath: '/tmp/agora-plugin',
      serverUrl: 'http://127.0.0.1:18420',
      apiToken: null,
      includeInstallRecord: false,
    });

    expect(updated).toEqual({
      channels: {
        discord: {
          allowBots: 'mentions',
          guilds: {
            guild: {
              requireMention: true,
            },
          },
        },
      },
      plugins: {
        allow: ['agora'],
        load: {
          paths: ['/tmp/agora-plugin'],
        },
        entries: {
          agora: {
            enabled: true,
            config: {
              serverUrl: 'http://127.0.0.1:18420',
            },
          },
        },
      },
    });
  });

  it('is idempotent when the same registration is applied twice', () => {
    const configPath = makeConfigFile({
      plugins: {
        allow: ['agora'],
        load: {
          paths: ['/tmp/agora-plugin'],
        },
        entries: {
          agora: {
            enabled: true,
            config: {
              serverUrl: 'http://127.0.0.1:18420',
            },
          },
        },
        installs: {
          agora: {
            source: 'path',
            sourcePath: '/tmp/agora-plugin',
            installPath: '/tmp/agora-plugin',
            version: '0.1.0',
            installedAt: '2026-03-18T00:00:00.000Z',
          },
        },
      },
    });
    const first = loadOpenClawConfigDocument({ configPath }).data;
    const second = upsertAgoraPluginRegistration(first, {
      pluginPath: '/tmp/agora-plugin',
      serverUrl: 'http://127.0.0.1:18420',
      version: '0.1.0',
      installedAt: '2026-03-18T00:00:00.000Z',
    });

    expect(second).toEqual(first);
  });
});
