import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ensureBundledAgoraAssetsInstalled, syncBundledBrainPackContents } from './runtime-assets.js';

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

  it('keeps the installed brain pack as the runtime source of truth by default', () => {
    const projectRoot = makeTempDir();
    const bundledBrainPackDir = join(projectRoot, 'agora-ai-brain');
    const userAgoraDir = makeTempDir();

    mkdirSync(bundledBrainPackDir, { recursive: true });
    writeFileSync(join(bundledBrainPackDir, 'AGORA.md'), 'bundled agora');
    writeFileSync(join(bundledBrainPackDir, 'README.md'), 'bundled readme');

    const installedBrainPackDir = join(userAgoraDir, 'agora-ai-brain');
    mkdirSync(installedBrainPackDir, { recursive: true });
    writeFileSync(join(installedBrainPackDir, 'AGORA.md'), 'runtime agora');
    writeFileSync(join(installedBrainPackDir, 'README.md'), 'runtime readme');

    ensureBundledAgoraAssetsInstalled({
      projectRoot,
      bundledBrainPackDir,
      userAgoraDir,
    });

    expect(readFileSync(join(installedBrainPackDir, 'AGORA.md'), 'utf8')).toBe('runtime agora');
    expect(readFileSync(join(installedBrainPackDir, 'README.md'), 'utf8')).toBe('runtime readme');
  });

  it('installs every bundled skill into Agora and user skill directories', () => {
    const projectRoot = makeTempDir();
    const bundledSkillsDir = join(projectRoot, '.skills');
    const userAgoraDir = makeTempDir();
    const userAgentsSkillsDir = makeTempDir();
    const userCodexSkillsDir = makeTempDir();

    mkdirSync(join(bundledSkillsDir, 'agora-bootstrap'), { recursive: true });
    mkdirSync(join(bundledSkillsDir, 'create-nomos', 'references'), { recursive: true });
    writeFileSync(join(bundledSkillsDir, 'agora-bootstrap', 'SKILL.md'), '# bootstrap\n');
    writeFileSync(join(bundledSkillsDir, 'create-nomos', 'SKILL.md'), '# create nomos\n');
    writeFileSync(join(bundledSkillsDir, 'create-nomos', 'references', 'pack-schema.md'), '# schema\n');
    mkdirSync(join(bundledSkillsDir, 'create-nomos', 'assets', 'pack-template'), { recursive: true });
    writeFileSync(join(bundledSkillsDir, 'create-nomos', 'assets', 'pack-template', 'profile.toml'), 'id = "example/test"\n');

    const result = ensureBundledAgoraAssetsInstalled({
      projectRoot,
      bundledSkillsDir,
      userAgoraDir,
      userSkillDirs: [userAgentsSkillsDir, userCodexSkillsDir],
    });

    expect(result.bundledSkillNames.sort()).toEqual(['agora-bootstrap', 'create-nomos']);
    expect(readFileSync(join(userAgoraDir, 'skills', 'agora-bootstrap', 'SKILL.md'), 'utf8')).toContain('bootstrap');
    expect(readFileSync(join(userAgoraDir, 'skills', 'create-nomos', 'SKILL.md'), 'utf8')).toContain('create nomos');
    expect(readFileSync(join(userAgentsSkillsDir, 'create-nomos', 'SKILL.md'), 'utf8')).toContain('create nomos');
    expect(readFileSync(join(userCodexSkillsDir, 'create-nomos', 'SKILL.md'), 'utf8')).toContain('create nomos');
    expect(readFileSync(join(userAgoraDir, 'skills', 'create-nomos', 'references', 'pack-schema.md'), 'utf8')).toContain('schema');
    expect(readFileSync(join(userAgoraDir, 'skills', 'create-nomos', 'assets', 'pack-template', 'profile.toml'), 'utf8')).toContain('example/test');
  });

  it('replaces broken skill symlinks when syncing bundled skills into user targets', () => {
    const projectRoot = makeTempDir();
    const bundledSkillsDir = join(projectRoot, '.skills');
    const userAgoraDir = makeTempDir();
    const userAgentsSkillsDir = makeTempDir();

    mkdirSync(join(bundledSkillsDir, 'agora-bootstrap'), { recursive: true });
    writeFileSync(join(bundledSkillsDir, 'agora-bootstrap', 'SKILL.md'), '# bootstrap\n');

    symlinkSync(join(projectRoot, 'missing-skill-target'), join(userAgentsSkillsDir, 'agora-bootstrap'));

    expect(() => ensureBundledAgoraAssetsInstalled({
      projectRoot,
      bundledSkillsDir,
      userAgoraDir,
      userSkillDirs: [userAgentsSkillsDir],
    })).not.toThrow();

    expect(readFileSync(join(userAgentsSkillsDir, 'agora-bootstrap', 'SKILL.md'), 'utf8')).toContain('bootstrap');
  });
});
