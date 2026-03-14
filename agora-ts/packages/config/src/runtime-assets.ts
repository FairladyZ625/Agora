import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

export interface EnsureBundledAgoraAssetsOptions {
  projectRoot: string;
  bundledSkillsDir?: string;
  bundledBrainPackDir?: string;
  userAgoraDir?: string;
  userSkillDirs?: string[];
}

export interface EnsuredAgoraAssetsResult {
  userAgoraDir: string;
  agoraSkillDir: string;
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

  mkdirSync(userAgoraDir, { recursive: true });

  const sourceSkillDir = resolve(bundledSkillsDir, 'agora-bootstrap');
  if (existsSync(sourceSkillDir)) {
    mkdirSync(resolve(userAgoraDir, 'skills'), { recursive: true });
    cpSync(sourceSkillDir, agoraSkillDir, {
      recursive: true,
      force: true,
    });
    installedSkillTargets.push(agoraSkillDir);

    for (const userSkillsDir of userSkillDirs) {
      mkdirSync(userSkillsDir, { recursive: true });
      const targetDir = resolve(userSkillsDir, 'agora-bootstrap');
      cpSync(sourceSkillDir, targetDir, {
        recursive: true,
        force: true,
      });
      installedSkillTargets.push(targetDir);
    }
  }

  const userBrainPackDir = resolve(userAgoraDir, 'agora-ai-brain');
  const bundledBrainPackDir = options.bundledBrainPackDir;
  if (bundledBrainPackDir && existsSync(bundledBrainPackDir)) {
    mkdirSync(userBrainPackDir, { recursive: true });
    cpSync(bundledBrainPackDir, userBrainPackDir, {
      recursive: true,
      force: true,
      filter: (source) => !source.startsWith(resolve(bundledBrainPackDir, 'tasks')),
    });
    mkdirSync(resolve(userBrainPackDir, 'tasks'), { recursive: true });
  }

  return {
    userAgoraDir,
    agoraSkillDir,
    userSkillDirs,
    installedSkillTargets,
    userBrainPackDir,
  };
}
