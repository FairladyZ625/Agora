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
  confirmValue: true,
};

const configState = {
  existing: {} as Record<string, unknown>,
  saved: null as Record<string, unknown> | null,
};
const tempPaths: string[] = [];

vi.mock('@inquirer/prompts', () => ({
  input: vi.fn(async () => promptState.inputs.shift() ?? ''),
  select: vi.fn(async () => promptState.selectValue),
  confirm: vi.fn(async () => promptState.confirmValue),
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
    promptState.confirmValue = true;
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
    const userSkillsDir = mkdtempSync(join(tmpdir(), 'agora-init-skill-dst-'));
    tempPaths.push(bundledSkillsDir, bundledBrainPackDir, userAgoraDir, userSkillsDir);
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
      userSkillsDir,
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
    expect(existsSync(join(userSkillsDir, 'agora-bootstrap', 'SKILL.md'))).toBe(true);
    expect(readFileSync(join(userSkillsDir, 'agora-bootstrap', 'SKILL.md'), 'utf8')).toContain('bootstrap');
  });
});
