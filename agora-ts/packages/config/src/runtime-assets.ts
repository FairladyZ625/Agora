import { copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

export interface EnsureBundledAgoraAssetsOptions {
  projectRoot: string;
  bundledSkillsDir?: string;
  bundledBrainPackDir?: string;
  userAgoraDir?: string;
  userSkillDirs?: string[];
  brainPackSyncMode?: 'bootstrap_if_missing' | 'force_sync';
}

export interface EnsuredAgoraAssetsResult {
  userAgoraDir: string;
  agoraSkillDir: string;
  bundledSkillNames: string[];
  userSkillDirs: string[];
  installedSkillTargets: string[];
  userBrainPackDir: string;
}

export function resolveUserAgoraDir(options: Pick<EnsureBundledAgoraAssetsOptions, 'userAgoraDir'> = {}) {
  return options.userAgoraDir ?? process.env.AGORA_HOME_DIR ?? resolve(homedir(), '.agora');
}

export function resolveUserAgoraSkillDir(options: Pick<EnsureBundledAgoraAssetsOptions, 'userAgoraDir'> = {}) {
  return resolve(resolveUserAgoraDir(options), 'skills', 'agora-bootstrap');
}

export function resolveUserSkillDirs(options: Pick<EnsureBundledAgoraAssetsOptions, 'userSkillDirs'> = {}) {
  const envOverride = process.env.AGORA_SKILL_TARGET_DIRS
    ?.split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  const configured = options.userSkillDirs ?? envOverride ?? [
    resolve(homedir(), '.agents/skills'),
    resolve(homedir(), '.codex/skills'),
  ];
  return Array.from(new Set(configured.map((value) => resolve(value))));
}

export function ensureBundledAgoraAssetsInstalled(
  options: EnsureBundledAgoraAssetsOptions,
): EnsuredAgoraAssetsResult {
  const bundledSkillsDir = options.bundledSkillsDir ?? resolve(options.projectRoot, '.skills');
  const userAgoraDir = resolveUserAgoraDir(options);
  const userSkillDirs = resolveUserSkillDirs(options);
  const agoraSkillDir = resolveUserAgoraSkillDir(options);
  const installedSkillTargets: string[] = [];
  const bundledSkillNames: string[] = [];

  mkdirSync(userAgoraDir, { recursive: true });

  const sourceSkillDirs = existsSync(bundledSkillsDir)
    ? readdirSync(bundledSkillsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(resolve(bundledSkillsDir, entry.name, 'SKILL.md')))
      .map((entry) => ({
        name: entry.name,
        sourceDir: resolve(bundledSkillsDir, entry.name),
      }))
    : [];

  if (sourceSkillDirs.length > 0) {
    mkdirSync(resolve(userAgoraDir, 'skills'), { recursive: true });

    for (const { name, sourceDir } of sourceSkillDirs) {
      const agoraTargetDir = resolve(userAgoraDir, 'skills', name);
      cpSync(sourceDir, agoraTargetDir, {
        recursive: true,
        force: true,
      });
      installedSkillTargets.push(agoraTargetDir);
      bundledSkillNames.push(name);

      for (const userSkillsDir of userSkillDirs) {
        mkdirSync(userSkillsDir, { recursive: true });
        const targetDir = resolve(userSkillsDir, name);
        cpSync(sourceDir, targetDir, {
          recursive: true,
          force: true,
        });
        installedSkillTargets.push(targetDir);
      }
    }

    if (!existsSync(agoraSkillDir) && bundledSkillNames.includes('agora-bootstrap')) {
      cpSync(resolve(bundledSkillsDir, 'agora-bootstrap'), agoraSkillDir, {
        recursive: true,
        force: true,
      });
    } else if (existsSync(resolve(userAgoraDir, 'skills', 'agora-bootstrap'))) {
      // Keep the historical field pointing at the bootstrap skill for existing callers.
    }
  }

  if (!existsSync(agoraSkillDir) && existsSync(resolve(userAgoraDir, 'skills', 'agora-bootstrap'))) {
    // no-op, conventional path exists
  } else if (!existsSync(agoraSkillDir)) {
    mkdirSync(agoraSkillDir, { recursive: true });
  }

  const userBrainPackDir = resolve(userAgoraDir, 'agora-ai-brain');
  const bundledBrainPackDir = options.bundledBrainPackDir;
  if (bundledBrainPackDir && existsSync(bundledBrainPackDir)) {
    const brainPackMode = options.brainPackSyncMode ?? 'bootstrap_if_missing';
    if (brainPackMode === 'force_sync' || !hasInstalledBrainPack(userBrainPackDir)) {
      syncBundledBrainPackContents(bundledBrainPackDir, userBrainPackDir);
    }
    mkdirSync(resolve(userBrainPackDir, 'tasks'), { recursive: true });
  }

  return {
    userAgoraDir,
    agoraSkillDir,
    bundledSkillNames,
    userSkillDirs,
    installedSkillTargets,
    userBrainPackDir,
  };
}

export function syncBundledBrainPackContents(sourceRoot: string, targetRoot: string) {
  mkdirSync(targetRoot, { recursive: true });
  for (const entry of readdirSync(sourceRoot, { withFileTypes: true })) {
    if (entry.name === 'tasks') {
      continue;
    }
    syncRuntimeAssetEntry(resolve(sourceRoot, entry.name), resolve(targetRoot, entry.name));
  }
}

function syncRuntimeAssetEntry(sourcePath: string, targetPath: string) {
  const stat = lstatSync(sourcePath);
  if (stat.isDirectory()) {
    mkdirSync(targetPath, { recursive: true });
    for (const child of readdirSync(sourcePath, { withFileTypes: true })) {
      syncRuntimeAssetEntry(resolve(sourcePath, child.name), resolve(targetPath, child.name));
    }
    return;
  }

  copyFileSync(sourcePath, targetPath);
}

export function hasInstalledBrainPack(targetRoot: string) {
  return existsSync(resolve(targetRoot, 'AGORA.md'));
}
