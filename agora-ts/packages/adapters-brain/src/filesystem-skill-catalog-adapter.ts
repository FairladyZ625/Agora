import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, relative, sep } from 'node:path';
import type { ListSkillsInput, SkillCatalogEntry, SkillCatalogPort } from '@agora-ts/core';

interface SkillCatalogRoot {
  path: string;
  label: string;
}

export interface FilesystemSkillCatalogAdapterOptions {
  roots?: SkillCatalogRoot[];
  ttlMs?: number;
  now?: () => Date;
}

type CachedCatalog = {
  loadedAtMs: number;
  skills: SkillCatalogEntry[];
};

function defaultRoots(): SkillCatalogRoot[] {
  return [
    { path: join(homedir(), '.agora', 'skills'), label: 'agora' },
    { path: join(homedir(), '.agents', 'skills'), label: 'agents' },
    { path: join(homedir(), '.codex', 'skills'), label: 'codex' },
    { path: join(homedir(), '.claude', 'skills'), label: 'claude' },
  ];
}

function toPosixPath(value: string) {
  return value.split(sep).join('/');
}

function listSkillFiles(root: string): string[] {
  if (!existsSync(root)) {
    return [];
  }
  const files: string[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name === 'SKILL.md') {
        files.push(fullPath);
      }
    }
  }

  return files;
}

export class FilesystemSkillCatalogAdapter implements SkillCatalogPort {
  private readonly roots: SkillCatalogRoot[];
  private readonly ttlMs: number;
  private readonly now: () => Date;
  private cache: CachedCatalog | null = null;

  constructor(options: FilesystemSkillCatalogAdapterOptions = {}) {
    this.roots = options.roots ?? defaultRoots();
    this.ttlMs = options.ttlMs ?? 60_000;
    this.now = options.now ?? (() => new Date());
  }

  listSkills(input: ListSkillsInput = {}): SkillCatalogEntry[] {
    const nowMs = this.now().getTime();
    if (!input.refresh && this.cache && (nowMs - this.cache.loadedAtMs) < this.ttlMs) {
      return this.cache.skills;
    }
    const skills = this.scan();
    this.cache = {
      loadedAtMs: nowMs,
      skills,
    };
    return skills;
  }

  private scan(): SkillCatalogEntry[] {
    const winners = new Map<string, SkillCatalogEntry>();

    for (const [index, root] of this.roots.entries()) {
      for (const skillFile of listSkillFiles(root.path)) {
        const skillDir = dirname(skillFile);
        const relativePath = toPosixPath(relative(root.path, skillDir));
        const entry: SkillCatalogEntry = {
          skill_ref: basename(skillDir),
          relative_path: relativePath,
          resolved_path: skillFile,
          source_root: root.path,
          source_label: root.label,
          precedence: index,
          mtime: statSync(skillFile).mtime.toISOString(),
          shadowed_paths: [],
        };

        const current = winners.get(entry.skill_ref);
        if (!current) {
          winners.set(entry.skill_ref, entry);
          continue;
        }

        if (entry.precedence < current.precedence) {
          entry.shadowed_paths = [
            current.resolved_path,
            ...current.shadowed_paths,
          ];
          winners.set(entry.skill_ref, entry);
          continue;
        }

        current.shadowed_paths.push(entry.resolved_path);
      }
    }

    return Array.from(winners.values()).sort((left, right) => left.skill_ref.localeCompare(right.skill_ref));
  }
}
