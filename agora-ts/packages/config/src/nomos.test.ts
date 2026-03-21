import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BUILT_IN_AGORA_NOMOS_PACK,
  DEFAULT_AGORA_NOMOS_ID,
  NOMOS_PROJECT_STATE_DIRECTORIES,
  NOMOS_PROJECT_STATE_ROOT_TEMPLATE,
  REPO_AGENTS_SHIM_SECTION_ORDER,
  buildBuiltInAgoraNomosProjectProfile,
  ensureAgoraProjectStateLayout,
  installBuiltInAgoraNomosForProject,
  mergeProjectMetadataWithNomosProfile,
  nomosProjectProfileSchema,
  renderNomosProjectProfileToml,
  renderRepoAgentsShim,
  resolveAgoraProjectStateLayout,
} from './nomos.js';

const tempPaths: string[] = [];

function makeAgoraHomeDir() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-nomos-'));
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

describe('nomos pack model freeze', () => {
  it('builds the built-in Agora Nomos project profile with the frozen MVP fields', () => {
    const agoraHomeDir = makeAgoraHomeDir();
    const profile = buildBuiltInAgoraNomosProjectProfile('proj-alpha', { userAgoraDir: agoraHomeDir });

    expect(nomosProjectProfileSchema.parse(profile)).toEqual(profile);
    expect(profile.project.id).toBe('proj-alpha');
    expect(profile.project.state_root).toBe(join(agoraHomeDir, 'projects', 'proj-alpha'));
    expect(profile.pack).toMatchObject(BUILT_IN_AGORA_NOMOS_PACK);
    expect(profile.repository_shim.required_sections).toEqual([...REPO_AGENTS_SHIM_SECTION_ORDER]);
    expect(profile.project_state.root_template).toBe(NOMOS_PROJECT_STATE_ROOT_TEMPLATE);
    expect(profile.project_state.directories).toEqual([...NOMOS_PROJECT_STATE_DIRECTORIES]);
    expect(profile.project_state.versioning).toEqual({
      mode: 'git',
      auto_init: true,
    });
  });

  it('resolves the frozen global project-state layout under ~/.agora/projects/<project>', () => {
    const agoraHomeDir = makeAgoraHomeDir();
    const layout = resolveAgoraProjectStateLayout('proj-layout', { userAgoraDir: agoraHomeDir });

    expect(layout.projectsRoot).toBe(join(agoraHomeDir, 'projects'));
    expect(layout.root).toBe(join(agoraHomeDir, 'projects', 'proj-layout'));
    expect(layout.profilePath).toBe(join(agoraHomeDir, 'projects', 'proj-layout', 'profile.toml'));
    expect(layout.docsReferenceDir).toBe(join(agoraHomeDir, 'projects', 'proj-layout', 'docs', 'reference'));
    expect(layout.bootstrapPromptsDir).toBe(join(agoraHomeDir, 'projects', 'proj-layout', 'prompts', 'bootstrap'));
    expect(layout.allDirectories).toContain(join(agoraHomeDir, 'projects', 'proj-layout', 'brain'));
  });

  it('materializes the frozen project-state skeleton and profile.toml', () => {
    const agoraHomeDir = makeAgoraHomeDir();
    const layout = ensureAgoraProjectStateLayout('proj-freeze', { userAgoraDir: agoraHomeDir });

    expect(existsSync(layout.constitutionDir)).toBe(true);
    expect(existsSync(layout.docsPlanningDir)).toBe(true);
    expect(existsSync(layout.bootstrapPromptsDir)).toBe(true);
    expect(existsSync(layout.profilePath)).toBe(true);
    expect(readFileSync(layout.profilePath, 'utf8')).toContain('schema_version = 1');
    expect(readFileSync(layout.profilePath, 'utf8')).toContain('id = "proj-freeze"');
    expect(readFileSync(layout.profilePath, 'utf8')).toContain('root_template = "~/.agora/projects/<project-id>"');
  });

  it('renders a repo-root AGENTS shim with the frozen section contract', () => {
    const profile = buildBuiltInAgoraNomosProjectProfile('proj-shim', { userAgoraDir: makeAgoraHomeDir() });
    const shim = renderRepoAgentsShim({ profile });

    expect(shim).toContain('# AGENTS.md');
    expect(shim).toContain('## General Constitution');
    expect(shim).toContain('## Pack Index');
    expect(shim).toContain('## Bootstrap Method');
    expect(shim).toContain('## Fill Policy');
    expect(shim).toContain('Agora Default Nomos (`agora/default@0.1.0`)');
    expect(shim).toContain(profile.project.state_root);
    expect(shim).toContain('never back into `AGENTS.md`');
  });

  it('renders profile.toml with the frozen Nomos fields', () => {
    const profile = buildBuiltInAgoraNomosProjectProfile('proj-toml', { userAgoraDir: makeAgoraHomeDir() });
    const toml = renderNomosProjectProfileToml(profile);

    expect(toml).toContain('[project]');
    expect(toml).toContain('[pack]');
    expect(toml).toContain('install_mode = "copy_on_install"');
    expect(toml).toContain('required_sections = ["general_constitution", "pack_index", "bootstrap_method", "fill_policy"]');
    expect(toml).toContain('directories = ["constitution", "docs/architecture"');
    expect(toml).toContain('modules = ["project-bootstrap", "task-context-delivery", "task-closeout", "project-archive", "governance-doctor"]');
  });

  it('installs the built-in Agora Nomos into global project state and writes a repo shim', () => {
    const agoraHomeDir = makeAgoraHomeDir();
    const repoRoot = join(makeAgoraHomeDir(), 'repo-alpha');

    const installed = installBuiltInAgoraNomosForProject('proj-install', {
      userAgoraDir: agoraHomeDir,
      repoPath: repoRoot,
      initializeRepo: true,
    });

    expect(installed.profile.pack.id).toBe(DEFAULT_AGORA_NOMOS_ID);
    expect(installed.repoRoot).toBe(repoRoot);
    expect(installed.repoShimPath).toBe(join(repoRoot, 'AGENTS.md'));
    expect(installed.repoShimWritten).toBe(true);
    expect(installed.repoGitInitialized).toBe(true);
    expect(installed.projectStateGitInitialized).toBe(true);
    expect(existsSync(join(repoRoot, 'AGENTS.md'))).toBe(true);
    expect(readFileSync(join(repoRoot, 'AGENTS.md'), 'utf8')).toContain('## Pack Index');
    expect(existsSync(join(repoRoot, '.git'))).toBe(true);
    expect(existsSync(join(installed.layout.root, '.git'))).toBe(true);
    expect(readFileSync(join(installed.layout.constitutionDir, 'constitution.md'), 'utf8')).toContain('General Constitution');
    expect(readFileSync(join(installed.layout.bootstrapPromptsDir, 'interview.md'), 'utf8')).toContain('Harness Bootstrap Interview');
  });

  it('merges persisted project metadata with the installed Nomos boundary', () => {
    const profile = buildBuiltInAgoraNomosProjectProfile('proj-meta', { userAgoraDir: makeAgoraHomeDir() });
    const metadata = mergeProjectMetadataWithNomosProfile({
      tier: 'internal',
      agora: {
        existing_flag: true,
      },
    }, profile);

    expect(metadata).toMatchObject({
      tier: 'internal',
      agora: {
        existing_flag: true,
        nomos: {
          id: 'agora/default',
          version: '0.1.0',
          source: 'builtin:agora-default',
          install_mode: 'copy_on_install',
          root_template: '~/.agora/projects/<project-id>',
        },
      },
    });
  });
});
