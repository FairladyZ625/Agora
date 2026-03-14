import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { TaskService } from '@agora-ts/core';
import { StubIMProvisioningPort } from '@agora-ts/core';
import type { TmuxRuntimeService } from '@agora-ts/core';
import { createCliComposition } from './composition.js';

const tempPaths: string[] = [];

function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-cli-composition-'));
  tempPaths.push(dir);
  return dir;
}

afterEach(() => {
  delete process.env.AGORA_BRAIN_PACK_ROOT;
  delete process.env.AGORA_HOME_DIR;
  delete process.env.AGORA_SKILL_TARGET_DIRS;
  while (tempPaths.length > 0) {
    const dir = tempPaths.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('cli composition', () => {
  it('loads config and builds task/tmux runtime services', () => {
    const dir = makeTempDir();
    const configPath = join(dir, 'agora.json');
    const dbPath = join(dir, 'runtime.db');
    process.env.AGORA_BRAIN_PACK_ROOT = join(dir, 'brain-pack');
    writeFileSync(configPath, JSON.stringify({ db_path: dbPath }));

    const composition = createCliComposition({ configPath });

    expect(composition.config.db_path).toBe(dbPath);
    expect(composition.taskService).toBeDefined();
    expect(composition.tmuxRuntimeService).toBeDefined();
    composition.db.close();
  });

  it('accepts composition factory overrides for task and tmux services', () => {
    const dir = makeTempDir();
    const configPath = join(dir, 'agora.json');
    const dbPath = join(dir, 'runtime.db');
    process.env.AGORA_BRAIN_PACK_ROOT = join(dir, 'brain-pack');
    writeFileSync(configPath, JSON.stringify({ db_path: dbPath }));

    const overriddenTaskService = {
      listTasks: () => [],
    } as unknown as TaskService;
    const overriddenTmuxRuntimeService = {
      status: () => ({ session: 'override', panes: [] }),
    } as unknown as TmuxRuntimeService;

    const composition = createCliComposition(
      { configPath },
      {
        createTaskService: () => overriddenTaskService,
        createTmuxRuntimeService: () => overriddenTmuxRuntimeService,
      },
    );

    expect(composition.taskService).toBe(overriddenTaskService);
    expect(composition.tmuxRuntimeService).toBe(overriddenTmuxRuntimeService);
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
});
