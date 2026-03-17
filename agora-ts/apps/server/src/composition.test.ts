import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgoraDatabase, runMigrations } from '@agora-ts/db';
import type { AgoraConfig } from '@agora-ts/config';
import { buildServerComposition, type ServerCompositionContext } from './composition.js';

const tempDirs: string[] = [];

function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-server-composition-'));
  tempDirs.push(dir);
  return dir;
}

function makeConfig(dbPath: string, overrides: Record<string, unknown> = {}) {
  const config = {
    db_path: dbPath,
    permissions: {
      archonUsers: ['archon'],
      allowAgents: {
        '*': { canCall: [], canAdvance: false },
      },
    },
    api_auth: {
      enabled: false,
      token: '',
    },
    im: {
      provider: 'none',
    },
    craftsmen: {
      max_concurrent_running: 4,
      isolate_git_worktrees: false,
      isolated_root: join(dirname(dbPath), 'isolated-worktrees'),
      max_concurrent_per_agent: 2,
      host_memory_warning_utilization_limit: 0.8,
      host_memory_utilization_limit: 0.9,
      host_swap_warning_utilization_limit: 0.5,
      host_swap_utilization_limit: 0.8,
      host_load_per_cpu_warning_limit: 1.25,
      host_load_per_cpu_limit: 2,
    },
    scheduler: {
      task_probe_controller_after_sec: 300,
      task_probe_roster_after_sec: 900,
      task_probe_inbox_after_sec: 1800,
    },
    ...overrides,
  };
  return config as unknown as AgoraConfig;
}

function makeContext(dbPath: string, configOverrides: Record<string, unknown> = {}): ServerCompositionContext {
  const runtimeRoot = makeTempDir();
  const brainPackDir = join(runtimeRoot, 'brain-pack');
  mkdirSync(brainPackDir, { recursive: true });
  return {
    config: makeConfig(dbPath, configOverrides),
    runtimeEnv: {
      apiBaseUrl: 'http://127.0.0.1:3000',
      projectRoot: runtimeRoot,
    },
    db: createAgoraDatabase({ dbPath }),
    templatesDir: new URL('../../../templates', import.meta.url).pathname,
    rolePackDir: new URL('../../../role-packs/agora-default', import.meta.url).pathname,
    brainPackDir,
  };
}

afterEach(() => {
  delete process.env.AGORA_CRAFTSMAN_SERVER_MODE;
  delete process.env.AGORA_OPENCLAW_CONFIG_PATH;
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('server composition', () => {
  it('creates a discord provisioning adapter with participant tokens from openclaw config', () => {
    const dir = makeTempDir();
    const dbPath = join(dir, 'runtime.db');
    const openClawConfigPath = join(dir, 'openclaw.json');
    writeFileSync(openClawConfigPath, JSON.stringify({
      channels: {
        discord: {
          accounts: {
            main: { token: 'discord-bot-token' },
            reviewer: { token: 'reviewer-token' },
          },
        },
      },
    }));
    process.env.AGORA_OPENCLAW_CONFIG_PATH = openClawConfigPath;
    const context = makeContext(dbPath, {
      im: {
        provider: 'discord',
        discord: {
          bot_token: 'discord-bot-token',
          default_channel_id: 'discord-parent',
        },
      },
    });
    runMigrations(context.db);

    const composition = buildServerComposition(context);
    const provisioningPort = Reflect.get(composition.taskService as object, 'imProvisioningPort') as object | undefined;

    expect(provisioningPort?.constructor.name).toBe('DiscordIMProvisioningAdapter');
    expect(Reflect.get(provisioningPort as object, 'participantTokens')).toEqual({
      main: 'discord-bot-token',
      reviewer: 'reviewer-token',
    });
    expect(Reflect.get(provisioningPort as object, 'primaryAccountId')).toBe('main');
    context.db.close();
  });

  it('uses tmux craftsman transport ports and the default session probe for tmux sessions', () => {
    const dir = makeTempDir();
    const dbPath = join(dir, 'runtime.db');
    const context = makeContext(dbPath);
    runMigrations(context.db);
    process.env.AGORA_CRAFTSMAN_SERVER_MODE = 'tmux';

    const composition = buildServerComposition(context, {
      createTmuxRuntimeService: () => ({
        status: () => ({
          session: 'tmux-runtime',
          panes: [{ transportSessionId: 'tmux:live' }],
        }),
      }) as never,
    });
    const taskService = composition.taskService as object;
    const isCraftsmanSessionAlive = Reflect.get(taskService, 'isCraftsmanSessionAlive') as ((sessionId: string) => boolean) | undefined;

    expect(Reflect.get(taskService, 'craftsmanInputPort')?.constructor.name).toBe('TmuxCraftsmanInputPort');
    expect(Reflect.get(taskService, 'craftsmanExecutionProbePort')?.constructor.name).toBe('TmuxCraftsmanProbePort');
    expect(Reflect.get(taskService, 'craftsmanExecutionTailPort')?.constructor.name).toBe('TmuxCraftsmanTailPort');
    expect(Reflect.get(taskService, 'runtimeRecoveryPort')?.constructor.name).toBe('TmuxRuntimeRecoveryPort');
    expect(isCraftsmanSessionAlive?.('tmux:live')).toBe(true);
    expect(isCraftsmanSessionAlive?.('tmux:missing')).toBe(false);
    expect(isCraftsmanSessionAlive?.('acp:session')).toBe(true);
    context.db.close();
  });

  it('treats tmux sessions as alive when runtime status probing throws', () => {
    const dir = makeTempDir();
    const dbPath = join(dir, 'runtime.db');
    const context = makeContext(dbPath);
    runMigrations(context.db);
    process.env.AGORA_CRAFTSMAN_SERVER_MODE = 'tmux';

    const composition = buildServerComposition(context, {
      createTmuxRuntimeService: () => ({
        status: () => {
          throw new Error('tmux unavailable');
        },
      }) as never,
    });
    const taskService = composition.taskService as object;
    const isCraftsmanSessionAlive = Reflect.get(taskService, 'isCraftsmanSessionAlive') as ((sessionId: string) => boolean) | undefined;

    expect(isCraftsmanSessionAlive?.('tmux:broken')).toBe(true);
    context.db.close();
  });
});
