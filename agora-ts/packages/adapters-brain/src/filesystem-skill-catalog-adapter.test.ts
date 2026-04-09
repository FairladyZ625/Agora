import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FilesystemSkillCatalogAdapter } from './filesystem-skill-catalog-adapter.js';

const tempPaths: string[] = [];

function makeTempDir(prefix: string) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempPaths.push(dir);
  return dir;
}

function writeSkill(root: string, relativeDir: string, content = '# Skill') {
  const dir = join(root, relativeDir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), content, 'utf8');
}

afterEach(() => {
  while (tempPaths.length > 0) {
    const dir = tempPaths.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('FilesystemSkillCatalogAdapter', () => {
  it('prefers earlier roots and records shadowed paths for duplicate skill refs', () => {
    const agoraRoot = makeTempDir('agora-skills-');
    const codexRoot = makeTempDir('codex-skills-');

    writeSkill(agoraRoot, 'planning-with-files');
    writeSkill(codexRoot, 'planning-with-files');
    writeSkill(codexRoot, 'refactoring-ui');

    const adapter = new FilesystemSkillCatalogAdapter({
      roots: [
        { path: agoraRoot, label: 'agora' },
        { path: codexRoot, label: 'codex' },
      ],
      ttlMs: 60_000,
    });

    expect(adapter.listSkills()).toEqual([
      expect.objectContaining({
        skill_ref: 'planning-with-files',
        source_label: 'agora',
        resolved_path: join(agoraRoot, 'planning-with-files', 'SKILL.md'),
        shadowed_paths: [join(codexRoot, 'planning-with-files', 'SKILL.md')],
      }),
      expect.objectContaining({
        skill_ref: 'refactoring-ui',
        source_label: 'codex',
        shadowed_paths: [],
      }),
    ]);
  });

  it('serves cached results until an explicit refresh is requested', () => {
    const agentsRoot = makeTempDir('agents-skills-');
    writeSkill(agentsRoot, 'planning-with-files');

    const adapter = new FilesystemSkillCatalogAdapter({
      roots: [{ path: agentsRoot, label: 'agents' }],
      ttlMs: 60_000,
    });

    expect(adapter.listSkills().map((item) => item.skill_ref)).toEqual(['planning-with-files']);

    writeSkill(agentsRoot, 'brainstorming');

    expect(adapter.listSkills().map((item) => item.skill_ref)).toEqual(['planning-with-files']);
    expect(adapter.listSkills({ refresh: true }).map((item) => item.skill_ref)).toEqual(['brainstorming', 'planning-with-files']);
  });
});
