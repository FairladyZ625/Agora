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
  exportProjectNomosPack,
  exportNomosShareBundle,
  ensureAgoraProjectStateLayout,
  ensureProjectNomosAuthoringDraft,
  importNomosSource,
  importNomosShareBundle,
  inspectPublishedNomosCatalogPack,
  installCatalogNomosPackToProject,
  installLocalNomosPackToProject,
  installNomosFromSource,
  installBuiltInAgoraNomosForProject,
  listPublishedNomosCatalog,
  mergeProjectMetadataWithNomosProfile,
  nomosProjectProfileSchema,
  parseProjectNomosAuthoringSpec,
  publishProjectNomosPack,
  registerNomosSource,
  requireSupportedNomosId,
  refineProjectNomosDraftFromSpec,
  activateProjectNomosDraft,
  assessPublishedNomosCatalogEntryTrust,
  assessRegisteredNomosSourceTrust,
  inspectRegisteredNomosSource,
  listRegisteredNomosSources,
  installNomosFromRegisteredSource,
  syncRegisteredNomosSource,
  reviewProjectNomosDraft,
  validateProjectNomos,
  diffProjectNomos,
  diagnoseProjectNomosDrift,
  resolveInstalledCreateNomosPackTemplateDir,
  scaffoldNomosPack,
  renderNomosProjectProfileToml,
  renderRepoAgentsShim,
  renderRepoClaudeShim,
  loadNomosProjectProfile,
  resolveAgoraProjectStateLayout,
  resolveProjectNomosState,
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

  it('loads a Nomos project profile back from profile.toml', () => {
    const agoraHomeDir = makeAgoraHomeDir();
    const profile = buildBuiltInAgoraNomosProjectProfile('proj-load', { userAgoraDir: agoraHomeDir });
    const layout = ensureAgoraProjectStateLayout('proj-load', { userAgoraDir: agoraHomeDir });
    writeFileSync(layout.profilePath, renderNomosProjectProfileToml(profile), 'utf8');

    const loaded = loadNomosProjectProfile(layout.profilePath);

    expect(loaded).toEqual(profile);
  });

  it('renders a repo-root CLAUDE shim as an index-only runtime-facing artifact', () => {
    const profile = buildBuiltInAgoraNomosProjectProfile('proj-claude', { userAgoraDir: makeAgoraHomeDir() });

    const shim = renderRepoClaudeShim({ profile });

    expect(shim).toContain('# CLAUDE.md');
    expect(shim).toContain('repo-facing shim for Claude Code');
    expect(shim).toContain('## Pack Index');
    expect(shim).toContain(profile.project.state_root);
    expect(shim).toContain('`CLAUDE.md` stays thin and index-only');
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
    expect(readFileSync(join(installed.layout.bootstrapPromptsDir, 'layered.md'), 'utf8')).toContain('Layered Bootstrap Methodology');
    expect(readFileSync(join(installed.layout.bootstrapPromptsDir, 'lean-delivery.md'), 'utf8')).toContain('Lean Delivery Bootstrap Methodology');
    expect(readFileSync(join(installed.layout.bootstrapPromptsDir, 'discovery-first.md'), 'utf8')).toContain('Discovery-First Bootstrap Methodology');
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

  it('can prepare built-in Agora Nomos without writing the repo shim immediately', () => {
    const agoraHomeDir = makeAgoraHomeDir();
    const repoRoot = join(makeAgoraHomeDir(), 'repo-no-shim');

    const installed = installBuiltInAgoraNomosForProject('proj-no-shim', {
      userAgoraDir: agoraHomeDir,
      repoPath: repoRoot,
      initializeRepo: true,
      writeRepoShim: false,
    });

    expect(installed.repoRoot).toBe(repoRoot);
    expect(installed.repoShimPath).toBe(join(repoRoot, 'AGENTS.md'));
    expect(installed.repoShimWritten).toBe(false);
    expect(existsSync(join(repoRoot, 'AGENTS.md'))).toBe(false);
    expect(existsSync(join(repoRoot, '.git'))).toBe(true);
    expect(existsSync(join(installed.layout.root, '.git'))).toBe(true);
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
    expect(readFileSync(result.specPath, 'utf8')).toContain('project_shape: "existing_repo"');
    expect(readFileSync(result.specPath, 'utf8')).toContain('/tmp/authoring-repo');
    expect(readFileSync(result.draftProfilePath!, 'utf8')).toContain('id = "project/proj-authoring"');
    expect(readFileSync(result.draftProfilePath!, 'utf8')).toContain('name = "Authoring Project Nomos"');
  });

  it('parses a structured authoring spec and refines the project nomos draft from it', () => {
    const agoraHomeDir = makeAgoraHomeDir();
    const templateRoot = resolveInstalledCreateNomosPackTemplateDir({ userAgoraDir: agoraHomeDir });
    mkdirSync(join(templateRoot, 'docs', 'reference'), { recursive: true });
    mkdirSync(join(templateRoot, 'prompts', 'bootstrap'), { recursive: true });
    writeFileSync(join(templateRoot, 'README.md'), '# Template\n', 'utf8');
    writeFileSync(join(templateRoot, 'docs', 'reference', 'methodologies.md'), 'template methods\n', 'utf8');
    writeFileSync(join(templateRoot, 'prompts', 'bootstrap', 'interview.md'), 'template interview\n', 'utf8');

    const seeded = ensureProjectNomosAuthoringDraft('proj-refine', 'Refine Project', {
      userAgoraDir: agoraHomeDir,
      repoPath: '/tmp/refine-repo',
      nomosId: 'agora/default',
    });

    writeFileSync(seeded.specPath, [
      '---',
      'project_id: "proj-refine"',
      'project_name: "Refine Project"',
      'base_nomos_id: "agora/default"',
      'project_shape: "existing_repo"',
      'bootstrap_methodology: "lean_delivery"',
      'repo_path: "/tmp/refine-repo"',
      'purpose: "Refined Nomos for a code-heavy product project."',
      'lifecycle_modules:',
      '  - project-bootstrap',
      '  - task-closeout',
      'doctor_checks:',
      '  - constitution-present',
      '  - bootstrap-prompts-present',
      'methodology_keep:',
      '  - planning trio',
      '  - walkthrough discipline',
      'methodology_change:',
      '  - replace dashboard-first review with CLI-first review',
      'open_questions:',
      '  - Should closeout require human signoff?',
      '---',
      '',
      '# Project Nomos Authoring Spec',
    ].join('\n'), 'utf8');

    const parsed = parseProjectNomosAuthoringSpec(seeded.specPath);
    expect(parsed.project_shape).toBe('existing_repo');
    expect(parsed.bootstrap_methodology).toBe('lean_delivery');
    expect(parsed.lifecycle_modules).toEqual(['project-bootstrap', 'task-closeout']);
    expect(parsed.doctor_checks).toEqual(['constitution-present', 'bootstrap-prompts-present']);
    expect(parsed.methodology_keep).toEqual(['planning trio', 'walkthrough discipline']);
    expect(parsed.methodology_change).toEqual(['replace dashboard-first review with CLI-first review']);
    expect(parsed.open_questions).toEqual(['Should closeout require human signoff?']);

    const refined = refineProjectNomosDraftFromSpec('proj-refine', { userAgoraDir: agoraHomeDir });
    expect(refined.spec.project_id).toBe('proj-refine');
    expect(refined.draftProfilePath).toBe(join(agoraHomeDir, 'projects', 'proj-refine', 'nomos', 'project-nomos', 'profile.toml'));
    expect(readFileSync(refined.draftProfilePath, 'utf8')).toContain('description = "Refined Nomos for a code-heavy product project."');
    expect(readFileSync(refined.draftProfilePath, 'utf8')).toContain('modules = ["project-bootstrap", "task-closeout"]');
    expect(readFileSync(join(refined.draftDir, 'README.md'), 'utf8')).toContain('Refined Nomos for a code-heavy product project.');
    expect(readFileSync(join(refined.draftDir, 'docs', 'reference', 'methodologies.md'), 'utf8')).toContain('planning trio');
    expect(readFileSync(join(refined.draftDir, 'docs', 'reference', 'methodologies.md'), 'utf8')).toContain('replace dashboard-first review with CLI-first review');
    expect(readFileSync(join(refined.draftDir, 'prompts', 'bootstrap', 'interview.md'), 'utf8')).toContain('Should closeout require human signoff?');
    expect(readFileSync(join(refined.draftDir, 'prompts', 'bootstrap', 'lean-delivery.md'), 'utf8')).toContain('Lean Delivery Bootstrap Methodology');
  });

  it('preserves manually edited constitution and lifecycle docs on refine-project by default', () => {
    const agoraHomeDir = makeAgoraHomeDir();
    const templateRoot = resolveInstalledCreateNomosPackTemplateDir({ userAgoraDir: agoraHomeDir });
    mkdirSync(join(templateRoot, 'docs', 'reference'), { recursive: true });
    mkdirSync(join(templateRoot, 'prompts', 'bootstrap'), { recursive: true });
    writeFileSync(join(templateRoot, 'README.md'), '# Template\n', 'utf8');
    writeFileSync(join(templateRoot, 'docs', 'reference', 'methodologies.md'), 'template methods\n', 'utf8');
    writeFileSync(join(templateRoot, 'prompts', 'bootstrap', 'interview.md'), 'template interview\n', 'utf8');

    const seeded = ensureProjectNomosAuthoringDraft('proj-safe-refine', 'Safe Refine Project', {
      userAgoraDir: agoraHomeDir,
      repoPath: '/tmp/safe-refine-repo',
      nomosId: 'agora/default',
    });

    const constitutionPath = join(seeded.draftDir, 'constitution', 'constitution.md');
    const lifecyclePath = join(seeded.draftDir, 'lifecycle', 'project-bootstrap.md');
    writeFileSync(constitutionPath, '# Custom Constitution\n\nDo not overwrite me.\n', 'utf8');
    writeFileSync(lifecyclePath, '# Custom Bootstrap\n\nHuman-authored workflow.\n', 'utf8');

    writeFileSync(seeded.specPath, [
      '---',
      'project_id: "proj-safe-refine"',
      'project_name: "Safe Refine Project"',
      'base_nomos_id: "agora/default"',
      'project_shape: "existing_repo"',
      'repo_path: "/tmp/safe-refine-repo"',
      'purpose: "Refined but safe."',
      'lifecycle_modules:',
      '  - project-bootstrap',
      '  - task-closeout',
      'doctor_checks:',
      '  - constitution-present',
      '  - bootstrap-prompts-present',
      'methodology_keep:',
      '  - preserve manual draft edits',
      'methodology_change:',
      '  - refresh generated docs only',
      'open_questions: []',
      '---',
      '',
      '# Project Nomos Authoring Spec',
    ].join('\n'), 'utf8');

    const refined = refineProjectNomosDraftFromSpec('proj-safe-refine', { userAgoraDir: agoraHomeDir });
    expect(readFileSync(constitutionPath, 'utf8')).toContain('Do not overwrite me.');
    expect(readFileSync(lifecyclePath, 'utf8')).toContain('Human-authored workflow.');
    expect(readFileSync(join(refined.draftDir, 'docs', 'reference', 'methodologies.md'), 'utf8')).toContain('preserve manual draft edits');
    expect(readFileSync(refined.draftProfilePath, 'utf8')).toContain('description = "Refined but safe."');
  });

  it('supports explicit destructive replace on refine-project when requested', () => {
    const agoraHomeDir = makeAgoraHomeDir();
    const templateRoot = resolveInstalledCreateNomosPackTemplateDir({ userAgoraDir: agoraHomeDir });
    mkdirSync(join(templateRoot, 'docs', 'reference'), { recursive: true });
    mkdirSync(join(templateRoot, 'prompts', 'bootstrap'), { recursive: true });
    writeFileSync(join(templateRoot, 'README.md'), '# Template\n', 'utf8');
    writeFileSync(join(templateRoot, 'docs', 'reference', 'methodologies.md'), 'template methods\n', 'utf8');
    writeFileSync(join(templateRoot, 'prompts', 'bootstrap', 'interview.md'), 'template interview\n', 'utf8');

    const seeded = ensureProjectNomosAuthoringDraft('proj-force-refine', 'Force Refine Project', {
      userAgoraDir: agoraHomeDir,
      repoPath: '/tmp/force-refine-repo',
      nomosId: 'agora/default',
    });

    const constitutionPath = join(seeded.draftDir, 'constitution', 'constitution.md');
    writeFileSync(constitutionPath, '# Custom Constitution\n\nOverwrite me when forced.\n', 'utf8');

    writeFileSync(seeded.specPath, [
      '---',
      'project_id: "proj-force-refine"',
      'project_name: "Force Refine Project"',
      'base_nomos_id: "agora/default"',
      'project_shape: "existing_repo"',
      'repo_path: "/tmp/force-refine-repo"',
      'purpose: "Forced replace."',
      'lifecycle_modules:',
      '  - project-bootstrap',
      'doctor_checks:',
      '  - constitution-present',
      'methodology_keep: []',
      'methodology_change: []',
      'open_questions: []',
      '---',
      '',
      '# Project Nomos Authoring Spec',
    ].join('\n'), 'utf8');

    refineProjectNomosDraftFromSpec('proj-force-refine', {
      userAgoraDir: agoraHomeDir,
      replaceExisting: true,
    });

    expect(readFileSync(constitutionPath, 'utf8')).not.toContain('Overwrite me when forced.');
    expect(readFileSync(constitutionPath, 'utf8')).toContain('Force Refine Project Nomos');
  });

  it('merges persisted project metadata with the installed Nomos boundary', () => {
    const agoraHomeDir = makeAgoraHomeDir();
    const profile = buildBuiltInAgoraNomosProjectProfile('proj-meta', { userAgoraDir: agoraHomeDir });
    const metadata = mergeProjectMetadataWithNomosProfile({
      tier: 'internal',
      agora: {
        existing_flag: true,
        nomos: {
          draft_root: '/tmp/unsafe-draft',
          draft_profile_path: '/tmp/unsafe-draft/profile.toml',
          active_root: '/tmp/unsafe-active',
          active_profile_path: '/tmp/unsafe-active/profile.toml',
        },
      },
    }, profile);
    const state = resolveProjectNomosState('proj-meta', metadata, { userAgoraDir: agoraHomeDir });

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
          activation_status: 'active_builtin',
          draft_root: join(agoraHomeDir, 'projects', 'proj-meta', 'nomos', 'project-nomos'),
          draft_profile_path: join(agoraHomeDir, 'projects', 'proj-meta', 'nomos', 'project-nomos', 'profile.toml'),
          active_root: join(agoraHomeDir, 'projects', 'proj-meta'),
          active_profile_path: join(agoraHomeDir, 'projects', 'proj-meta', 'profile.toml'),
        },
      },
    });
    expect(state.draft_root).toBe(join(agoraHomeDir, 'projects', 'proj-meta', 'nomos', 'project-nomos'));
    expect(state.active_root).toBe(join(agoraHomeDir, 'projects', 'proj-meta'));
  });

  it('validates draft and active project nomos targets and reports semantic diffs', () => {
    const agoraHomeDir = makeAgoraHomeDir();
    const installed = installBuiltInAgoraNomosForProject('proj-validate', { userAgoraDir: agoraHomeDir });
    ensureProjectNomosAuthoringDraft('proj-validate', 'Validate Project', {
      userAgoraDir: agoraHomeDir,
      nomosId: installed.profile.pack.id,
    });
    const metadata = mergeProjectMetadataWithNomosProfile({}, installed.profile);

    const draftValidation = validateProjectNomos('proj-validate', metadata, {
      userAgoraDir: agoraHomeDir,
      target: 'draft',
    });
    const activeValidation = validateProjectNomos('proj-validate', metadata, {
      userAgoraDir: agoraHomeDir,
      target: 'active',
    });
    const diff = diffProjectNomos('proj-validate', metadata, {
      userAgoraDir: agoraHomeDir,
      base: 'active',
      candidate: 'draft',
    });

    expect(draftValidation.valid).toBe(true);
    expect(draftValidation.pack?.pack_id).toBe('project/proj-validate');
    expect(activeValidation.valid).toBe(true);
    expect(activeValidation.pack?.pack_id).toBe('agora/default');
    expect(diff.changed).toBe(true);
    expect(diff.differences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'pack_id',
          from: 'agora/default',
          to: 'project/proj-validate',
        }),
      ]),
    );
    expect(draftValidation.provenance).toMatchObject({
      kind: 'local_authoring',
      trust_state: 'trusted',
      freshness_state: 'current',
      activation_eligibility: 'allowed',
    });
    expect(activeValidation.provenance).toMatchObject({
      kind: 'builtin',
      trust_state: 'trusted',
      freshness_state: 'current',
      activation_eligibility: 'allowed',
    });
  });

  it('surfaces review and validation provenance for registered-source installs', () => {
    const sourceAgoraHomeDir = makeAgoraHomeDir();
    const targetAgoraHomeDir = makeAgoraHomeDir();

    const sourceInstalled = installBuiltInAgoraNomosForProject('proj-prov-source', { userAgoraDir: sourceAgoraHomeDir });
    ensureProjectNomosAuthoringDraft('proj-prov-source', 'Provenance Source', {
      userAgoraDir: sourceAgoraHomeDir,
      nomosId: sourceInstalled.profile.pack.id,
    });
    const sourceMetadata = mergeProjectMetadataWithNomosProfile({}, sourceInstalled.profile);
    const exported = exportProjectNomosPack('proj-prov-source', sourceMetadata, {
      userAgoraDir: sourceAgoraHomeDir,
      target: 'draft',
      outputDir: join(sourceAgoraHomeDir, 'provenance-pack-root'),
    });

    registerNomosSource({
      userAgoraDir: targetAgoraHomeDir,
      sourceId: 'team/provenance-source',
      sourceDir: exported.output_dir,
    });

    const targetInstalled = installBuiltInAgoraNomosForProject('proj-prov-target', { userAgoraDir: targetAgoraHomeDir });
    const targetMetadata = mergeProjectMetadataWithNomosProfile({}, targetInstalled.profile);
    const installed = installNomosFromRegisteredSource('proj-prov-target', targetMetadata, {
      userAgoraDir: targetAgoraHomeDir,
      sourceId: 'team/provenance-source',
    });

    const review = reviewProjectNomosDraft('proj-prov-target', installed.metadata, {
      userAgoraDir: targetAgoraHomeDir,
    });
    const draftValidation = validateProjectNomos('proj-prov-target', installed.metadata, {
      userAgoraDir: targetAgoraHomeDir,
      target: 'draft',
    });

    expect(review.active_provenance).toMatchObject({
      kind: 'builtin',
      trust_state: 'trusted',
      freshness_state: 'current',
      activation_eligibility: 'allowed',
    });
    expect(review.draft_provenance).toMatchObject({
      kind: 'registered_source',
      source_id: 'team/provenance-source',
      source_kind: 'pack_root',
      trust_state: 'untrusted',
      freshness_state: 'current',
      activation_eligibility: 'blocked',
    });
    expect(draftValidation.provenance).toMatchObject({
      kind: 'registered_source',
      source_id: 'team/provenance-source',
      source_kind: 'pack_root',
      trust_state: 'untrusted',
      freshness_state: 'current',
      activation_eligibility: 'blocked',
    });

  });

  it('blocks activation when draft provenance is not activation-eligible', () => {
    const sourceAgoraHomeDir = makeAgoraHomeDir();
    const targetAgoraHomeDir = makeAgoraHomeDir();

    const sourceInstalled = installBuiltInAgoraNomosForProject('proj-block-source', { userAgoraDir: sourceAgoraHomeDir });
    ensureProjectNomosAuthoringDraft('proj-block-source', 'Blocked Source', {
      userAgoraDir: sourceAgoraHomeDir,
      nomosId: sourceInstalled.profile.pack.id,
    });
    const sourceMetadata = mergeProjectMetadataWithNomosProfile({}, sourceInstalled.profile);
    const exported = exportProjectNomosPack('proj-block-source', sourceMetadata, {
      userAgoraDir: sourceAgoraHomeDir,
      target: 'draft',
      outputDir: join(sourceAgoraHomeDir, 'blocked-pack-root'),
    });

    registerNomosSource({
      userAgoraDir: targetAgoraHomeDir,
      sourceId: 'team/blocked-source',
      sourceDir: exported.output_dir,
    });

    const targetInstalled = installBuiltInAgoraNomosForProject('proj-block-target', { userAgoraDir: targetAgoraHomeDir });
    const targetMetadata = mergeProjectMetadataWithNomosProfile({}, targetInstalled.profile);
    const installed = installNomosFromRegisteredSource('proj-block-target', targetMetadata, {
      userAgoraDir: targetAgoraHomeDir,
      sourceId: 'team/blocked-source',
    });

    expect(() => activateProjectNomosDraft('proj-block-target', {
      userAgoraDir: targetAgoraHomeDir,
      metadata: installed.metadata,
      actor: 'archon',
    })).toThrowError(/provenance is blocked/i);
  });

  it('summarizes nomos drift taxonomy from validation and semantic diff', () => {
    const agoraHomeDir = makeAgoraHomeDir();
    const installed = installBuiltInAgoraNomosForProject('proj-drift', { userAgoraDir: agoraHomeDir });
    ensureProjectNomosAuthoringDraft('proj-drift', 'Drift Project', {
      userAgoraDir: agoraHomeDir,
      nomosId: installed.profile.pack.id,
    });
    const metadata = mergeProjectMetadataWithNomosProfile({}, installed.profile);

    const drift = diagnoseProjectNomosDrift('proj-drift', metadata, { userAgoraDir: agoraHomeDir });

    expect(drift.risk_level).toBe('medium');
    expect(drift.activation_blockers).toBe(0);
    expect(drift.semantic_changes).toBeGreaterThan(0);
    expect(drift.changed_fields).toContain('pack_id');
    expect(drift.removed_lifecycle_modules).toEqual(
      expect.arrayContaining(['project-archive', 'governance-doctor']),
    );
    expect(drift.removed_doctor_checks).toContain('repo-shim-present');
  });

  it('exports a project draft pack and installs it into another project draft slot', () => {
    const agoraHomeDir = makeAgoraHomeDir();
    const sourceInstalled = installBuiltInAgoraNomosForProject('proj-source', { userAgoraDir: agoraHomeDir });
    ensureProjectNomosAuthoringDraft('proj-source', 'Source Project', {
      userAgoraDir: agoraHomeDir,
      nomosId: sourceInstalled.profile.pack.id,
    });
    const sourceMetadata = mergeProjectMetadataWithNomosProfile({}, sourceInstalled.profile);

    const exportDir = join(agoraHomeDir, 'exports', 'source-pack');
    const exported = exportProjectNomosPack('proj-source', sourceMetadata, {
      userAgoraDir: agoraHomeDir,
      target: 'draft',
      outputDir: exportDir,
    });

    expect(existsSync(join(exportDir, 'profile.toml'))).toBe(true);
    expect(exported.pack?.pack_id).toBe('project/proj-source');

    const targetInstalled = installBuiltInAgoraNomosForProject('proj-target', { userAgoraDir: agoraHomeDir });
    const targetMetadata = mergeProjectMetadataWithNomosProfile({}, targetInstalled.profile);
    const installed = installLocalNomosPackToProject('proj-target', targetMetadata, {
      userAgoraDir: agoraHomeDir,
      packDir: exportDir,
    });

    expect(installed.pack.pack_id).toBe('project/proj-source');
    expect(existsSync(installed.installed_root)).toBe(true);
    expect(((installed.metadata as { agora?: { nomos?: { draft_profile_path?: string } } }).agora?.nomos?.draft_profile_path)).toContain('/projects/proj-target/nomos/project-nomos/profile.toml');
    const targetValidation = validateProjectNomos('proj-target', installed.metadata, {
      userAgoraDir: agoraHomeDir,
      target: 'draft',
    });
    expect(targetValidation.valid).toBe(true);
    expect(targetValidation.pack?.pack_id).toBe('project/proj-source');
  });

  it('rejects export targets nested under the source pack root', () => {
    const agoraHomeDir = makeAgoraHomeDir();
    const sourceInstalled = installBuiltInAgoraNomosForProject('proj-export-nested', { userAgoraDir: agoraHomeDir });
    ensureProjectNomosAuthoringDraft('proj-export-nested', 'Nested Export Project', {
      userAgoraDir: agoraHomeDir,
      nomosId: sourceInstalled.profile.pack.id,
    });
    const sourceMetadata = mergeProjectMetadataWithNomosProfile({}, sourceInstalled.profile);
    const nestedOutputDir = join(
      agoraHomeDir,
      'projects',
      'proj-export-nested',
      'nomos',
      'project-nomos',
      'exports',
      'bundle',
    );

    expect(() => exportProjectNomosPack('proj-export-nested', sourceMetadata, {
      userAgoraDir: agoraHomeDir,
      target: 'draft',
      outputDir: nestedOutputDir,
    })).toThrowError(/must not be nested under the source pack root/);
    expect(existsSync(nestedOutputDir)).toBe(false);
  });

  it('publishes a project draft pack into the local catalog and installs it from catalog into another project', () => {
    const agoraHomeDir = makeAgoraHomeDir();
    const sourceInstalled = installBuiltInAgoraNomosForProject('proj-publish-source', { userAgoraDir: agoraHomeDir });
    ensureProjectNomosAuthoringDraft('proj-publish-source', 'Publish Source', {
      userAgoraDir: agoraHomeDir,
      nomosId: sourceInstalled.profile.pack.id,
    });
    const sourceMetadata = mergeProjectMetadataWithNomosProfile({}, sourceInstalled.profile);

    const published = publishProjectNomosPack('proj-publish-source', sourceMetadata, {
      userAgoraDir: agoraHomeDir,
      target: 'draft',
      publishedBy: 'archon',
      publishedNote: 'ready for reuse',
    });

    expect(existsSync(join(published.catalog_pack_root, 'profile.toml'))).toBe(true);
    expect(existsSync(published.manifest_path)).toBe(true);
    expect(published.entry.pack_id).toBe('project/proj-publish-source');
    expect(published.entry.published_by).toBe('archon');
    expect(published.entry.published_note).toBe('ready for reuse');
    expect(published.entry.source_activation_status).toBe('active_builtin');

    const listed = listPublishedNomosCatalog({ userAgoraDir: agoraHomeDir });
    expect(listed.total).toBe(1);
    expect(listed.summaries[0]?.published_by).toBe('archon');
    expect(listed.entries.map((entry) => entry.pack_id)).toContain('project/proj-publish-source');

    const inspected = inspectPublishedNomosCatalogPack('project/proj-publish-source', { userAgoraDir: agoraHomeDir });
    expect(inspected.source_project_id).toBe('proj-publish-source');
    expect(inspected.source_repo_path).toBeNull();

    const targetInstalled = installBuiltInAgoraNomosForProject('proj-publish-target', { userAgoraDir: agoraHomeDir });
    const targetMetadata = mergeProjectMetadataWithNomosProfile({}, targetInstalled.profile);
    const installed = installCatalogNomosPackToProject('proj-publish-target', targetMetadata, {
      userAgoraDir: agoraHomeDir,
      packId: 'project/proj-publish-source',
    });

    expect(installed.pack.pack_id).toBe('project/proj-publish-source');
    expect(installed.catalog_entry.pack_id).toBe('project/proj-publish-source');
    const targetValidation = validateProjectNomos('proj-publish-target', installed.metadata, {
      userAgoraDir: agoraHomeDir,
      target: 'draft',
    });
    expect(targetValidation.valid).toBe(true);
  });

  it('exports a published catalog pack into a share bundle and reuses it from source in another project', () => {
    const sourceAgoraHomeDir = makeAgoraHomeDir();
    const sharedBundleDir = join(makeAgoraHomeDir(), 'shared-bundle');
    const targetAgoraHomeDir = makeAgoraHomeDir();

    const sourceInstalled = installBuiltInAgoraNomosForProject('proj-share-source', { userAgoraDir: sourceAgoraHomeDir });
    ensureProjectNomosAuthoringDraft('proj-share-source', 'Share Source', {
      userAgoraDir: sourceAgoraHomeDir,
      nomosId: sourceInstalled.profile.pack.id,
    });
    const sourceMetadata = mergeProjectMetadataWithNomosProfile({}, sourceInstalled.profile);
    publishProjectNomosPack('proj-share-source', sourceMetadata, {
      userAgoraDir: sourceAgoraHomeDir,
      target: 'draft',
      publishedBy: 'archon',
      publishedNote: 'remote share bundle',
    });

    const exported = exportNomosShareBundle({
      userAgoraDir: sourceAgoraHomeDir,
      packId: 'project/proj-share-source',
      outputDir: sharedBundleDir,
    });

    expect(exported.pack_id).toBe('project/proj-share-source');
    expect(existsSync(join(sharedBundleDir, 'profile.toml'))).toBe(true);
    expect(existsSync(join(sharedBundleDir, 'nomos-share-bundle.json'))).toBe(true);
    expect(exported.manifest.pack.pack_id).toBe('project/proj-share-source');
    expect(exported.manifest.source.published_by).toBe('archon');

    const imported = importNomosShareBundle({
      userAgoraDir: targetAgoraHomeDir,
      sourceDir: sharedBundleDir,
    });

    expect(imported.entry.pack_id).toBe('project/proj-share-source');
    expect(existsSync(join(imported.entry.published_root, 'profile.toml'))).toBe(true);

    const targetInstalled = installBuiltInAgoraNomosForProject('proj-share-target', { userAgoraDir: targetAgoraHomeDir });
    const targetMetadata = mergeProjectMetadataWithNomosProfile({}, targetInstalled.profile);
    const installed = installNomosFromSource('proj-share-target', targetMetadata, {
      userAgoraDir: targetAgoraHomeDir,
      sourceDir: sharedBundleDir,
    });

    expect(installed.pack.pack_id).toBe('project/proj-share-source');
    expect(installed.imported.entry.pack_id).toBe('project/proj-share-source');
    const targetValidation = validateProjectNomos('proj-share-target', installed.metadata, {
      userAgoraDir: targetAgoraHomeDir,
      target: 'draft',
    });
    expect(targetValidation.valid).toBe(true);
    expect(targetValidation.pack?.pack_id).toBe('project/proj-share-source');
  });

  it('imports a direct pack root as an external source and installs it into another project', () => {
    const sourceAgoraHomeDir = makeAgoraHomeDir();
    const targetAgoraHomeDir = makeAgoraHomeDir();

    const sourceInstalled = installBuiltInAgoraNomosForProject('proj-pack-source', { userAgoraDir: sourceAgoraHomeDir });
    ensureProjectNomosAuthoringDraft('proj-pack-source', 'Pack Source', {
      userAgoraDir: sourceAgoraHomeDir,
      nomosId: sourceInstalled.profile.pack.id,
    });
    const sourceMetadata = mergeProjectMetadataWithNomosProfile({}, sourceInstalled.profile);
    const exported = exportProjectNomosPack('proj-pack-source', sourceMetadata, {
      userAgoraDir: sourceAgoraHomeDir,
      target: 'draft',
      outputDir: join(sourceAgoraHomeDir, 'direct-pack-root'),
    });

    expect(existsSync(join(exported.output_dir, 'profile.toml'))).toBe(true);

    const imported = importNomosSource({
      userAgoraDir: targetAgoraHomeDir,
      sourceDir: exported.output_dir,
    });

    expect(imported.source_kind).toBe('pack_root');
    expect(imported.manifest_path).toBeNull();
    expect(imported.entry.pack_id).toBe('project/proj-pack-source');
    expect(imported.entry.source_kind).toBe('pack_root');
    expect(imported.entry.source_project_id).toBe('external');

    const targetInstalled = installBuiltInAgoraNomosForProject('proj-pack-target', { userAgoraDir: targetAgoraHomeDir });
    const targetMetadata = mergeProjectMetadataWithNomosProfile({}, targetInstalled.profile);
    const installed = installNomosFromSource('proj-pack-target', targetMetadata, {
      userAgoraDir: targetAgoraHomeDir,
      sourceDir: exported.output_dir,
    });

    expect(installed.imported.source_kind).toBe('pack_root');
    expect(installed.pack.pack_id).toBe('project/proj-pack-source');
    const targetValidation = validateProjectNomos('proj-pack-target', installed.metadata, {
      userAgoraDir: targetAgoraHomeDir,
      target: 'draft',
    });
    expect(targetValidation.valid).toBe(true);
    expect(targetValidation.pack?.pack_id).toBe('project/proj-pack-source');
  });

  it('rejects traversal pack ids when importing a direct pack root', () => {
    const agoraHomeDir = makeAgoraHomeDir();
    const sourceDir = join(agoraHomeDir, 'malicious-pack-root');
    const unsafeDir = join(agoraHomeDir, 'unsafe-target');
    mkdirSync(sourceDir, { recursive: true });
    mkdirSync(unsafeDir, { recursive: true });
    writeFileSync(join(unsafeDir, 'profile.toml'), 'id = "unsafe/profile"\n', 'utf8');
    writeFileSync(join(unsafeDir, 'sentinel.txt'), 'do not remove', 'utf8');
    writeFileSync(join(sourceDir, 'profile.toml'), [
      'id = "../unsafe-target"',
      'name = "Traversal Pack"',
      'version = "0.1.0"',
      'description = "Bad pack"',
      '',
      '[lifecycle]',
      'modules = ["project-bootstrap"]',
      '',
      '[doctor]',
      'checks = ["constitution-present"]',
      '',
    ].join('\n'), 'utf8');

    expect(() => importNomosSource({
      userAgoraDir: agoraHomeDir,
      sourceDir,
    })).toThrowError(/Nomos pack id is invalid/);
    expect(readFileSync(join(unsafeDir, 'sentinel.txt'), 'utf8')).toBe('do not remove');
  });

  it('rejects traversal pack ids when importing a share bundle', () => {
    const agoraHomeDir = makeAgoraHomeDir();
    const sourceDir = join(agoraHomeDir, 'malicious-share-bundle');
    const unsafeDir = join(agoraHomeDir, 'unsafe-bundle-target');
    mkdirSync(sourceDir, { recursive: true });
    mkdirSync(unsafeDir, { recursive: true });
    writeFileSync(join(unsafeDir, 'profile.toml'), 'id = "unsafe/bundle"\n', 'utf8');
    writeFileSync(join(unsafeDir, 'sentinel.txt'), 'do not remove', 'utf8');
    writeFileSync(join(sourceDir, 'nomos-share-bundle.json'), JSON.stringify({
      schema_version: 1,
      bundle_kind: 'nomos_share_bundle',
      exported_at: '2026-03-25T12:00:00.000Z',
      pack: {
        pack_id: '../unsafe-bundle-target',
        name: 'Traversal Bundle',
        version: '0.1.0',
        description: 'Bad bundle',
        lifecycle_modules: ['project-bootstrap'],
        doctor_checks: ['constitution-present'],
        source: 'project_state_draft',
      },
      source: {
        catalog_pack_id: '../unsafe-bundle-target',
        source_project_id: 'external',
        source_target: 'draft',
        source_activation_status: 'active_builtin',
        source_repo_path: null,
        published_by: null,
        published_note: null,
      },
    }, null, 2), 'utf8');

    expect(() => importNomosShareBundle({
      userAgoraDir: agoraHomeDir,
      sourceDir,
    })).toThrowError(/Nomos pack id is invalid/);
    expect(readFileSync(join(unsafeDir, 'sentinel.txt'), 'utf8')).toBe('do not remove');
  });

  it('registers a pack-root source descriptor and syncs it into the local catalog', () => {
    const sourceAgoraHomeDir = makeAgoraHomeDir();
    const targetAgoraHomeDir = makeAgoraHomeDir();

    const sourceInstalled = installBuiltInAgoraNomosForProject('proj-registered-source', { userAgoraDir: sourceAgoraHomeDir });
    ensureProjectNomosAuthoringDraft('proj-registered-source', 'Registered Source', {
      userAgoraDir: sourceAgoraHomeDir,
      nomosId: sourceInstalled.profile.pack.id,
    });
    const sourceMetadata = mergeProjectMetadataWithNomosProfile({}, sourceInstalled.profile);
    const exported = exportProjectNomosPack('proj-registered-source', sourceMetadata, {
      userAgoraDir: sourceAgoraHomeDir,
      target: 'draft',
      outputDir: join(sourceAgoraHomeDir, 'registered-pack-root'),
    });

    const registered = registerNomosSource({
      userAgoraDir: targetAgoraHomeDir,
      sourceId: 'team/registered-source',
      sourceDir: exported.output_dir,
    });
    expect(registered.source_kind).toBe('pack_root');
    expect(inspectRegisteredNomosSource('team/registered-source', { userAgoraDir: targetAgoraHomeDir }).source_dir).toBe(exported.output_dir);

    const synced = syncRegisteredNomosSource({
      userAgoraDir: targetAgoraHomeDir,
      sourceId: 'team/registered-source',
    });
    expect(synced.source.last_sync_status).toBe('ok');
    expect(synced.source.last_catalog_pack_id).toBe('project/proj-registered-source');

    const listed = listRegisteredNomosSources({ userAgoraDir: targetAgoraHomeDir });
    expect(listed.total).toBe(1);
    expect(listed.entries[0]?.source_id).toBe('team/registered-source');
  });

  it('reads authority metadata from a source descriptor and upgrades trusted share-bundle sources', () => {
    const sourceAgoraHomeDir = makeAgoraHomeDir();
    const targetAgoraHomeDir = makeAgoraHomeDir();
    const sharedBundleDir = join(sourceAgoraHomeDir, 'authority-share-bundle');

    const sourceInstalled = installBuiltInAgoraNomosForProject('proj-authority-source', { userAgoraDir: sourceAgoraHomeDir });
    ensureProjectNomosAuthoringDraft('proj-authority-source', 'Authority Source', {
      userAgoraDir: sourceAgoraHomeDir,
      nomosId: sourceInstalled.profile.pack.id,
    });
    const sourceMetadata = mergeProjectMetadataWithNomosProfile({}, sourceInstalled.profile);
    publishProjectNomosPack('proj-authority-source', sourceMetadata, {
      userAgoraDir: sourceAgoraHomeDir,
      target: 'draft',
      publishedBy: 'archon',
      publishedNote: 'authority source',
    });
    exportNomosShareBundle({
      userAgoraDir: sourceAgoraHomeDir,
      packId: 'project/proj-authority-source',
      outputDir: sharedBundleDir,
    });
    writeFileSync(join(sharedBundleDir, 'nomos-source.json'), JSON.stringify({
      schema_version: 1,
      authority_kind: 'first_party',
      authority_id: 'agora-core',
      authority_label: 'Agora Core Registry',
    }, null, 2), 'utf8');

    const registered = registerNomosSource({
      userAgoraDir: targetAgoraHomeDir,
      sourceId: 'team/authority-source',
      sourceDir: sharedBundleDir,
    });
    expect(registered.authority_kind).toBe('first_party');
    expect(registered.authority_id).toBe('agora-core');
    expect(registered.authority_label).toBe('Agora Core Registry');
    expect(registered.authority_descriptor_path).toBe(join(sharedBundleDir, 'nomos-source.json'));

    const synced = syncRegisteredNomosSource({
      userAgoraDir: targetAgoraHomeDir,
      sourceId: 'team/authority-source',
    });
    const trust = assessRegisteredNomosSourceTrust(synced.source);
    expect(trust.authority_kind).toBe('first_party');
    expect(trust.trust_state).toBe('trusted');
    expect(trust.freshness_state).toBe('current');
    expect(trust.activation_eligibility).toBe('allowed');
  });

  it('installs a registered source into a target project draft slot', () => {
    const sourceAgoraHomeDir = makeAgoraHomeDir();
    const targetAgoraHomeDir = makeAgoraHomeDir();

    const sourceInstalled = installBuiltInAgoraNomosForProject('proj-registered-install-source', { userAgoraDir: sourceAgoraHomeDir });
    ensureProjectNomosAuthoringDraft('proj-registered-install-source', 'Registered Install Source', {
      userAgoraDir: sourceAgoraHomeDir,
      nomosId: sourceInstalled.profile.pack.id,
    });
    const sourceMetadata = mergeProjectMetadataWithNomosProfile({}, sourceInstalled.profile);
    const exported = exportProjectNomosPack('proj-registered-install-source', sourceMetadata, {
      userAgoraDir: sourceAgoraHomeDir,
      target: 'draft',
      outputDir: join(sourceAgoraHomeDir, 'registered-install-pack-root'),
    });

    registerNomosSource({
      userAgoraDir: targetAgoraHomeDir,
      sourceId: 'team/registered-install-source',
      sourceDir: exported.output_dir,
    });

    const targetInstalled = installBuiltInAgoraNomosForProject('proj-registered-install-target', { userAgoraDir: targetAgoraHomeDir });
    const targetMetadata = mergeProjectMetadataWithNomosProfile({}, targetInstalled.profile);
    const installed = installNomosFromRegisteredSource('proj-registered-install-target', targetMetadata, {
      userAgoraDir: targetAgoraHomeDir,
      sourceId: 'team/registered-install-source',
    });

    expect(installed.source.source_id).toBe('team/registered-install-source');
    expect(installed.pack.pack_id).toBe('project/proj-registered-install-source');
    const validation = validateProjectNomos('proj-registered-install-target', installed.metadata, {
      userAgoraDir: targetAgoraHomeDir,
      target: 'draft',
    });
    expect(validation.valid).toBe(true);
    expect(validation.pack?.pack_id).toBe('project/proj-registered-install-source');
  });

  it('allows activating an imported registered-source pack as the active nomos', () => {
    const sourceAgoraHomeDir = makeAgoraHomeDir();
    const targetAgoraHomeDir = makeAgoraHomeDir();
    const sharedBundleDir = join(sourceAgoraHomeDir, 'registered-activate-share-bundle');

    const sourceInstalled = installBuiltInAgoraNomosForProject('proj-registered-activate-source', { userAgoraDir: sourceAgoraHomeDir });
    ensureProjectNomosAuthoringDraft('proj-registered-activate-source', 'Registered Activate Source', {
      userAgoraDir: sourceAgoraHomeDir,
      nomosId: sourceInstalled.profile.pack.id,
    });
    const sourceMetadata = mergeProjectMetadataWithNomosProfile({}, sourceInstalled.profile);
    publishProjectNomosPack('proj-registered-activate-source', sourceMetadata, {
      userAgoraDir: sourceAgoraHomeDir,
      target: 'draft',
      publishedBy: 'archon',
      publishedNote: 'registered activation source',
    });
    const exported = exportNomosShareBundle({
      userAgoraDir: sourceAgoraHomeDir,
      packId: 'project/proj-registered-activate-source',
      outputDir: sharedBundleDir,
    });

    registerNomosSource({
      userAgoraDir: targetAgoraHomeDir,
      sourceId: 'team/registered-activate-source',
      sourceDir: exported.output_dir,
    });

    const targetInstalled = installBuiltInAgoraNomosForProject('proj-registered-activate-target', { userAgoraDir: targetAgoraHomeDir });
    const targetMetadata = mergeProjectMetadataWithNomosProfile({}, targetInstalled.profile);
    const installed = installNomosFromRegisteredSource('proj-registered-activate-target', targetMetadata, {
      userAgoraDir: targetAgoraHomeDir,
      sourceId: 'team/registered-activate-source',
    });

    expect(() => activateProjectNomosDraft('proj-registered-activate-target', {
      userAgoraDir: targetAgoraHomeDir,
      metadata: installed.metadata,
      actor: 'archon',
    })).toThrowError(/human review is required/i);

    const activated = activateProjectNomosDraft('proj-registered-activate-target', {
      userAgoraDir: targetAgoraHomeDir,
      metadata: installed.metadata,
      actor: 'archon',
      allowReviewRequired: true,
    });

    expect(activated.nomos_id).toBe('project/proj-registered-activate-source');
    expect(activated.activation_status).toBe('active_project');

    const activeValidation = validateProjectNomos('proj-registered-activate-target', activated.metadata, {
      userAgoraDir: targetAgoraHomeDir,
      target: 'active',
    });
    expect(activeValidation.valid).toBe(true);
    expect(activeValidation.pack?.pack_id).toBe('project/proj-registered-activate-source');
    expect(activeValidation.provenance).toMatchObject({
      kind: 'registered_source',
      source_id: 'team/registered-activate-source',
      source_kind: 'share_bundle',
      trust_state: 'caution',
      activation_eligibility: 'review_required',
    });
  });

  it('assesses trust and activation posture for published catalog entries', () => {
    const trusted = assessPublishedNomosCatalogEntryTrust({
      schema_version: 1,
      pack_id: 'project/proj-trusted',
      published_at: '2026-03-26T00:00:00.000Z',
      source_kind: 'project_publish',
      published_by: 'archon',
      published_note: 'baseline',
      source_project_id: 'proj-trusted',
      source_target: 'draft',
      source_activation_status: 'active_project',
      source_repo_path: '/repo/proj-trusted',
      published_root: '/catalog/project/proj-trusted',
      manifest_path: '/catalog/project/proj-trusted/catalog-entry.json',
      pack: {
        pack_id: 'project/proj-trusted',
        name: 'Trusted',
        version: '0.1.0',
        description: 'trusted',
        lifecycle_modules: ['project-bootstrap'],
        doctor_checks: ['constitution-present'],
        source: 'project_state_draft',
        root: '/catalog/project/proj-trusted',
        profile_path: '/catalog/project/proj-trusted/profile.toml',
      },
    });
    const untrusted = assessPublishedNomosCatalogEntryTrust({
      schema_version: 1,
      pack_id: 'project/proj-untrusted',
      published_at: '2026-03-26T00:00:00.000Z',
      source_kind: 'pack_root',
      published_by: null,
      published_note: null,
      source_project_id: 'external',
      source_target: 'draft',
      source_activation_status: 'active_builtin',
      source_repo_path: null,
      published_root: '/catalog/project/proj-untrusted',
      manifest_path: '/catalog/project/proj-untrusted/catalog-entry.json',
      pack: {
        pack_id: 'project/proj-untrusted',
        name: 'Untrusted',
        version: '0.1.0',
        description: 'untrusted',
        lifecycle_modules: ['project-bootstrap'],
        doctor_checks: ['constitution-present'],
        source: 'project_state_draft',
        root: '/catalog/project/proj-untrusted',
        profile_path: '/catalog/project/proj-untrusted/profile.toml',
      },
    });

    expect(trusted.trust_state).toBe('trusted');
    expect(trusted.activation_eligibility).toBe('allowed');
    expect(untrusted.trust_state).toBe('untrusted');
    expect(untrusted.activation_eligibility).toBe('blocked');
  });

  it('assesses trust and freshness for registered sources', () => {
    const caution = assessRegisteredNomosSourceTrust({
      schema_version: 1,
      source_id: 'team/git-source',
      source_kind: 'git_working_copy',
      source_dir: '/repo/git-source',
      authority_kind: 'manual_local',
      authority_id: null,
      authority_label: null,
      authority_descriptor_path: null,
      registered_at: '2026-03-26T00:00:00.000Z',
      last_synced_at: null,
      last_sync_status: 'never',
      last_sync_error: null,
      last_catalog_pack_id: null,
      last_imported_source_kind: null,
      last_manifest_path: null,
      entry_path: '/registry/team/git-source/source-entry.json',
    });
    const stale = assessRegisteredNomosSourceTrust({
      schema_version: 1,
      source_id: 'team/pack-root',
      source_kind: 'pack_root',
      source_dir: '/tmp/pack-root',
      authority_kind: 'manual_local',
      authority_id: null,
      authority_label: null,
      authority_descriptor_path: null,
      registered_at: '2026-03-26T00:00:00.000Z',
      last_synced_at: '2026-03-26T01:00:00.000Z',
      last_sync_status: 'error',
      last_sync_error: 'network failed',
      last_catalog_pack_id: 'project/proj-pack-root',
      last_imported_source_kind: 'pack_root',
      last_manifest_path: '/catalog/project/proj-pack-root/catalog-entry.json',
      entry_path: '/registry/team/pack-root/source-entry.json',
    });

    expect(caution.trust_state).toBe('caution');
    expect(caution.freshness_state).toBe('unknown');
    expect(caution.activation_eligibility).toBe('review_required');
    expect(stale.freshness_state).toBe('stale');
    expect(stale.activation_eligibility).toBe('blocked');

    const aged = assessRegisteredNomosSourceTrust({
      schema_version: 1,
      source_id: 'team/share-aged',
      source_kind: 'share_bundle',
      source_dir: '/tmp/share-aged',
      authority_kind: 'manual_local',
      authority_id: null,
      authority_label: null,
      authority_descriptor_path: null,
      registered_at: '2026-03-26T00:00:00.000Z',
      last_synced_at: '2026-03-01T00:00:00.000Z',
      last_sync_status: 'ok',
      last_sync_error: null,
      last_catalog_pack_id: 'project/proj-share-aged',
      last_imported_source_kind: 'share_bundle',
      last_manifest_path: '/catalog/project/proj-share-aged/catalog-entry.json',
      entry_path: '/registry/team/share-aged/source-entry.json',
    });
    expect(aged.trust_state).toBe('caution');
    expect(aged.freshness_state).toBe('stale');
    expect(aged.activation_eligibility).toBe('blocked');
    expect(aged.reasons).toContain('last successful sync is older than the freshness threshold');
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

  it('wraps malformed frontmatter json with a domain-specific error', () => {
    const specPath = join(makeAgoraHomeDir(), 'bad-spec.md');
    writeFileSync(specPath, [
      '---',
      'project_id: "proj-error"',
      'project_name: "Error Project"',
      'base_nomos_id: "agora/default"',
      'project_shape: "existing_repo"',
      'repo_path: null',
      'purpose: "bad json"',
      'lifecycle_modules: ["project-bootstrap"',
      'doctor_checks: ["constitution-present"]',
      'methodology_keep: ["planning trio"]',
      'methodology_change: []',
      'open_questions: []',
      '---',
    ].join('\n'), 'utf8');

    expect(() => parseProjectNomosAuthoringSpec(specPath)).toThrowError(/invalid value for lifecycle_modules/i);
  });

  it('refuses to recursively replace an arbitrary non-pack output directory', () => {
    const agoraHomeDir = makeAgoraHomeDir();
    const templateRoot = join(agoraHomeDir, 'template');
    mkdirSync(join(templateRoot, 'docs', 'reference'), { recursive: true });
    mkdirSync(join(templateRoot, 'prompts', 'bootstrap'), { recursive: true });
    writeFileSync(join(templateRoot, 'README.md'), '# Template\n', 'utf8');
    writeFileSync(join(templateRoot, 'docs', 'reference', 'methodologies.md'), 'template methods\n', 'utf8');
    writeFileSync(join(templateRoot, 'prompts', 'bootstrap', 'interview.md'), 'template interview\n', 'utf8');

    const unsafeOutputDir = join(agoraHomeDir, 'unsafe-existing');
    mkdirSync(unsafeOutputDir, { recursive: true });
    writeFileSync(join(unsafeOutputDir, 'random.txt'), 'keep me', 'utf8');

    expect(() => scaffoldNomosPack({
      outputDir: unsafeOutputDir,
      templateDir: templateRoot,
      id: 'acme/web',
      name: 'Acme Web Nomos',
      description: 'Custom Nomos for Acme web delivery.',
      replaceExisting: true,
    })).toThrowError(/Refusing to remove path outside allowed scope/i);
  });

  it('wraps git init failures with path-aware domain context', () => {
    const agoraHomeDir = makeAgoraHomeDir();
    const previousPath = process.env.PATH;
    try {
      process.env.PATH = '';
      expect(() => installBuiltInAgoraNomosForProject('proj-git-fail', {
        userAgoraDir: agoraHomeDir,
      })).toThrowError(/Failed to initialize git repository at .*proj-git-fail/i);
    } finally {
      process.env.PATH = previousPath;
    }
  });

  it('normalizes supported nomos ids through a shared helper', () => {
    expect(requireSupportedNomosId(undefined)).toBe(DEFAULT_AGORA_NOMOS_ID);
    expect(() => requireSupportedNomosId('custom/pack')).toThrowError(/Unsupported nomos_id/);
  });
});
