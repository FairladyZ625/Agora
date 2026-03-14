import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { syncBundledBrainPackContents } from './runtime-assets.js';

const tempPaths: string[] = [];

function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-runtime-assets-'));
  tempPaths.push(dir);
  return dir;
}

afterEach(() => {
  while (tempPaths.length > 0) {
    const dir = tempPaths.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('runtime assets', () => {
  it('syncs bundled brain pack contents idempotently while skipping tasks', () => {
    const sourceRoot = makeTempDir();
    const targetRoot = makeTempDir();
    mkdirSync(join(sourceRoot, 'projects'), { recursive: true });
    mkdirSync(join(sourceRoot, 'tasks', 'OC-SHOULD-SKIP'), { recursive: true });
    writeFileSync(join(sourceRoot, 'projects', 'README.md'), 'projects readme');
    writeFileSync(join(sourceRoot, 'tasks', 'OC-SHOULD-SKIP', 'task.meta.yaml'), 'skip me');

    syncBundledBrainPackContents(sourceRoot, targetRoot);
    syncBundledBrainPackContents(sourceRoot, targetRoot);

    expect(readFileSync(join(targetRoot, 'projects', 'README.md'), 'utf8')).toBe('projects readme');
    expect(() => readFileSync(join(targetRoot, 'tasks', 'OC-SHOULD-SKIP', 'task.meta.yaml'), 'utf8')).toThrow();
  });

  it('overwrites existing root files without throwing EEXIST', () => {
    const sourceRoot = makeTempDir();
    const targetRoot = makeTempDir();
    mkdirSync(join(sourceRoot, 'projects'), { recursive: true });
    writeFileSync(join(sourceRoot, 'README.md'), 'bundled readme');
    writeFileSync(join(sourceRoot, 'projects', 'README.md'), 'projects readme');

    writeFileSync(join(targetRoot, 'README.md'), 'old readme');
    mkdirSync(join(targetRoot, 'projects'), { recursive: true });
    writeFileSync(join(targetRoot, 'projects', 'README.md'), 'old projects readme');

    expect(() => syncBundledBrainPackContents(sourceRoot, targetRoot)).not.toThrow();
    expect(() => syncBundledBrainPackContents(sourceRoot, targetRoot)).not.toThrow();

    expect(readFileSync(join(targetRoot, 'README.md'), 'utf8')).toBe('bundled readme');
    expect(readFileSync(join(targetRoot, 'projects', 'README.md'), 'utf8')).toBe('projects readme');
  });
});
