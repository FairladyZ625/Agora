import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { afterEach, describe, expect, it } from 'vitest';
import type { TaskService } from '@agora-ts/core';
import { StubIMProvisioningPort } from '@agora-ts/core';
import type { TmuxRuntimeService } from '@agora-ts/core';
import { createCliComposition } from './composition.js';

const tempDirs: string[] = [];
const originalCwd = process.cwd();
const originalHome = process.env.HOME;
const originalEnv = {
  AGORA_BRAIN_PACK_ROOT: process.env.AGORA_BRAIN_PACK_ROOT,
  AGORA_HOME_DIR: process.env.AGORA_HOME_DIR,
  AGORA_SKILL_TARGET_DIRS: process.env.AGORA_SKILL_TARGET_DIRS,
  AGORA_CRAFTSMAN_CLI_MODE: process.env.AGORA_CRAFTSMAN_CLI_MODE,
  AGORA_OPENCLAW_CONFIG_PATH: process.env.AGORA_OPENCLAW_CONFIG_PATH,
  AGORA_DB_PATH: process.env.AGORA_DB_PATH,
  AGORA_CONFIG_PATH: process.env.AGORA_CONFIG_PATH,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
  OPENAI_EMBEDDING_MODEL: process.env.OPENAI_EMBEDDING_MODEL,
  OPENAI_EMBEDDING_DIMENSION: process.env.OPENAI_EMBEDDING_DIMENSION,
  QDRANT_URL: process.env.QDRANT_URL,
  QDRANT_API_KEY: process.env.QDRANT_API_KEY,
} as const;

function restoreEnv(name: keyof typeof originalEnv) {
  const value = originalEnv[name];
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-cli-composition-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  process.chdir(originalCwd);
  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }
  restoreEnv('AGORA_BRAIN_PACK_ROOT');
  restoreEnv('AGORA_HOME_DIR');
  restoreEnv('AGORA_SKILL_TARGET_DIRS');
  restoreEnv('AGORA_CRAFTSMAN_CLI_MODE');
  restoreEnv('AGORA_OPENCLAW_CONFIG_PATH');
  restoreEnv('AGORA_DB_PATH');
  restoreEnv('AGORA_CONFIG_PATH');
  restoreEnv('OPENAI_API_KEY');
  restoreEnv('OPENAI_BASE_URL');
  restoreEnv('OPENAI_EMBEDDING_MODEL');
  restoreEnv('OPENAI_EMBEDDING_DIMENSION');
  restoreEnv('QDRANT_URL');
  restoreEnv('QDRANT_API_KEY');
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('cli composition', () => {
  it('loads config and builds task/legacy runtime services', () => {
    const dir = makeTempDir();
    const configPath = join(dir, 'agora.json');
    const dbPath = join(dir, 'runtime.db');
    delete process.env.AGORA_DB_PATH;
    process.env.AGORA_BRAIN_PACK_ROOT = join(dir, 'brain-pack');
    writeFileSync(configPath, JSON.stringify({ db_path: dbPath }));

    const composition = createCliComposition({ configPath });

    expect(composition.taskService).toBeDefined();
    expect(composition.legacyRuntimeService).toBeDefined();
    expect(composition.tmuxRuntimeService).toBe(composition.legacyRuntimeService);
    expect(Reflect.get(composition.taskService as object, 'gateQueryPort')?.constructor?.name).toBe('SqliteGateQueryPort');
    expect(Reflect.get(composition.taskService as object, 'gateService')?.constructor?.name).toBe('GateService');
    expect(Reflect.get(composition.taskService as object, 'taskRepository')?.constructor?.name).toBe('TaskRepository');
    expect(Reflect.get(composition.taskService as object, 'skillCatalogPort')?.constructor?.name).toBe('FilesystemSkillCatalogAdapter');
    expect(Reflect.get(composition.dashboardQueryService as object, 'skillCatalogPort')?.constructor?.name).toBe('FilesystemSkillCatalogAdapter');
    composition.db.close();
  });

  it('accepts composition factory overrides for task and legacy runtime services', () => {
    const dir = makeTempDir();
    const configPath = join(dir, 'agora.json');
    const dbPath = join(dir, 'runtime.db');
    process.env.AGORA_BRAIN_PACK_ROOT = join(dir, 'brain-pack');
    writeFileSync(configPath, JSON.stringify({ db_path: dbPath }));

    const overriddenTaskService = {
      listTasks: () => [],
    } as unknown as TaskService;
    const overriddenLegacyRuntimeService = {
      status: () => ({ session: 'override', panes: [] }),
    } as unknown as TmuxRuntimeService;

    const composition = createCliComposition(
      { configPath },
      {
        createTaskService: () => overriddenTaskService,
        createLegacyRuntimeService: () => overriddenLegacyRuntimeService,
      },
    );

    expect(composition.taskService).toBe(overriddenTaskService);
    expect(composition.legacyRuntimeService).toBe(overriddenLegacyRuntimeService);
    expect(composition.tmuxRuntimeService).toBe(overriddenLegacyRuntimeService);
    composition.db.close();
  });

  it('threads IM/runtime composition dependencies into the cli task service', () => {
    const dir = makeTempDir();
    const configPath = join(dir, 'agora.json');
    const dbPath = join(dir, 'runtime.db');
    process.env.AGORA_BRAIN_PACK_ROOT = join(dir, 'brain-pack');
    writeFileSync(configPath, JSON.stringify({
      db_path: dbPath,
      im: {
        provider: 'discord',
        discord: {
          bot_token: 'test-token',
          default_channel_id: 'discord-parent',
        },
      },
    }));

    const captured: Record<string, unknown> = {};
    const stubProvisioning = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent',
    });

    const composition = createCliComposition(
      { configPath },
      {
        createIMProvisioningPort: () => stubProvisioning,
        createTaskService: (_context, deps) => {
          captured.imProvisioningPort = deps.imProvisioningPort;
          captured.messagingPort = deps.messagingPort;
          captured.taskContextBindingService = deps.taskContextBindingService;
          captured.taskParticipationService = deps.taskParticipationService;
          captured.agentRuntimePort = deps.agentRuntimePort;
          return {
            listTasks: () => [],
          } as unknown as TaskService;
        },
      },
    );

    expect(captured.imProvisioningPort).toBe(stubProvisioning);
    expect(captured.messagingPort).toBeDefined();
    expect(captured.taskContextBindingService).toBeDefined();
    expect(captured.taskParticipationService).toBeDefined();
    expect(captured.agentRuntimePort).toBeDefined();
    composition.db.close();
  });

  it('wires archive notifier, receipt ingestor, and IM cleanup deps into dashboard queries', () => {
    const dir = makeTempDir();
    const configPath = join(dir, 'agora.json');
    const dbPath = join(dir, 'runtime.db');
    process.env.AGORA_BRAIN_PACK_ROOT = join(dir, 'brain-pack');
    writeFileSync(configPath, JSON.stringify({
      db_path: dbPath,
      im: {
        provider: 'discord',
        discord: {
          bot_token: 'test-token',
          default_channel_id: 'discord-parent',
        },
      },
    }));

    const stubProvisioning = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent',
      thread_ref: 'discord-thread',
    });

    const composition = createCliComposition(
      { configPath },
      {
        createIMProvisioningPort: () => stubProvisioning,
      },
    );

    expect(Reflect.get(composition.dashboardQueryService as object, 'archiveJobNotifier')?.constructor?.name).toBe('FileArchiveJobNotifier');
    expect(Reflect.get(composition.dashboardQueryService as object, 'archiveJobReceiptIngestor')?.constructor?.name).toBe('FileArchiveJobReceiptIngestor');
    expect(Reflect.get(composition.dashboardQueryService as object, 'taskBrainBindingService')).toBe(composition.taskBrainBindingService);
    expect(Reflect.get(composition.dashboardQueryService as object, 'taskBrainWorkspacePort')).toBeDefined();
    expect(Reflect.get(composition.dashboardQueryService as object, 'taskContextBindingService')).toBe(composition.taskContextBindingService);
    expect(Reflect.get(composition.dashboardQueryService as object, 'imProvisioningPort')).toBe(stubProvisioning);
    composition.db.close();
  });

  it('uses the configured runtime brain pack root instead of the repo skeleton path', () => {
    const dir = makeTempDir();
    const configPath = join(dir, 'agora.json');
    const dbPath = join(dir, 'runtime.db');
    const brainPackRoot = join(dir, 'brain-pack');
    process.env.AGORA_BRAIN_PACK_ROOT = brainPackRoot;
    writeFileSync(configPath, JSON.stringify({ db_path: dbPath }));

    let capturedBrainPackDir: string | null = null;
    const composition = createCliComposition(
      { configPath },
      {
        createTaskBrainWorkspacePort: (context) => {
          capturedBrainPackDir = context.brainPackDir;
          return {
            createWorkspace: () => {
              throw new Error('not used');
            },
            updateWorkspace: () => undefined,
            writeExecutionBrief: () => ({ brief_path: '/tmp/unused-brief.md' }),
            writeTaskCloseRecap: () => undefined,
            writeTaskHarvestDraft: () => undefined,
            destroyWorkspace: () => undefined,
          };
        },
      },
    );

    expect(capturedBrainPackDir).toBe(brainPackRoot);
    expect(readFileSync(join(brainPackRoot, 'roles', 'controller.md'), 'utf8')).toContain('soul:');
    composition.db.close();
  });

  it('self-heals bundled bootstrap skill into user-visible skill roots', () => {
    const dir = makeTempDir();
    const configPath = join(dir, 'agora.json');
    const dbPath = join(dir, 'runtime.db');
    const agoraHomeDir = join(dir, 'agora-home');
    const agentsSkillsDir = join(dir, 'agents-skills');
    const codexSkillsDir = join(dir, 'codex-skills');
    process.env.AGORA_BRAIN_PACK_ROOT = join(dir, 'brain-pack');
    process.env.AGORA_HOME_DIR = agoraHomeDir;
    process.env.AGORA_SKILL_TARGET_DIRS = [agentsSkillsDir, codexSkillsDir].join(',');
    writeFileSync(configPath, JSON.stringify({ db_path: dbPath }));

    const composition = createCliComposition({ configPath });

    expect(readFileSync(join(agoraHomeDir, 'skills', 'agora-bootstrap', 'SKILL.md'), 'utf8')).toContain('agora-bootstrap');
    expect(readFileSync(join(agentsSkillsDir, 'agora-bootstrap', 'SKILL.md'), 'utf8')).toContain('agora-bootstrap');
    expect(readFileSync(join(codexSkillsDir, 'agora-bootstrap', 'SKILL.md'), 'utf8')).toContain('agora-bootstrap');
    composition.db.close();
  });

  it('wires acp craftsman ports into cli composition when cli mode is acp', () => {
    const dir = makeTempDir();
    const configPath = join(dir, 'agora.json');
    const dbPath = join(dir, 'runtime.db');
    process.env.AGORA_BRAIN_PACK_ROOT = join(dir, 'brain-pack');
    process.env.AGORA_CRAFTSMAN_CLI_MODE = 'acp';

    writeFileSync(configPath, JSON.stringify({ db_path: dbPath }));

    let capturedDeps: Record<string, string> | null = null;
    let dispatcherRuntime: object | undefined;
    let inputRuntime: object | undefined;
    const composition = createCliComposition(
      { configPath, dbPath },
      {
        createTaskService: (context, deps) => {
          capturedDeps = {
            input: deps.craftsmanInputPort.constructor.name,
            probe: deps.craftsmanExecutionProbePort.constructor.name,
            tail: deps.craftsmanExecutionTailPort.constructor.name,
            recovery: deps.runtimeRecoveryPort.constructor.name,
          };
          const adapters = Reflect.get(deps.craftsmanDispatcher as object, 'adapters') as Record<string, unknown> | undefined;
          const adapter = adapters?.codex ?? adapters?.claude ?? adapters?.gemini;
          dispatcherRuntime = adapter && typeof adapter === 'object'
            ? Reflect.get(adapter, 'runtime') as object | undefined
            : undefined;
          inputRuntime = Reflect.get(deps.craftsmanInputPort as object, 'runtime') as object | undefined;
          return {
            listTasks: () => [],
          } as unknown as TaskService;
        },
      },
    );

    expect(capturedDeps).toEqual({
      input: 'AcpCraftsmanInputPort',
      probe: 'AcpCraftsmanProbePort',
      tail: 'AcpCraftsmanTailPort',
      recovery: 'AcpRuntimeRecoveryPort',
    });
    expect(dispatcherRuntime).toBeDefined();
    expect(inputRuntime).toBe(dispatcherRuntime);
    composition.db.close();
  });

  it('creates a discord provisioning adapter with participant tokens from openclaw config', () => {
    const dir = makeTempDir();
    const configPath = join(dir, 'agora.json');
    const dbPath = join(dir, 'runtime.db');
    const openClawConfigPath = join(dir, 'openclaw.json');
    process.env.AGORA_BRAIN_PACK_ROOT = join(dir, 'brain-pack');
    process.env.AGORA_OPENCLAW_CONFIG_PATH = openClawConfigPath;
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
    writeFileSync(configPath, JSON.stringify({
      db_path: dbPath,
      im: {
        provider: 'discord',
        discord: {
          bot_token: 'discord-bot-token',
          default_channel_id: 'discord-parent',
        },
      },
    }));

    const composition = createCliComposition({ configPath });
    const provisioningPort = Reflect.get(composition.taskService as object, 'imProvisioningPort') as object | undefined;

    expect(provisioningPort?.constructor.name).toBe('DiscordIMProvisioningAdapter');
    expect(Reflect.get(provisioningPort as object, 'participantTokens')).toEqual({
      main: 'discord-bot-token',
      reviewer: 'reviewer-token',
    });
    expect(Reflect.get(provisioningPort as object, 'primaryAccountId')).toBe('main');
    composition.db.close();
  });

  it('uses tmux craftsman transport ports and git worktree isolation when configured', () => {
    const dir = makeTempDir();
    const configPath = join(dir, 'agora.json');
    const dbPath = join(dir, 'runtime.db');
    process.env.AGORA_BRAIN_PACK_ROOT = join(dir, 'brain-pack');
    process.env.AGORA_CRAFTSMAN_CLI_MODE = 'tmux';
    writeFileSync(configPath, JSON.stringify({
      db_path: dbPath,
      craftsmen: {
        isolate_git_worktrees: true,
        isolated_root: join(dir, 'isolated-worktrees'),
      },
    }));

    const composition = createCliComposition({ configPath });
    const taskService = composition.taskService as object;
    const dispatcher = Reflect.get(taskService, 'craftsmanDispatcher') as object | undefined;

    expect(Reflect.get(taskService, 'craftsmanInputPort')?.constructor.name).toBe('TmuxCraftsmanInputPort');
    expect(Reflect.get(taskService, 'craftsmanExecutionProbePort')?.constructor.name).toBe('TmuxCraftsmanProbePort');
    expect(Reflect.get(taskService, 'craftsmanExecutionTailPort')?.constructor.name).toBe('TmuxCraftsmanTailPort');
    expect(Reflect.get(taskService, 'runtimeRecoveryPort')?.constructor.name).toBe('TmuxRuntimeRecoveryPort');
    expect(Reflect.get(dispatcher as object, 'workdirIsolator')?.constructor.name).toBe('GitWorktreeWorkdirIsolator');
    composition.db.close();
  });

  it('wires project brain hybrid retrieval services when vector env is configured', () => {
    const dir = makeTempDir();
    const configPath = join(dir, 'agora.json');
    const dbPath = join(dir, 'runtime.db');
    process.env.AGORA_BRAIN_PACK_ROOT = join(dir, 'brain-pack');
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';
    process.env.OPENAI_EMBEDDING_DIMENSION = '8';
    process.env.QDRANT_URL = 'http://127.0.0.1:6333';
    writeFileSync(configPath, JSON.stringify({ db_path: dbPath }));

    const composition = createCliComposition({ configPath });

    expect(composition.projectBrainIndexService?.constructor.name).toBe('ProjectBrainIndexService');
    expect(composition.projectBrainRetrievalService?.constructor.name).toBe('ProjectBrainRetrievalService');
    expect(Reflect.get(composition.projectBrainAutomationService as object, 'options')).toEqual(
      expect.objectContaining({
        retrievalService: composition.projectBrainRetrievalService,
      }),
    );
    composition.db.close();
  });

  it('normalizes AGORA_DB_PATH loaded from root .env before opening sqlite', () => {
    const dir = makeTempDir();
    const configPath = join(dir, 'agora.json');
    const expectedDbPath = join(dir, 'expected-home', '.agora', 'agora.db');
    const repoLocalDbPath = join(dir, '$HOME', '.agora', 'agora.db');
    process.chdir(dir);
    process.env.HOME = join(dir, 'expected-home');
    process.env.AGORA_BRAIN_PACK_ROOT = join(dir, 'brain-pack');
    process.env.AGORA_DB_PATH = '$HOME/.agora/agora.db';
    writeFileSync(configPath, JSON.stringify({ db_path: join(dir, 'config.db') }));

    const composition = createCliComposition({ configPath });

    composition.db.close();
    expect(composition.config.db_path).toBe(expectedDbPath);
    expect(existsSync(expectedDbPath)).toBe(true);
    expect(existsSync(repoLocalDbPath)).toBe(false);
  });
});
