import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultAgoraDbPath } from '@agora-ts/config';
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

vi.mock('@inquirer/prompts', () => ({
  input: vi.fn(async () => promptState.inputs.shift() ?? ''),
  select: vi.fn(async () => promptState.selectValue),
  confirm: vi.fn(async () => promptState.confirmValue),
}));

vi.mock('@agora-ts/config', async () => {
  const actual = await vi.importActual<typeof import('@agora-ts/config')>('@agora-ts/config');
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

  it('writes the unified default db path when bootstrapping the first admin', async () => {
    promptState.inputs = ['admin', 'secret-pass'];
    const bootstrapAdmin = vi.fn();

    await runInitCommand({
      humanAccountService: {
        bootstrapAdmin,
      } as never,
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
  });
});
