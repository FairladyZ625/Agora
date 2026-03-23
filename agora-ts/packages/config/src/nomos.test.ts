import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  ensureProjectNomosAuthoringDraft,
  installBuiltInAgoraNomosForProject,
  mergeProjectMetadataWithNomosProfile,
  nomosProjectProfileSchema,
  resolveInstalledCreateNomosPackTemplateDir,
  scaffoldNomosPack,
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
    expect(layout.docsReferenceProjectNomosSpecPath).toBe(join(agoraHomeDir, 'projects', 'proj-layout', 'docs', 'reference', 'project-nomos-authoring-spec.md'));
    expect(layout.bootstrapPromptsDir).toBe(join(agoraHomeDir, 'projects', 'proj-layout', 'prompts', 'bootstrap'));
    expect(layout.projectNomosDraftDir).toBe(join(agoraHomeDir, 'projects', 'proj-layout', 'nomos', 'project-nomos'));
    expect(layout.allDirectories).toContain(join(agoraHomeDir, 'projects', 'proj-layout', 'brain'));
  });

  it('materializes the frozen project-state skeleton and profile.toml', () => {
    const agoraHomeDir = makeAgoraHomeDir();
    const layout = ensureAgoraProjectStateLayout('proj-freeze', { userAgoraDir: agoraHomeDir });

    expect(existsSync(layout.constitutionDir)).toBe(true);
    expect(existsSync(layout.docsArchitectureDir)).toBe(true);
    expect(existsSync(layout.docsPlanningDir)).toBe(true);
    expect(existsSync(layout.lifecycleDir)).toBe(true);
    expect(existsSync(layout.bootstrapPromptsDir)).toBe(true);
    expect(existsSync(layout.profilePath)).toBe(true);
    expect(readFileSync(layout.profilePath, 'utf8')).toContain('schema_version = 1');
    expect(readFileSync(layout.profilePath, 'utf8')).toContain('id = "proj-freeze"');
    expect(readFileSync(layout.profilePath, 'utf8')).toContain('root_template = "~/.agora/projects/<project-id>"');
    expect(readFileSync(layout.docsArchitectureOperatingModelPath, 'utf8')).toContain('Operating Model');
    expect(readFileSync(layout.lifecycleProjectBootstrapPath, 'utf8')).toContain('Project Bootstrap Lifecycle');
    expect(readFileSync(layout.doctorProjectPromptPath, 'utf8')).toContain('Project Doctor');
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
    expect(readFileSync(join(installed.layout.constitutionDir, 'constitution.md'), 'utf8')).toContain('Agora Default Nomos Constitution');
    expect(readFileSync(join(installed.layout.bootstrapPromptsDir, 'interview.md'), 'utf8')).toContain('Harness Bootstrap Interview');
    expect(readFileSync(join(installed.layout.bootstrapPromptsDir, 'interview.md'), 'utf8')).toContain('bootstrap-fields.md');
    expect(readFileSync(installed.layout.bootstrapExistingProjectPromptPath, 'utf8')).toContain('Existing Project Bootstrap');
    expect(readFileSync(installed.layout.bootstrapNewProjectPromptPath, 'utf8')).toContain('New Project Bootstrap');
    expect(readFileSync(installed.layout.bootstrapNoRepoPromptPath, 'utf8')).toContain('No-Repo Bootstrap');
    expect(readFileSync(installed.layout.docsReferenceMethodologiesPath, 'utf8')).toContain('Methodologies');
    expect(readFileSync(installed.layout.docsReferenceMethodologiesPath, 'utf8')).toContain('Planning trio + SSoT + walkthrough loop');
    expect(readFileSync(installed.layout.docsReferenceCurrentSurfacePath, 'utf8')).toContain('Current Surface');
    expect(readFileSync(installed.layout.docsReferenceGovernancePath, 'utf8')).toContain('Governance');
    expect(readFileSync(installed.layout.docsReferenceLifecyclePath, 'utf8')).toContain('Lifecycle Reference');
    expect(readFileSync(installed.layout.docsReferenceBootstrapFieldsPath, 'utf8')).toContain('Bootstrap Fields');
    expect(readFileSync(installed.layout.docsArchitectureOperatingModelPath, 'utf8')).toContain('Three surfaces:');
    expect(readFileSync(installed.layout.lifecycleTaskContextDeliveryPath, 'utf8')).toContain('Task Context Delivery Lifecycle');
    expect(readFileSync(installed.layout.lifecycleTaskCloseoutPath, 'utf8')).toContain('Task Closeout Lifecycle');
    expect(readFileSync(installed.layout.lifecycleProjectArchivePath, 'utf8')).toContain('Project Archive Lifecycle');
    expect(readFileSync(installed.layout.lifecycleGovernanceDoctorPath, 'utf8')).toContain('Governance Doctor Lifecycle');
    expect(readFileSync(installed.layout.doctorProjectPromptPath, 'utf8')).toContain('Project Doctor');
  });

  it('creates a project-nomos authoring spec and draft pack inside global project state', () => {
    const agoraHomeDir = makeAgoraHomeDir();
    const templateRoot = resolveInstalledCreateNomosPackTemplateDir({ userAgoraDir: agoraHomeDir });
    mkdirSync(join(templateRoot, 'docs', 'reference'), { recursive: true });
    mkdirSync(join(templateRoot, 'prompts', 'bootstrap'), { recursive: true });
    writeFileSync(join(templateRoot, 'README.md'), '# Template\n', 'utf8');
    writeFileSync(join(templateRoot, 'docs', 'reference', 'methodologies.md'), 'template methods\n', 'utf8');
    writeFileSync(join(templateRoot, 'prompts', 'bootstrap', 'interview.md'), 'template interview\n', 'utf8');

    const result = ensureProjectNomosAuthoringDraft('proj-authoring', 'Authoring Project', {
      userAgoraDir: agoraHomeDir,
      repoPath: '/tmp/authoring-repo',
      nomosId: 'agora/default',
    });

    expect(result.specPath).toBe(join(agoraHomeDir, 'projects', 'proj-authoring', 'docs', 'reference', 'project-nomos-authoring-spec.md'));
    expect(result.draftDir).toBe(join(agoraHomeDir, 'projects', 'proj-authoring', 'nomos', 'project-nomos'));
    expect(result.draftProfilePath).toBe(join(agoraHomeDir, 'projects', 'proj-authoring', 'nomos', 'project-nomos', 'profile.toml'));
    expect(existsSync(result.specPath)).toBe(true);
    expect(existsSync(result.draftProfilePath!)).toBe(true);
    expect(readFileSync(result.specPath, 'utf8')).toContain('Project Nomos Authoring Spec');
    expect(readFileSync(result.specPath, 'utf8')).toContain('/tmp/authoring-repo');
    expect(readFileSync(result.draftProfilePath!, 'utf8')).toContain('id = "project/proj-authoring"');
    expect(readFileSync(result.draftProfilePath!, 'utf8')).toContain('name = "Authoring Project Nomos"');
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

  it('scaffolds a custom Nomos pack from template assets with customized metadata', () => {
    const templateRoot = join(makeAgoraHomeDir(), 'template');
    mkdirSync(join(templateRoot, 'docs', 'reference'), { recursive: true });
    mkdirSync(join(templateRoot, 'prompts', 'bootstrap'), { recursive: true });
    writeFileSync(join(templateRoot, 'README.md'), '# Template\n', 'utf8');
    writeFileSync(join(templateRoot, 'docs', 'reference', 'methodologies.md'), 'template methods\n', 'utf8');
    writeFileSync(join(templateRoot, 'prompts', 'bootstrap', 'interview.md'), 'template interview\n', 'utf8');

    const outputDir = join(makeAgoraHomeDir(), 'packs', 'acme-web');
    const result = scaffoldNomosPack({
      outputDir,
      templateDir: templateRoot,
      id: 'acme/web',
      name: 'Acme Web Nomos',
      description: 'Custom Nomos for Acme web delivery.',
      version: '0.2.0',
      lifecycleModules: ['project-bootstrap', 'task-context-delivery', 'task-closeout'],
      doctorChecks: ['constitution-present', 'docs-skeleton-complete'],
    });

    expect(result.outputDir).toBe(outputDir);
    expect(existsSync(join(outputDir, 'profile.toml'))).toBe(true);
    expect(existsSync(join(outputDir, 'README.md'))).toBe(true);
    expect(existsSync(join(outputDir, 'constitution', 'constitution.md'))).toBe(true);
    expect(existsSync(join(outputDir, 'lifecycle', 'project-bootstrap.md'))).toBe(true);
    expect(existsSync(join(outputDir, 'lifecycle', 'task-context-delivery.md'))).toBe(true);
    expect(existsSync(join(outputDir, 'lifecycle', 'task-closeout.md'))).toBe(true);
    expect(existsSync(join(outputDir, 'prompts', 'bootstrap', 'interview.md'))).toBe(true);
    expect(readFileSync(join(outputDir, 'profile.toml'), 'utf8')).toContain('id = "acme/web"');
    expect(readFileSync(join(outputDir, 'profile.toml'), 'utf8')).toContain('name = "Acme Web Nomos"');
    expect(readFileSync(join(outputDir, 'profile.toml'), 'utf8')).toContain('version = "0.2.0"');
    expect(readFileSync(join(outputDir, 'README.md'), 'utf8')).toContain('# Acme Web Nomos');
    expect(readFileSync(join(outputDir, 'README.md'), 'utf8')).toContain('Custom Nomos for Acme web delivery.');
    expect(readFileSync(join(outputDir, 'constitution', 'constitution.md'), 'utf8')).toContain('Acme Web Nomos');
    expect(readFileSync(join(outputDir, 'docs', 'reference', 'methodologies.md'), 'utf8')).toContain('Acme Web Nomos');
    expect(readFileSync(join(outputDir, 'prompts', 'bootstrap', 'interview.md'), 'utf8')).toContain('Acme Web Nomos');
  });
});
