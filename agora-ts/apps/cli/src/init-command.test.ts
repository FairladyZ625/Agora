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
  confirm: vi.fn(async () => promptState.confirmValues.shift() ?? false),
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
    promptState.confirmValues = [false];
    const bootstrapAdmin = vi.fn();
    const bundledSkillsDir = mkdtempSync(join(tmpdir(), 'agora-init-skill-src-'));
    const bundledBrainPackDir = mkdtempSync(join(tmpdir(), 'agora-init-brain-src-'));
    const userAgoraDir = mkdtempSync(join(tmpdir(), 'agora-init-home-'));
    const userAgentsSkillsDir = mkdtempSync(join(tmpdir(), 'agora-init-agents-skill-dst-'));
    const userCodexSkillsDir = mkdtempSync(join(tmpdir(), 'agora-init-codex-skill-dst-'));
    tempPaths.push(bundledSkillsDir, bundledBrainPackDir, userAgoraDir, userAgentsSkillsDir, userCodexSkillsDir);
    mkdirSync(join(bundledSkillsDir, 'agora-bootstrap'), { recursive: true });
    mkdirSync(join(bundledSkillsDir, 'create-nomos', 'references'), { recursive: true });
    writeFileSync(join(bundledSkillsDir, 'agora-bootstrap', 'SKILL.md'), '# bootstrap\n');
    writeFileSync(join(bundledSkillsDir, 'create-nomos', 'SKILL.md'), '# create nomos\n');
    writeFileSync(join(bundledSkillsDir, 'create-nomos', 'references', 'pack-schema.md'), '# schema\n');
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
    expect(existsSync(join(userAgoraDir, 'skills', 'create-nomos', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(userAgentsSkillsDir, 'create-nomos', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(userCodexSkillsDir, 'create-nomos', 'SKILL.md'))).toBe(true);
    expect(readFileSync(join(userAgentsSkillsDir, 'agora-bootstrap', 'SKILL.md'), 'utf8')).toContain('bootstrap');
    expect(readFileSync(join(userCodexSkillsDir, 'agora-bootstrap', 'SKILL.md'), 'utf8')).toContain('bootstrap');
    expect(readFileSync(join(userAgoraDir, 'skills', 'create-nomos', 'references', 'pack-schema.md'), 'utf8')).toContain('schema');
  });

  it('skips hybrid retrieval setup when the user declines the optional prompt', async () => {
    promptState.inputs = ['admin', 'secret-pass'];
    promptState.confirmValues = [false];
    const setupHybridRetrieval = vi.fn();

    await runInitCommand({
      runtimeEnvironment: {
        projectRoot: '/repo',
        serverUrl: 'http://127.0.0.1:18420',
      },
      setupHybridRetrieval,
    });

    expect(setupHybridRetrieval).not.toHaveBeenCalled();
  });

  it('can configure hybrid retrieval and persist vector env through the helper', async () => {
    promptState.inputs = [
      'admin',
      'secret-pass',
      'glm-key',
      'https://open.bigmodel.cn/api/paas/v4',
      'embedding-3',
      '2048',
    ];
    promptState.confirmValues = [true];
    const setupHybridRetrieval = vi.fn(async () => ({
      envPath: '/repo/.env',
      qdrant: {
        url: 'http://127.0.0.1:6333',
        containerName: 'agora-qdrant',
        reused: false,
      },
      embedding: {
        probed: true as const,
        model: 'embedding-3',
      },
    }));

    await runInitCommand({
      runtimeEnvironment: {
        projectRoot: '/repo',
        serverUrl: 'http://127.0.0.1:18420',
      },
      setupHybridRetrieval,
    });

    expect(setupHybridRetrieval).toHaveBeenCalledWith({
      envPath: '/repo/.env',
      embedding: {
        apiKey: 'glm-key',
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        model: 'embedding-3',
        dimension: '2048',
      },
    });
  });

  it('keeps base init successful when hybrid retrieval setup fails', async () => {
    promptState.inputs = [
      'admin',
      'secret-pass',
      'glm-key',
      'https://open.bigmodel.cn/api/paas/v4',
      'embedding-3',
      '2048',
    ];
    promptState.confirmValues = [true];
    const setupHybridRetrieval = vi.fn(async () => {
      throw new Error('docker is unavailable');
    });
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    try {
      await runInitCommand({
        runtimeEnvironment: {
          projectRoot: '/repo',
          serverUrl: 'http://127.0.0.1:18420',
        },
        setupHybridRetrieval,
      });
    } finally {
      consoleSpy.mockRestore();
    }

    expect(configState.saved).toMatchObject({
      db_path: defaultAgoraDbPath(),
      im: { provider: 'none' },
    });
    expect(setupHybridRetrieval).toHaveBeenCalledTimes(1);
  });
});
