import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadOpenClawDiscordAccountTokens } from './discord-account-tokens.js';

const tempDirs: string[] = [];

function makeConfigFile(payload: unknown) {
  const dir = mkdtempSync(join(tmpdir(), 'openclaw-discord-tokens-test-'));
  tempDirs.push(dir);
  const path = join(dir, 'openclaw.json');
  writeFileSync(path, JSON.stringify(payload, null, 2));
  return path;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('loadOpenClawDiscordAccountTokens', () => {
  it('reads discord account token mappings from openclaw config', () => {
    const configPath = makeConfigFile({
      channels: {
        discord: {
          accounts: {
            main: { token: 'token-main' },
            sonnet: { token: 'token-sonnet', guilds: {} },
            default: {},
          },
        },
      },
    });

    expect(loadOpenClawDiscordAccountTokens({ configPath })).toEqual({
      main: 'token-main',
      sonnet: 'token-sonnet',
    });
  });

  it('returns an empty map when the file is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'openclaw-discord-tokens-missing-'));
    tempDirs.push(dir);

    expect(loadOpenClawDiscordAccountTokens({ configPath: join(dir, 'missing.json') })).toEqual({});
  });
});
