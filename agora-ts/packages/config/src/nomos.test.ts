import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BUILT_IN_AGORA_NOMOS_PACK,
  DEFAULT_AGORA_NOMOS_ID,
  DEFAULT_CUSTOM_NOMOS_PACK_DOCTOR_CHECKS,
  DEFAULT_CUSTOM_NOMOS_PACK_LIFECYCLE_MODULES,
  NOMOS_PROJECT_STATE_DIRECTORIES,
  NOMOS_PROJECT_STATE_ROOT_TEMPLATE,
  REPO_AGENTS_SHIM_SECTION_ORDER,
  buildBuiltInAgoraNomosProjectProfile,
  exportProjectNomosPack,
  exportNomosShareBundle,
  ensureAgoraProjectStateLayout,
  ensureProjectNomosAuthoringDraft,
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
  requireSupportedNomosId,
  refineProjectNomosDraftFromSpec,
  validateProjectNomos,
  diffProjectNomos,
  diagnoseProjectNomosDrift,
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
          activation_status: 'active_builtin',
        },
      },
    });
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
