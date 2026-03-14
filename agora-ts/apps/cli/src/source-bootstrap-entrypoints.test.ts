import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function repoRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
}

describe('source bootstrap entrypoints', () => {
  it('exposes a repo-root agora wrapper that forwards CLI help', () => {
    const root = repoRoot();
    const wrapperPath = resolve(root, 'agora');
    expect(existsSync(wrapperPath)).toBe(true);

    const result = spawnSync('bash', [wrapperPath, '--help'], {
      cwd: root,
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Agora v2 TypeScript CLI');
    expect(result.stdout).toContain('start|run');
  });

  it('exposes a local bootstrap script with a help surface', () => {
    const root = repoRoot();
    const bootstrapPath = resolve(root, 'scripts/bootstrap-local.sh');
    expect(existsSync(bootstrapPath)).toBe(true);

    const result = spawnSync('bash', [bootstrapPath, '--help'], {
      cwd: root,
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('bootstrap-local.sh');
    expect(result.stdout).toContain('./agora init');
  });
});
