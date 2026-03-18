import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  detectOpenClawPluginSetupEnvironment,
  setupOpenClawAgoraPlugin,
} from './openclaw-plugin-setup.js';

const tempDirs: string[] = [];

function makeTempDir(prefix: string) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('detectOpenClawPluginSetupEnvironment', () => {
  it('reports when openclaw and the local plugin source are both present', async () => {
    const dir = makeTempDir('openclaw-plugin-setup-env-');
    const configPath = join(dir, 'openclaw.json');
    const pluginSourcePath = join(dir, 'agora-plugin');
    mkdirSync(pluginSourcePath, { recursive: true });
    writeFileSync(configPath, '{}\n');
    writeFileSync(join(pluginSourcePath, 'package.json'), JSON.stringify({ version: '0.1.0' }));

    const result = await detectOpenClawPluginSetupEnvironment({
      openClawConfigPath: configPath,
      pluginSourcePath,
    }, {
      commandExists: vi.fn(async () => true),
    });

    expect(result).toEqual({
      openClawCommandAvailable: true,
      openClawConfigPath: configPath,
      openClawConfigExists: true,
      pluginSourcePath,
      pluginSourceExists: true,
      pluginPackagePath: join(pluginSourcePath, 'package.json'),
    });
  });

  it('detects missing command and missing plugin source separately', async () => {
    const dir = makeTempDir('openclaw-plugin-setup-missing-');
    const configPath = join(dir, 'openclaw.json');
    const commandExists = vi.fn(async () => false);

    const result = await detectOpenClawPluginSetupEnvironment({
      openClawConfigPath: configPath,
      pluginSourcePath: join(dir, 'missing-plugin'),
    }, { commandExists });

    expect(result).toEqual({
      openClawCommandAvailable: false,
      openClawConfigPath: configPath,
      openClawConfigExists: false,
      pluginSourcePath: join(dir, 'missing-plugin'),
      pluginSourceExists: false,
      pluginPackagePath: join(dir, 'missing-plugin', 'package.json'),
    });
  });
});

describe('setupOpenClawAgoraPlugin', () => {
  it('backs up config, writes the agora plugin registration, and runs local build steps', async () => {
    const dir = makeTempDir('openclaw-plugin-setup-run-');
    const configPath = join(dir, 'openclaw.json');
    const pluginSourcePath = join(dir, 'agora-plugin');
    const pluginPackagePath = join(pluginSourcePath, 'package.json');
    const runCommand = vi.fn(async () => undefined);
    writeFileSync(configPath, JSON.stringify({
      plugins: {
        allow: ['discord'],
      },
    }, null, 2));
    rmSync(pluginSourcePath, { recursive: true, force: true });
    mkdirSync(pluginSourcePath, { recursive: true });
    writeFileSync(pluginPackagePath, JSON.stringify({ version: '0.1.0' }, null, 2));

    const result = await setupOpenClawAgoraPlugin({
      openClawConfigPath: configPath,
      pluginSourcePath,
      serverUrl: 'http://127.0.0.1:18420',
      apiToken: 'secret-token',
    }, {
      commandExists: vi.fn(async () => true),
      now: () => new Date('2026-03-18T02:00:00.000Z'),
      runCommand,
    });

    expect(runCommand).toHaveBeenNthCalledWith(1, {
      command: 'npm',
      args: ['install'],
      cwd: pluginSourcePath,
    });
    expect(runCommand).toHaveBeenNthCalledWith(2, {
      command: 'npm',
      args: ['run', 'build'],
      cwd: pluginSourcePath,
    });
    expect(result.pluginVersion).toBe('0.1.0');
    expect(result.backupPath).toBe(`${configPath}.bak`);
    expect(existsSync(`${configPath}.bak`)).toBe(true);

    const written = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
    expect(written).toMatchObject({
      plugins: {
        allow: ['discord', 'agora'],
        load: {
          paths: [pluginSourcePath],
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
            sourcePath: pluginSourcePath,
            installPath: pluginSourcePath,
            version: '0.1.0',
            installedAt: '2026-03-18T02:00:00.000Z',
          },
        },
      },
    });
  });

  it('creates a new config file when openclaw config does not exist', async () => {
    const dir = makeTempDir('openclaw-plugin-setup-create-');
    const configPath = join(dir, 'nested', 'openclaw.json');
    const pluginSourcePath = join(dir, 'agora-plugin');
    mkdirSync(pluginSourcePath, { recursive: true });
    writeFileSync(join(pluginSourcePath, 'package.json'), JSON.stringify({ version: '0.1.0' }, null, 2));

    const result = await setupOpenClawAgoraPlugin({
      openClawConfigPath: configPath,
      pluginSourcePath,
      serverUrl: 'http://127.0.0.1:18420',
      apiToken: null,
    }, {
      commandExists: vi.fn(async () => true),
      now: () => new Date('2026-03-18T03:00:00.000Z'),
      runCommand: vi.fn(async () => undefined),
    });

    expect(result.configCreated).toBe(true);
    expect(result.backupPath).toBeNull();
    expect(existsSync(configPath)).toBe(true);
  });

  it('throws a clear error when the plugin source is missing', async () => {
    const dir = makeTempDir('openclaw-plugin-setup-no-plugin-');
    const pluginSourcePath = join(dir, 'missing-plugin');

    await expect(setupOpenClawAgoraPlugin({
      openClawConfigPath: join(dir, 'openclaw.json'),
      pluginSourcePath,
      serverUrl: 'http://127.0.0.1:18420',
    }, {
      commandExists: vi.fn(async () => true),
      runCommand: vi.fn(async () => undefined),
    })).rejects.toThrow(/agora plugin source was not found/i);
  });
});
