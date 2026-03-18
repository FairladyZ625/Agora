import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultAgoraDbPath } from '@agora-ts/config';
import type * as AgoraConfigModule from '@agora-ts/config';
import { runInitCommand } from './init-command.js';

const promptState = {
  inputs: [] as string[],
  selectValue: 'none' as 'none' | 'discord',
  confirmValues: [] as boolean[],
};

const configState = {
  existing: {} as Record<string, unknown>,
  saved: null as Record<string, unknown> | null,
};
const tempPaths: string[] = [];

vi.mock('@inquirer/prompts', () => ({
  input: vi.fn(async () => promptState.inputs.shift() ?? ''),
  select: vi.fn(async () => promptState.selectValue),
  confirm: vi.fn(async () => promptState.confirmValues.shift() ?? true),
}));

vi.mock('@agora-ts/config', async () => {
  const actual = await vi.importActual<typeof AgoraConfigModule>('@agora-ts/config');
  return {
    ...actual,
    loadGlobalConfig: vi.fn(() => configState.existing),
    saveGlobalConfig: vi.fn((config: Record<string, unknown>) => {
      configState.saved = config;
    }),
  };
});

describe('runInitCommand', () => {
  beforeEach(() => {
    promptState.inputs = [];
    promptState.selectValue = 'none';
    promptState.confirmValues = [];
    configState.existing = {};
    configState.saved = null;
  });

  afterEach(() => {
    while (tempPaths.length > 0) {
      const dir = tempPaths.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('writes the unified default db path when bootstrapping the first admin', async () => {
    promptState.inputs = ['admin', 'secret-pass'];
    const bootstrapAdmin = vi.fn();
    const bundledSkillsDir = mkdtempSync(join(tmpdir(), 'agora-init-skill-src-'));
    const bundledBrainPackDir = mkdtempSync(join(tmpdir(), 'agora-init-brain-src-'));
    const userAgoraDir = mkdtempSync(join(tmpdir(), 'agora-init-home-'));
    const userAgentsSkillsDir = mkdtempSync(join(tmpdir(), 'agora-init-agents-skill-dst-'));
    const userCodexSkillsDir = mkdtempSync(join(tmpdir(), 'agora-init-codex-skill-dst-'));
    tempPaths.push(bundledSkillsDir, bundledBrainPackDir, userAgoraDir, userAgentsSkillsDir, userCodexSkillsDir);
    mkdirSync(join(bundledSkillsDir, 'agora-bootstrap'), { recursive: true });
    writeFileSync(join(bundledSkillsDir, 'agora-bootstrap', 'SKILL.md'), '# bootstrap\n');
    mkdirSync(join(bundledBrainPackDir, 'roles'), { recursive: true });
    mkdirSync(join(bundledBrainPackDir, 'tasks', 'OC-SEED-SHOULD-NOT-COPY'), { recursive: true });
    writeFileSync(join(bundledBrainPackDir, 'README.md'), '# brain\n');
    writeFileSync(join(bundledBrainPackDir, 'roles', 'controller.md'), '# controller\n');
    writeFileSync(join(bundledBrainPackDir, 'tasks', 'OC-SEED-SHOULD-NOT-COPY', 'task.meta.yaml'), 'task_id: "seed"\n');

    await runInitCommand({
      humanAccountService: {
        bootstrapAdmin,
      } as never,
      bundledSkillsDir,
      bundledBrainPackDir,
      userAgoraDir,
      userSkillDirs: [userAgentsSkillsDir, userCodexSkillsDir],
      runtimeEnvironment: {
        projectRoot: '/repo',
        serverUrl: 'http://127.0.0.1:18420',
      },
      detectOpenClawSetupEnvironment: vi.fn(async () => ({
        openClawCommandAvailable: false,
        openClawConfigPath: '/tmp/openclaw.json',
        openClawConfigExists: false,
        pluginSourcePath: '/repo/extensions/agora-plugin',
        pluginSourceExists: true,
        pluginPackagePath: '/repo/extensions/agora-plugin/package.json',
      })),
      setupOpenClawPlugin: vi.fn(),
    });

    expect(configState.saved).toMatchObject({
      db_path: defaultAgoraDbPath(),
      dashboard_auth: {
        enabled: true,
        method: 'session',
      },
    });
    expect(bootstrapAdmin).toHaveBeenCalledWith({
      username: 'admin',
      password: 'secret-pass',
    });
    expect(existsSync(join(userAgoraDir, 'skills', 'agora-bootstrap', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(userAgoraDir, 'agora-ai-brain', 'roles', 'controller.md'))).toBe(true);
    expect(existsSync(join(userAgoraDir, 'agora-ai-brain', 'tasks'))).toBe(true);
    expect(existsSync(join(userAgoraDir, 'agora-ai-brain', 'tasks', 'OC-SEED-SHOULD-NOT-COPY'))).toBe(false);
    expect(existsSync(join(userAgentsSkillsDir, 'agora-bootstrap', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(userCodexSkillsDir, 'agora-bootstrap', 'SKILL.md'))).toBe(true);
    expect(readFileSync(join(userAgentsSkillsDir, 'agora-bootstrap', 'SKILL.md'), 'utf8')).toContain('bootstrap');
    expect(readFileSync(join(userCodexSkillsDir, 'agora-bootstrap', 'SKILL.md'), 'utf8')).toContain('bootstrap');
  });

  it('preserves the discord init path and can trigger optional openclaw setup', async () => {
    promptState.inputs = ['admin', 'secret-pass', 'discord-bot-token', 'discord-parent', 'discord-user-1'];
    promptState.selectValue = 'discord';
    promptState.confirmValues = [true, true];
    const bootstrapAdmin = vi.fn();
    const bindIdentity = vi.fn();
    const detectOpenClawSetupEnvironment = vi.fn(async () => ({
      openClawCommandAvailable: true,
      openClawConfigPath: '/tmp/openclaw.json',
      openClawConfigExists: true,
      pluginSourcePath: '/repo/extensions/agora-plugin',
      pluginSourceExists: true,
      pluginPackagePath: '/repo/extensions/agora-plugin/package.json',
    }));
    const setupOpenClawPlugin = vi.fn(async () => ({
      openClawConfigPath: '/tmp/openclaw.json',
      backupPath: '/tmp/openclaw.json.bak',
      configCreated: false,
      pluginVersion: '0.1.0',
    }));

    await runInitCommand({
      humanAccountService: {
        bootstrapAdmin,
        bindIdentity,
      } as never,
      runtimeEnvironment: {
        projectRoot: '/repo',
        serverUrl: 'http://127.0.0.1:18420',
      },
      detectOpenClawSetupEnvironment,
      setupOpenClawPlugin,
    });

    expect(configState.saved).toMatchObject({
      im: {
        provider: 'discord',
        discord: {
          bot_token: 'discord-bot-token',
          default_channel_id: 'discord-parent',
          notify_on_task_create: true,
        },
      },
    });
    expect(bootstrapAdmin).toHaveBeenCalledWith({
      username: 'admin',
      password: 'secret-pass',
    });
    expect(bindIdentity).toHaveBeenCalledWith({
      username: 'admin',
      provider: 'discord',
      externalUserId: 'discord-user-1',
    });
    expect(detectOpenClawSetupEnvironment).toHaveBeenCalledWith({
      openClawConfigPath: undefined,
      pluginSourcePath: '/repo/extensions/agora-plugin',
    });
    expect(setupOpenClawPlugin).toHaveBeenCalledWith({
      openClawConfigPath: '/tmp/openclaw.json',
      pluginSourcePath: '/repo/extensions/agora-plugin',
      serverUrl: 'http://127.0.0.1:18420',
      apiToken: null,
    });
  });

  it('prints guidance instead of mutating openclaw when the local plugin source is missing', async () => {
    promptState.inputs = ['admin', 'secret-pass'];
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const detectOpenClawSetupEnvironment = vi.fn(async () => ({
      openClawCommandAvailable: true,
      openClawConfigPath: '/tmp/openclaw.json',
      openClawConfigExists: true,
      pluginSourcePath: '/repo/extensions/agora-plugin',
      pluginSourceExists: false,
      pluginPackagePath: '/repo/extensions/agora-plugin/package.json',
    }));
    const setupOpenClawPlugin = vi.fn();

    let output = '';
    try {
      await runInitCommand({
        runtimeEnvironment: {
          projectRoot: '/repo',
          serverUrl: 'http://127.0.0.1:18420',
        },
        detectOpenClawSetupEnvironment,
        setupOpenClawPlugin,
      });
      output = consoleSpy.mock.calls.flat().join('\n');
    } finally {
      consoleSpy.mockRestore();
    }

    expect(setupOpenClawPlugin).not.toHaveBeenCalled();
    expect(output).toContain('未检测到本地 Agora plugin 源码');
  });
});
