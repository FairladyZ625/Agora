import * as childProcess from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { parseSimpleToml, parseStructuredFrontmatter, tomlString, tomlStringArray } from './nomos-serialization.js';
import { resolveUserAgoraDir, type EnsureBundledAgoraAssetsOptions } from './runtime-assets.js';

export const REPO_AGENTS_SHIM_SECTION_ORDER = [
  'general_constitution',
  'pack_index',
  'bootstrap_method',
  'fill_policy',
] as const satisfies readonly string[];

export const repoAgentsShimSectionSchema = z.enum(REPO_AGENTS_SHIM_SECTION_ORDER);
export type RepoAgentsShimSection = z.infer<typeof repoAgentsShimSectionSchema>;

export const NOMOS_PROJECT_STATE_ROOT_TEMPLATE = '~/.agora/projects/<project-id>';

export const NOMOS_PROJECT_STATE_DIRECTORIES = [
  'constitution',
  'docs/architecture',
  'docs/planning',
  'docs/walkthrough',
  'docs/qa',
  'docs/security',
  'docs/reference',
  'lifecycle',
  'nomos',
  'brain',
  'tasks',
  'archive',
  'prompts/bootstrap',
  'prompts/closeout',
  'prompts/doctor',
  'scripts',
  'skills',
] as const satisfies readonly string[];

export const NOMOS_LIFECYCLE_MODULES = [
  'project-bootstrap',
  'task-context-delivery',
  'task-closeout',
  'project-archive',
  'governance-doctor',
] as const satisfies readonly string[];

export const nomosLifecycleModuleSchema = z.enum(NOMOS_LIFECYCLE_MODULES);
export type NomosLifecycleModule = z.infer<typeof nomosLifecycleModuleSchema>;

export const nomosProjectProfileSchema = z.object({
  schema_version: z.literal(1),
  project: z.object({
    id: z.string().min(1),
    state_root: z.string().min(1),
  }),
  pack: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    version: z.string().min(1),
    description: z.string().min(1),
    source: z.string().min(1),
    install_mode: z.literal('copy_on_install'),
  }),
  repository_shim: z.object({
    entry: z.literal('AGENTS.md'),
    required_sections: z.array(repoAgentsShimSectionSchema).min(REPO_AGENTS_SHIM_SECTION_ORDER.length),
  }),
  project_state: z.object({
    root_template: z.literal(NOMOS_PROJECT_STATE_ROOT_TEMPLATE),
    directories: z.array(z.string().min(1)).min(NOMOS_PROJECT_STATE_DIRECTORIES.length),
    versioning: z.object({
      mode: z.literal('git'),
      auto_init: z.boolean(),
    }),
  }),
  bootstrap: z.object({
    methodology_mode: z.literal('layered'),
    shim_fields_only: z.boolean(),
    prompts_dir: z.literal('prompts/bootstrap'),
  }),
  constitution: z.object({
    entry: z.string().min(1),
  }),
  docs: z.object({
    root: z.literal('docs'),
    skeleton: z.object({
      create_if_missing: z.array(z.string().min(1)).min(6),
    }),
  }),
  lifecycle: z.object({
    modules: z.array(nomosLifecycleModuleSchema).min(1),
  }),
  doctor: z.object({
    checks: z.array(z.string().min(1)).min(1),
  }),
  provenance: z.object({
    pack_source: z.string().min(1),
    docs_repo_remote: z.string().min(1).optional(),
  }),
});

export type NomosProjectProfile = z.infer<typeof nomosProjectProfileSchema>;

export type ResolveAgoraProjectStateOptions = Pick<EnsureBundledAgoraAssetsOptions, 'userAgoraDir'>;

export interface AgoraProjectStateLayout {
  userAgoraDir: string;
  projectsRoot: string;
  projectId: string;
  root: string;
  profilePath: string;
  constitutionDir: string;
  docsRoot: string;
  docsArchitectureDir: string;
  docsPlanningDir: string;
  docsWalkthroughDir: string;
  docsQaDir: string;
  docsSecurityDir: string;
  docsReferenceDir: string;
  lifecycleDir: string;
  brainDir: string;
  tasksDir: string;
  archiveDir: string;
  promptsDir: string;
  bootstrapPromptsDir: string;
  bootstrapInterviewPromptPath: string;
  bootstrapExistingProjectPromptPath: string;
  bootstrapNewProjectPromptPath: string;
  bootstrapNoRepoPromptPath: string;
  closeoutPromptsDir: string;
  doctorPromptsDir: string;
  closeoutReviewPromptPath: string;
  constitutionEntryPath: string;
  docsReferenceIndexPath: string;
  docsReferenceMethodologiesPath: string;
  docsReferenceCurrentSurfacePath: string;
  docsReferenceProjectNomosSpecPath: string;
  docsReferenceGovernancePath: string;
  docsReferenceLifecyclePath: string;
  docsReferenceBootstrapFieldsPath: string;
  docsArchitectureOperatingModelPath: string;
  scriptsDir: string;
  skillsDir: string;
  nomosDir: string;
  projectNomosDraftDir: string;
  projectNomosDraftProfilePath: string;
  lifecycleProjectBootstrapPath: string;
  lifecycleTaskContextDeliveryPath: string;
  lifecycleTaskCloseoutPath: string;
  lifecycleProjectArchivePath: string;
  lifecycleGovernanceDoctorPath: string;
  doctorProjectPromptPath: string;
  allDirectories: string[];
}

export interface EnsureAgoraProjectStateLayoutOptions extends ResolveAgoraProjectStateOptions {
  profile?: NomosProjectProfile;
  writeProfile?: boolean;
}

export interface RenderRepoAgentsShimOptions {
  profile: NomosProjectProfile;
}

export interface InstallBuiltInAgoraNomosOptions extends ResolveAgoraProjectStateOptions {
  repoPath?: string | null;
  initializeRepo?: boolean;
  forceWriteRepoShim?: boolean;
  initializeProjectStateGit?: boolean;
}

export interface PrepareProjectNomosInstallOptions extends ResolveAgoraProjectStateOptions {
  projectId: string;
  projectName: string;
  projectOwner?: string | null | undefined;
  metadata?: Record<string, unknown> | null | undefined;
  repoPath?: string | null | undefined;
  initializeRepo?: boolean;
  forceWriteRepoShim?: boolean;
}

export interface PreparedProjectNomosInstallResult {
  installedNomos: InstalledBuiltInAgoraNomosResult;
  authoringDraft: ProjectNomosAuthoringDraftResult;
  persistedMetadata: Record<string, unknown>;
  runtimePaths: ProjectNomosRuntimePaths;
  nomosState: ResolvedProjectNomosState;
  effectiveRuntimePaths: ProjectNomosRuntimePaths;
  effectiveNomosState: ResolvedProjectNomosState;
  bootstrapMode: 'existing_repo' | 'new_repo' | 'no_repo';
}

export interface InstalledBuiltInAgoraNomosResult {
  profile: NomosProjectProfile;
  layout: AgoraProjectStateLayout;
  repoRoot: string | null;
  repoShimPath: string | null;
  repoExistedBeforeInstall: boolean;
  repoShimWritten: boolean;
  repoGitInitialized: boolean;
  projectStateGitInitialized: boolean;
}

export interface ScaffoldNomosPackOptions {
  outputDir: string;
  templateDir: string;
  id: string;
  name: string;
  description: string;
  version?: string;
  lifecycleModules?: readonly NomosLifecycleModule[];
  doctorChecks?: readonly string[];
  replaceExisting?: boolean;
}

export interface ScaffoldNomosPackResult {
  outputDir: string;
  profilePath: string;
  constitutionPath: string;
  readmePath: string;
}

export interface ExportProjectNomosPackOptions extends ResolveAgoraProjectStateOptions {
  target?: 'draft' | 'active';
  outputDir: string;
  replaceExisting?: boolean;
}

export interface ExportProjectNomosPackResult {
  project_id: string;
  target: 'draft' | 'active';
  output_dir: string;
  pack: ProjectNomosPackSummary | null;
}

export interface InstallLocalNomosPackToProjectOptions extends ResolveAgoraProjectStateOptions {
  packDir: string;
  metadata?: Record<string, unknown> | null | undefined;
  replaceExisting?: boolean;
}

export interface InstallLocalNomosPackToProjectResult {
  project_id: string;
  pack: ProjectNomosPackSummary;
  installed_root: string;
  installed_profile_path: string;
  metadata: Record<string, unknown>;
}

export interface AgoraNomosCatalogLayout {
  userAgoraDir: string;
  root: string;
  packsRoot: string;
}

export interface PublishedNomosCatalogEntry {
  schema_version: 1;
  pack_id: string;
  published_at: string;
  source_kind: 'project_publish' | 'share_bundle' | 'pack_root';
  published_by: string | null;
  published_note: string | null;
  source_project_id: string;
  source_target: 'draft' | 'active';
  source_activation_status: ProjectNomosActivationStatus;
  source_repo_path: string | null;
  published_root: string;
  manifest_path: string;
  pack: ProjectNomosPackSummary;
}

export interface PublishProjectNomosPackOptions extends ResolveAgoraProjectStateOptions {
  target?: 'draft' | 'active';
  packId?: string | null;
  publishedAt?: string;
  publishedBy?: string | null;
  publishedNote?: string | null;
  replaceExisting?: boolean;
}

export interface PublishedNomosCatalogSummary {
  pack_id: string;
  name: string;
  version: string;
  description: string;
  published_at: string;
  source_kind: 'project_publish' | 'share_bundle' | 'pack_root';
  published_by: string | null;
  source_project_id: string;
  source_target: 'draft' | 'active';
  source_repo_path: string | null;
}

export interface PublishProjectNomosPackResult {
  project_id: string;
  target: 'draft' | 'active';
  catalog_root: string;
  catalog_pack_root: string;
  manifest_path: string;
  entry: PublishedNomosCatalogEntry;
}

export interface ListPublishedNomosCatalogOptions extends ResolveAgoraProjectStateOptions {
  includeInvalid?: boolean;
}

export interface ListPublishedNomosCatalogResult {
  catalog_root: string;
  total: number;
  summaries: PublishedNomosCatalogSummary[];
  entries: PublishedNomosCatalogEntry[];
}

export interface InstallCatalogNomosPackToProjectOptions extends ResolveAgoraProjectStateOptions {
  packId: string;
  metadata?: Record<string, unknown> | null | undefined;
  replaceExisting?: boolean;
}

export interface InstallCatalogNomosPackToProjectResult extends InstallLocalNomosPackToProjectResult {
  catalog_entry: PublishedNomosCatalogEntry;
}

export interface NomosShareBundleManifest {
  schema_version: 1;
  bundle_kind: 'nomos_share_bundle';
  exported_at: string;
  pack: {
    pack_id: string;
    name: string;
    version: string;
    description: string;
    lifecycle_modules: string[];
    doctor_checks: string[];
    source: string;
  };
  source: {
    catalog_pack_id: string;
    source_project_id: string;
    source_target: 'draft' | 'active';
    source_activation_status: ProjectNomosActivationStatus;
    source_repo_path: string | null;
    published_by: string | null;
    published_note: string | null;
  };
}

export interface ExportNomosShareBundleOptions extends ResolveAgoraProjectStateOptions {
  packId: string;
  outputDir: string;
  replaceExisting?: boolean;
  exportedAt?: string;
}

export interface ExportNomosShareBundleResult {
  pack_id: string;
  output_dir: string;
  manifest_path: string;
  manifest: NomosShareBundleManifest;
}

export interface ImportNomosShareBundleOptions extends ResolveAgoraProjectStateOptions {
  sourceDir: string;
  replaceExisting?: boolean;
}

export interface ImportNomosShareBundleResult {
  source_dir: string;
  manifest_path: string;
  entry: PublishedNomosCatalogEntry;
}

export interface ImportNomosSourceOptions extends ResolveAgoraProjectStateOptions {
  sourceDir: string;
  replaceExisting?: boolean;
  importedAt?: string;
}

export interface ImportNomosSourceResult {
  source_dir: string;
  source_kind: 'share_bundle' | 'pack_root';
  manifest_path: string | null;
  entry: PublishedNomosCatalogEntry;
}

export interface InstallNomosFromSourceOptions extends ResolveAgoraProjectStateOptions {
  sourceDir: string;
  metadata?: Record<string, unknown> | null | undefined;
  replaceExisting?: boolean;
}

export interface InstallNomosFromSourceResult extends InstallCatalogNomosPackToProjectResult {
  imported: ImportNomosSourceResult;
}

export interface EnsureProjectNomosAuthoringDraftOptions extends ResolveAgoraProjectStateOptions {
  repoPath?: string | null;
  nomosId?: string | null;
}

export interface ProjectNomosAuthoringDraftResult {
  specPath: string;
  draftDir: string;
  draftProfilePath: string | null;
  scaffolded: boolean;
}

export interface ProjectNomosAuthoringSpec {
  project_id: string;
  project_name: string;
  base_nomos_id: string;
  project_shape: 'existing_repo' | 'new_repo' | 'no_repo';
  repo_path: string | null;
  purpose: string;
  lifecycle_modules: NomosLifecycleModule[];
  doctor_checks: string[];
  methodology_keep: string[];
  methodology_change: string[];
  open_questions: string[];
}

export interface RefineProjectNomosDraftResult {
  spec: ProjectNomosAuthoringSpec;
  draftDir: string;
  draftProfilePath: string;
}

export const PROJECT_NOMOS_ACTIVATION_STATUSES = [
  'active_builtin',
  'active_project',
] as const;

export const projectNomosActivationStatusSchema = z.enum(PROJECT_NOMOS_ACTIVATION_STATUSES);
export type ProjectNomosActivationStatus = z.infer<typeof projectNomosActivationStatusSchema>;

export interface ProjectNomosPackSummary {
  pack_id: string;
  name: string;
  version: string;
  description: string;
  lifecycle_modules: string[];
  doctor_checks: string[];
  source: string;
  root: string;
  profile_path: string;
}

export interface ProjectNomosReviewResult {
  project_id: string;
  activation_status: ProjectNomosActivationStatus;
  can_activate: boolean;
  issues: string[];
  active: ProjectNomosPackSummary;
  draft: ProjectNomosPackSummary | null;
}

export interface ActivateProjectNomosDraftOptions extends ResolveAgoraProjectStateOptions {
  metadata?: Record<string, unknown> | null | undefined;
  actor: string;
  activatedAt?: string;
}

export interface ActivateProjectNomosDraftResult {
  project_id: string;
  nomos_id: string;
  activation_status: Extract<ProjectNomosActivationStatus, 'active_project'>;
  active_root: string;
  active_profile_path: string;
  activated_at: string;
  activated_by: string;
  metadata: Record<string, unknown>;
}

export interface ResolvedProjectNomosState {
  project_id: string;
  nomos_id: string;
  activation_status: ProjectNomosActivationStatus;
  project_state_root: string;
  profile_path: string;
  profile_installed: boolean;
  repo_path: string | null;
  repo_shim_installed: boolean;
  bootstrap_prompts_dir: string;
  lifecycle_modules: string[];
  draft_root: string;
  draft_profile_path: string;
  draft_profile_installed: boolean;
  active_root: string;
  active_profile_path: string;
  active_profile_installed: boolean;
}

export type ProjectNomosValidationTarget = 'draft' | 'active';

export interface ProjectNomosValidationIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  path?: string;
}

export interface ProjectNomosValidationResult {
  project_id: string;
  target: ProjectNomosValidationTarget;
  valid: boolean;
  activation_status: ProjectNomosActivationStatus;
  pack: ProjectNomosPackSummary | null;
  issues: ProjectNomosValidationIssue[];
}

export interface ProjectNomosDiffEntry {
  field: string;
  from: unknown;
  to: unknown;
}

export interface ProjectNomosDiffResult {
  project_id: string;
  base: 'builtin' | 'active';
  candidate: 'draft' | 'active';
  changed: boolean;
  base_pack: ProjectNomosPackSummary | null;
  candidate_pack: ProjectNomosPackSummary | null;
  differences: ProjectNomosDiffEntry[];
}

export type ProjectNomosDriftRiskLevel = 'none' | 'low' | 'medium' | 'high';

export interface ProjectNomosDriftReport {
  project_id: string;
  activation_status: ProjectNomosActivationStatus;
  risk_level: ProjectNomosDriftRiskLevel;
  activation_blockers: number;
  structural_warnings: number;
  semantic_changes: number;
  changed_fields: string[];
  added_lifecycle_modules: string[];
  removed_lifecycle_modules: string[];
  added_doctor_checks: string[];
  removed_doctor_checks: string[];
}

export interface ProjectNomosRuntimePaths {
  nomos_root: string;
  lifecycle_root: string;
  bootstrap_prompts_dir: string;
  bootstrap_interview_prompt_path: string;
  closeout_review_prompt_path: string;
  doctor_project_prompt_path: string;
}

const REPO_AGENTS_SHIM_SECTION_TITLES: Record<RepoAgentsShimSection, string> = {
  general_constitution: 'General Constitution',
  pack_index: 'Pack Index',
  bootstrap_method: 'Bootstrap Method',
  fill_policy: 'Fill Policy',
};

export const BUILT_IN_AGORA_NOMOS_PACK = {
  id: 'agora/default',
  name: 'Agora Default Nomos',
  version: '0.1.0',
  description: 'Built-in Nomos derived from the Agora dogfooding harness.',
  source: 'builtin:agora-default',
} as const;

export const DEFAULT_AGORA_NOMOS_ID = BUILT_IN_AGORA_NOMOS_PACK.id;

export function requireSupportedNomosId(raw: string | undefined): string {
  const nomosId = raw?.trim() || DEFAULT_AGORA_NOMOS_ID;
  if (nomosId !== DEFAULT_AGORA_NOMOS_ID) {
    throw new Error(`Unsupported nomos_id: ${nomosId}`);
  }
  return nomosId;
}

export const DEFAULT_CUSTOM_NOMOS_PACK_LIFECYCLE_MODULES = [
  'project-bootstrap',
  'task-context-delivery',
  'task-closeout',
] as const satisfies readonly NomosLifecycleModule[];

export const DEFAULT_CUSTOM_NOMOS_PACK_DOCTOR_CHECKS = [
  'constitution-present',
  'docs-skeleton-complete',
  'bootstrap-prompts-present',
] as const;

export const BUILT_IN_AGORA_NOMOS_REFERENCE_DOCS = [
  'current-surface.md',
  'methodologies.md',
  'governance.md',
  'lifecycle.md',
  'bootstrap-fields.md',
] as const satisfies readonly string[];

export const BUILT_IN_AGORA_NOMOS_ARCHITECTURE_DOCS = [
  'operating-model.md',
] as const satisfies readonly string[];

export const BUILT_IN_AGORA_NOMOS_LIFECYCLE_DOCS = [
  'project-bootstrap.md',
  'task-context-delivery.md',
  'task-closeout.md',
  'project-archive.md',
  'governance-doctor.md',
] as const satisfies readonly string[];

export const BUILT_IN_AGORA_NOMOS_BOOTSTRAP_PROMPTS = [
  'interview.md',
  'existing-project.md',
  'new-project.md',
  'no-repo.md',
] as const satisfies readonly string[];

export const BUILT_IN_AGORA_NOMOS_CLOSEOUT_PROMPTS = [
  'review.md',
] as const satisfies readonly string[];

export const BUILT_IN_AGORA_NOMOS_DOCTOR_PROMPTS = [
  'project.md',
] as const satisfies readonly string[];

export function buildBuiltInAgoraNomosSeededAssets() {
  return {
    constitution: ['constitution.md'],
    docs: {
      reference: [...BUILT_IN_AGORA_NOMOS_REFERENCE_DOCS],
      architecture: [...BUILT_IN_AGORA_NOMOS_ARCHITECTURE_DOCS],
    },
    lifecycle: [...BUILT_IN_AGORA_NOMOS_LIFECYCLE_DOCS],
    prompts: {
      bootstrap: [...BUILT_IN_AGORA_NOMOS_BOOTSTRAP_PROMPTS],
      closeout: [...BUILT_IN_AGORA_NOMOS_CLOSEOUT_PROMPTS],
      doctor: [...BUILT_IN_AGORA_NOMOS_DOCTOR_PROMPTS],
    },
  };
}

export function resolveInstalledCreateNomosPackTemplateDir(options: ResolveAgoraProjectStateOptions = {}) {
  return resolve(resolveUserAgoraDir(options), 'skills', 'create-nomos', 'assets', 'pack-template');
}

export function resolveBundledCreateNomosPackTemplateDir() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '../../../../.skills/create-nomos/assets/pack-template');
}

function resolveAvailableCreateNomosPackTemplateDir(options: ResolveAgoraProjectStateOptions = {}) {
  const installedTemplateDir = resolveInstalledCreateNomosPackTemplateDir(options);
  if (existsSync(installedTemplateDir)) {
    return installedTemplateDir;
  }
  const bundledTemplateDir = resolveBundledCreateNomosPackTemplateDir();
  if (existsSync(bundledTemplateDir)) {
    return bundledTemplateDir;
  }
  return installedTemplateDir;
}

export function ensureProjectNomosAuthoringDraft(
  projectId: string,
  projectName: string,
  options: EnsureProjectNomosAuthoringDraftOptions = {},
): ProjectNomosAuthoringDraftResult {
  const layout = ensureAgoraProjectStateLayout(projectId, options);
  writeFileIfMissing(layout.docsReferenceProjectNomosSpecPath, renderProjectNomosAuthoringSpec({
    projectId,
    projectName,
    ...(options.repoPath !== undefined ? { repoPath: options.repoPath } : {}),
    ...(options.nomosId !== undefined ? { nomosId: options.nomosId } : {}),
  }));

  const templateDir = resolveAvailableCreateNomosPackTemplateDir(options);
  if (!existsSync(templateDir)) {
    return {
      specPath: layout.docsReferenceProjectNomosSpecPath,
      draftDir: layout.projectNomosDraftDir,
      draftProfilePath: null,
      scaffolded: false,
    };
  }

  if (existsSync(layout.projectNomosDraftProfilePath)) {
    return {
      specPath: layout.docsReferenceProjectNomosSpecPath,
      draftDir: layout.projectNomosDraftDir,
      draftProfilePath: layout.projectNomosDraftProfilePath,
      scaffolded: false,
    };
  }

  const scaffolded = scaffoldNomosPack({
    outputDir: layout.projectNomosDraftDir,
    templateDir,
    id: `project/${projectId}`,
    name: `${projectName} Nomos`,
    description: `Project-specific Nomos draft for ${projectName}.`,
  });

  return {
    specPath: layout.docsReferenceProjectNomosSpecPath,
    draftDir: layout.projectNomosDraftDir,
    draftProfilePath: scaffolded.profilePath,
    scaffolded: true,
  };
}

export function parseProjectNomosAuthoringSpec(path: string): ProjectNomosAuthoringSpec {
  const raw = readFileSync(path, 'utf8');
  const frontmatter = parseStructuredFrontmatter(raw);
  const defaultShape = frontmatter.repo_path ? 'existing_repo' : 'no_repo';

  return {
    project_id: asRequiredString(frontmatter.project_id, 'project_id'),
    project_name: asRequiredString(frontmatter.project_name, 'project_name'),
    base_nomos_id: asOptionalString(frontmatter.base_nomos_id) ?? DEFAULT_AGORA_NOMOS_ID,
    project_shape: asProjectShape(frontmatter.project_shape ?? defaultShape),
    repo_path: asOptionalString(frontmatter.repo_path) ?? null,
    purpose: asOptionalString(frontmatter.purpose) ?? '',
    lifecycle_modules: asLifecycleModules(frontmatter.lifecycle_modules),
    doctor_checks: asStringArray(frontmatter.doctor_checks, DEFAULT_CUSTOM_NOMOS_PACK_DOCTOR_CHECKS),
    methodology_keep: asStringArray(frontmatter.methodology_keep),
    methodology_change: asStringArray(frontmatter.methodology_change),
    open_questions: asStringArray(frontmatter.open_questions),
  };
}

export function refineProjectNomosDraftFromSpec(
  projectId: string,
  options: ResolveAgoraProjectStateOptions = {},
): RefineProjectNomosDraftResult {
  const layout = resolveAgoraProjectStateLayout(projectId, options);
  const spec = parseProjectNomosAuthoringSpec(layout.docsReferenceProjectNomosSpecPath);
  const templateDir = resolveAvailableCreateNomosPackTemplateDir(options);
  if (!existsSync(templateDir)) {
    throw new Error(`Nomos pack template not found: ${templateDir}`);
  }

  const scaffolded = scaffoldNomosPack({
    outputDir: layout.projectNomosDraftDir,
    templateDir,
    id: `project/${projectId}`,
    name: `${spec.project_name} Nomos`,
    description: spec.purpose.trim() || `Project-specific Nomos draft for ${spec.project_name}.`,
    lifecycleModules: spec.lifecycle_modules,
    doctorChecks: spec.doctor_checks,
    replaceExisting: true,
  });

  writeFileSync(
    resolve(layout.projectNomosDraftDir, 'docs', 'reference', 'methodologies.md'),
    renderRefinedProjectNomosMethodologies(spec),
    'utf8',
  );
  writeFileSync(
    resolve(layout.projectNomosDraftDir, 'prompts', 'bootstrap', 'interview.md'),
    renderRefinedProjectNomosBootstrapInterview(spec),
    'utf8',
  );

  return {
    spec,
    draftDir: layout.projectNomosDraftDir,
    draftProfilePath: scaffolded.profilePath,
  };
}

export function resolveAgoraProjectsDir(options: ResolveAgoraProjectStateOptions = {}) {
  return resolve(resolveUserAgoraDir(options), 'projects');
}

export function resolveAgoraNomosCatalogLayout(options: ResolveAgoraProjectStateOptions = {}): AgoraNomosCatalogLayout {
  const userAgoraDir = resolveUserAgoraDir(options);
  const root = resolve(userAgoraDir, 'nomos', 'catalog');
  return {
    userAgoraDir,
    root,
    packsRoot: resolve(root, 'packs'),
  };
}

export function resolveAgoraProjectStateLayout(
  projectId: string,
  options: ResolveAgoraProjectStateOptions = {},
): AgoraProjectStateLayout {
  const userAgoraDir = resolveUserAgoraDir(options);
  const projectsRoot = resolveAgoraProjectsDir(options);
  const root = resolve(projectsRoot, projectId);
  const docsRoot = resolve(root, 'docs');
  const promptsDir = resolve(root, 'prompts');
  const nomosDir = resolve(root, 'nomos');
  const allDirectories = NOMOS_PROJECT_STATE_DIRECTORIES.map((entry) => resolve(root, entry));

  return {
    userAgoraDir,
    projectsRoot,
    projectId,
    root,
    profilePath: resolve(root, 'profile.toml'),
    constitutionDir: resolve(root, 'constitution'),
    docsRoot,
    docsArchitectureDir: resolve(docsRoot, 'architecture'),
    docsPlanningDir: resolve(docsRoot, 'planning'),
    docsWalkthroughDir: resolve(docsRoot, 'walkthrough'),
    docsQaDir: resolve(docsRoot, 'qa'),
    docsSecurityDir: resolve(docsRoot, 'security'),
    docsReferenceDir: resolve(docsRoot, 'reference'),
    lifecycleDir: resolve(root, 'lifecycle'),
    brainDir: resolve(root, 'brain'),
    tasksDir: resolve(root, 'tasks'),
    archiveDir: resolve(root, 'archive'),
    promptsDir,
    bootstrapPromptsDir: resolve(promptsDir, 'bootstrap'),
    bootstrapInterviewPromptPath: resolve(promptsDir, 'bootstrap', 'interview.md'),
    bootstrapExistingProjectPromptPath: resolve(promptsDir, 'bootstrap', 'existing-project.md'),
    bootstrapNewProjectPromptPath: resolve(promptsDir, 'bootstrap', 'new-project.md'),
    bootstrapNoRepoPromptPath: resolve(promptsDir, 'bootstrap', 'no-repo.md'),
    closeoutPromptsDir: resolve(promptsDir, 'closeout'),
    doctorPromptsDir: resolve(promptsDir, 'doctor'),
    closeoutReviewPromptPath: resolve(promptsDir, 'closeout', 'review.md'),
    constitutionEntryPath: resolve(root, 'constitution', 'constitution.md'),
    docsReferenceIndexPath: resolve(docsRoot, 'reference', 'README.md'),
    docsReferenceMethodologiesPath: resolve(docsRoot, 'reference', 'methodologies.md'),
    docsReferenceCurrentSurfacePath: resolve(docsRoot, 'reference', 'current-surface.md'),
    docsReferenceProjectNomosSpecPath: resolve(docsRoot, 'reference', 'project-nomos-authoring-spec.md'),
    docsReferenceGovernancePath: resolve(docsRoot, 'reference', 'governance.md'),
    docsReferenceLifecyclePath: resolve(docsRoot, 'reference', 'lifecycle.md'),
    docsReferenceBootstrapFieldsPath: resolve(docsRoot, 'reference', 'bootstrap-fields.md'),
    docsArchitectureOperatingModelPath: resolve(docsRoot, 'architecture', 'operating-model.md'),
    scriptsDir: resolve(root, 'scripts'),
    skillsDir: resolve(root, 'skills'),
    nomosDir,
    projectNomosDraftDir: resolve(nomosDir, 'project-nomos'),
    projectNomosDraftProfilePath: resolve(nomosDir, 'project-nomos', 'profile.toml'),
    lifecycleProjectBootstrapPath: resolve(root, 'lifecycle', 'project-bootstrap.md'),
    lifecycleTaskContextDeliveryPath: resolve(root, 'lifecycle', 'task-context-delivery.md'),
    lifecycleTaskCloseoutPath: resolve(root, 'lifecycle', 'task-closeout.md'),
    lifecycleProjectArchivePath: resolve(root, 'lifecycle', 'project-archive.md'),
    lifecycleGovernanceDoctorPath: resolve(root, 'lifecycle', 'governance-doctor.md'),
    doctorProjectPromptPath: resolve(promptsDir, 'doctor', 'project.md'),
    allDirectories,
  };
}

export function buildBuiltInAgoraNomosProjectProfile(
  projectId: string,
  options: ResolveAgoraProjectStateOptions = {},
): NomosProjectProfile {
  const layout = resolveAgoraProjectStateLayout(projectId, options);
  return nomosProjectProfileSchema.parse({
    schema_version: 1,
    project: {
      id: projectId,
      state_root: layout.root,
    },
    pack: {
      ...BUILT_IN_AGORA_NOMOS_PACK,
      install_mode: 'copy_on_install',
    },
    repository_shim: {
      entry: 'AGENTS.md',
      required_sections: [...REPO_AGENTS_SHIM_SECTION_ORDER],
    },
    project_state: {
      root_template: NOMOS_PROJECT_STATE_ROOT_TEMPLATE,
      directories: [...NOMOS_PROJECT_STATE_DIRECTORIES],
      versioning: {
        mode: 'git',
        auto_init: true,
      },
    },
    bootstrap: {
      methodology_mode: 'layered',
      shim_fields_only: true,
      prompts_dir: 'prompts/bootstrap',
    },
    constitution: {
      entry: 'constitution/constitution.md',
    },
    docs: {
      root: 'docs',
      skeleton: {
        create_if_missing: [
          'architecture',
          'planning',
          'walkthrough',
          'qa',
          'security',
          'reference',
        ],
      },
    },
    lifecycle: {
      modules: [...NOMOS_LIFECYCLE_MODULES],
    },
    doctor: {
      checks: [
        'repo-shim-present',
        'project-state-layout-complete',
        'constitution-present',
        'docs-skeleton-complete',
        'bootstrap-prompts-present',
      ],
    },
    provenance: {
      pack_source: BUILT_IN_AGORA_NOMOS_PACK.source,
    },
  });
}

export function ensureAgoraProjectStateLayout(
  projectId: string,
  options: EnsureAgoraProjectStateLayoutOptions = {},
): AgoraProjectStateLayout {
  const layout = resolveAgoraProjectStateLayout(projectId, options);
  mkdirSync(layout.root, { recursive: true });
  for (const dir of layout.allDirectories) {
    mkdirSync(dir, { recursive: true });
  }

  const profile = options.profile ?? buildBuiltInAgoraNomosProjectProfile(projectId, options);
  const shouldWriteProfile = options.writeProfile ?? true;
  if (shouldWriteProfile && !existsSync(layout.profilePath)) {
    writeFileSync(layout.profilePath, renderNomosProjectProfileToml(profile), 'utf8');
  }
  seedBuiltInAgoraNomosFiles(layout, profile);

  return layout;
}

export function installBuiltInAgoraNomosForProject(
  projectId: string,
  options: InstallBuiltInAgoraNomosOptions = {},
): InstalledBuiltInAgoraNomosResult {
  const profile = buildBuiltInAgoraNomosProjectProfile(projectId, options);
  const layout = ensureAgoraProjectStateLayout(projectId, {
    ...options,
    profile,
    writeProfile: true,
  });

  const repoExistedBeforeInstall = options.repoPath ? existsSync(resolve(options.repoPath)) : false;
  const repoRoot = resolveRepoRoot(options.repoPath, options.initializeRepo ?? false);
  const repoShimPath = repoRoot ? resolve(repoRoot, 'AGENTS.md') : null;
  const forceWriteRepoShim = options.forceWriteRepoShim ?? false;
  const repoShimWritten = Boolean(
    repoShimPath && (forceWriteRepoShim || !existsSync(repoShimPath)) && writeRepoShim(repoShimPath, profile),
  );
  const repoGitInitialized = Boolean(repoRoot && (options.initializeRepo ?? false) && ensureGitRepository(repoRoot));
  const projectStateGitInitialized = (options.initializeProjectStateGit ?? profile.project_state.versioning.auto_init)
    ? ensureGitRepository(layout.root)
    : false;

  return {
    profile,
    layout,
    repoRoot,
    repoShimPath,
    repoExistedBeforeInstall,
    repoShimWritten,
    repoGitInitialized,
    projectStateGitInitialized,
  };
}

export function mergeProjectMetadataWithNomosProfile(
  metadata: Record<string, unknown> | null | undefined,
  profile: NomosProjectProfile,
) {
  const existing = metadata ?? {};
  const existingAgora = asRecord(existing.agora);
  const existingNomos = asRecord(existingAgora.nomos);
  const projectStateRoot = profile.project.state_root;
  const defaultDraftRoot = resolve(projectStateRoot, 'nomos', 'project-nomos');
  const defaultDraftProfilePath = resolve(defaultDraftRoot, 'profile.toml');

  return {
    ...existing,
    agora: {
      ...existingAgora,
      nomos: {
        id: profile.pack.id,
        version: profile.pack.version,
        source: profile.pack.source,
        install_mode: profile.pack.install_mode,
        root_template: profile.project_state.root_template,
        activation_status: 'active_builtin',
        draft_root: defaultDraftRoot,
        draft_profile_path: defaultDraftProfilePath,
        active_root: projectStateRoot,
        active_profile_path: resolve(projectStateRoot, 'profile.toml'),
        ...existingNomos,
      },
    },
  };
}

export function resolveProjectNomosState(
  projectId: string,
  metadata: Record<string, unknown> | null | undefined,
  options: ResolveAgoraProjectStateOptions = {},
): ResolvedProjectNomosState {
  const layout = resolveAgoraProjectStateLayout(projectId, options);
  const existingAgora = asRecord(metadata?.agora);
  const existingNomos = asRecord(existingAgora.nomos);
  const repoPath = typeof metadata?.repo_path === 'string' ? metadata.repo_path : null;
  const activationStatus = projectNomosActivationStatusSchema.catch('active_builtin').parse(existingNomos.activation_status);
  const draftRoot = typeof existingNomos.draft_root === 'string'
    ? existingNomos.draft_root
    : layout.projectNomosDraftDir;
  const draftProfilePath = typeof existingNomos.draft_profile_path === 'string'
    ? existingNomos.draft_profile_path
    : layout.projectNomosDraftProfilePath;
  const activeRoot = typeof existingNomos.active_root === 'string'
    ? existingNomos.active_root
    : activationStatus === 'active_project'
      ? draftRoot
      : layout.root;
  const activeProfilePath = typeof existingNomos.active_profile_path === 'string'
    ? existingNomos.active_profile_path
    : activationStatus === 'active_project'
      ? draftProfilePath
      : layout.profilePath;
  const nomosId = typeof existingNomos.id === 'string' && existingNomos.id.length > 0
    ? existingNomos.id
    : DEFAULT_AGORA_NOMOS_ID;
  const activeSummary = activationStatus === 'active_project'
    ? loadProjectNomosPackSummary(activeRoot, activeProfilePath, 'project_state_draft')
    : buildBuiltInActiveNomosSummary(layout.root, layout.profilePath);

  return {
    project_id: projectId,
    nomos_id: nomosId,
    activation_status: activationStatus,
    project_state_root: layout.root,
    profile_path: layout.profilePath,
    profile_installed: existsSync(layout.profilePath),
    repo_path: repoPath,
    repo_shim_installed: Boolean(repoPath && existsSync(resolve(repoPath, 'AGENTS.md'))),
    bootstrap_prompts_dir: activationStatus === 'active_project'
      ? resolve(activeRoot, 'prompts', 'bootstrap')
      : layout.bootstrapPromptsDir,
    lifecycle_modules: activeSummary?.lifecycle_modules ?? [...NOMOS_LIFECYCLE_MODULES],
    draft_root: draftRoot,
    draft_profile_path: draftProfilePath,
    draft_profile_installed: existsSync(draftProfilePath),
    active_root: activeRoot,
    active_profile_path: activeProfilePath,
    active_profile_installed: existsSync(activeProfilePath),
  };
}

export function prepareProjectNomosInstall(
  options: PrepareProjectNomosInstallOptions,
): PreparedProjectNomosInstallResult {
  const preInstallNomosState = resolveProjectNomosState(options.projectId, options.metadata ?? null, options);
  const preInstallRuntimePaths = resolveProjectNomosRuntimePaths(options.projectId, options.metadata ?? null, options);
  const installedNomos = installBuiltInAgoraNomosForProject(options.projectId, {
    ...(options.repoPath ? { repoPath: options.repoPath } : {}),
    initializeRepo: options.initializeRepo ?? false,
    forceWriteRepoShim: options.forceWriteRepoShim ?? false,
    ...(options.userAgoraDir ? { userAgoraDir: options.userAgoraDir } : {}),
  });
  const authoringDraft = ensureProjectNomosAuthoringDraft(options.projectId, options.projectName, {
    ...(options.repoPath ? { repoPath: options.repoPath } : {}),
    nomosId: installedNomos.profile.pack.id,
    ...(options.userAgoraDir ? { userAgoraDir: options.userAgoraDir } : {}),
  });
  const persistedMetadata = mergeProjectMetadataWithNomosProfile({
    ...(options.metadata ?? {}),
    ...(options.repoPath ? { repo_path: options.repoPath } : {}),
  }, installedNomos.profile);
  const runtimePaths = resolveProjectNomosRuntimePaths(options.projectId, persistedMetadata, options);
  const nomosState = resolveProjectNomosState(options.projectId, persistedMetadata, options);
  const effectiveRuntimePaths = preInstallNomosState.activation_status === 'active_project'
    ? preInstallRuntimePaths
    : runtimePaths;
  const effectiveNomosState = preInstallNomosState.activation_status === 'active_project'
    ? preInstallNomosState
    : nomosState;
  const bootstrapMode = options.repoPath
    ? ((options.initializeRepo ?? false) ? 'new_repo' : 'existing_repo')
    : 'no_repo';

  return {
    installedNomos,
    authoringDraft,
    persistedMetadata,
    runtimePaths,
    nomosState,
    effectiveRuntimePaths,
    effectiveNomosState,
    bootstrapMode,
  };
}

export function reviewProjectNomosDraft(
  projectId: string,
  metadata: Record<string, unknown> | null | undefined,
  options: ResolveAgoraProjectStateOptions = {},
): ProjectNomosReviewResult {
  const state = resolveProjectNomosState(projectId, metadata, options);
  const issues: string[] = [];
  if (!state.draft_profile_installed) {
    issues.push(`Draft Nomos profile is missing: ${state.draft_profile_path}`);
  }
  const draftSummary = state.draft_profile_installed
    ? loadProjectNomosPackSummary(state.draft_root, state.draft_profile_path, 'project_state_draft')
    : null;
  if (draftSummary) {
    const expectedPackId = `project/${projectId}`;
    if (draftSummary.pack_id !== expectedPackId) {
      issues.push(`Draft Nomos pack id must be ${expectedPackId}, received ${draftSummary.pack_id}`);
    }
  }
  for (const requiredPath of [
    resolve(state.draft_root, 'constitution', 'constitution.md'),
    resolve(state.draft_root, 'docs', 'reference', 'methodologies.md'),
    resolve(state.draft_root, 'prompts', 'bootstrap', 'interview.md'),
  ]) {
    if (!existsSync(requiredPath)) {
      issues.push(`Draft Nomos is missing required file: ${requiredPath}`);
    }
  }

  const activeSummary = state.activation_status === 'active_project'
    ? (loadProjectNomosPackSummary(
      state.active_root,
      state.active_profile_path,
      'project_state_draft',
    ) ?? buildBuiltInActiveNomosSummary(state.project_state_root, state.profile_path))
    : buildBuiltInActiveNomosSummary(state.project_state_root, state.profile_path);

  return {
    project_id: projectId,
    activation_status: state.activation_status,
    can_activate: issues.length === 0,
    issues,
    active: activeSummary,
    draft: draftSummary,
  };
}

export function resolveProjectNomosRuntimePaths(
  projectId: string,
  metadata: Record<string, unknown> | null | undefined,
  options: ResolveAgoraProjectStateOptions = {},
): ProjectNomosRuntimePaths {
  const layout = resolveAgoraProjectStateLayout(projectId, options);
  const state = resolveProjectNomosState(projectId, metadata, options);
  if (state.activation_status === 'active_project') {
    return {
      nomos_root: state.active_root,
      lifecycle_root: resolve(state.active_root, 'lifecycle'),
      bootstrap_prompts_dir: resolve(state.active_root, 'prompts', 'bootstrap'),
      bootstrap_interview_prompt_path: resolve(state.active_root, 'prompts', 'bootstrap', 'interview.md'),
      closeout_review_prompt_path: resolve(state.active_root, 'prompts', 'closeout', 'review.md'),
      doctor_project_prompt_path: resolve(state.active_root, 'prompts', 'doctor', 'project.md'),
    };
  }
  return {
    nomos_root: layout.root,
    lifecycle_root: layout.lifecycleDir,
    bootstrap_prompts_dir: layout.bootstrapPromptsDir,
    bootstrap_interview_prompt_path: layout.bootstrapInterviewPromptPath,
    closeout_review_prompt_path: layout.closeoutReviewPromptPath,
    doctor_project_prompt_path: layout.doctorProjectPromptPath,
  };
}

export function validateProjectNomos(
  projectId: string,
  metadata: Record<string, unknown> | null | undefined,
  options: ResolveAgoraProjectStateOptions & {
    target?: ProjectNomosValidationTarget;
  } = {},
): ProjectNomosValidationResult {
  const target = options.target ?? 'draft';
  const state = resolveProjectNomosState(projectId, metadata, options);
  const issues: ProjectNomosValidationIssue[] = [];
  const pack = resolveProjectNomosPackForTarget(projectId, state, target);
  const root = target === 'draft' ? state.draft_root : state.active_root;
  const profilePath = target === 'draft' ? state.draft_profile_path : state.active_profile_path;

  if (!pack) {
    issues.push({
      severity: 'error',
      code: 'profile_missing',
      message: `Nomos profile is missing for ${target}`,
      path: profilePath,
    });
  }

  for (const requiredPath of [
    resolve(root, 'constitution', 'constitution.md'),
    resolve(root, 'docs', 'reference', 'methodologies.md'),
    resolve(root, 'prompts', 'bootstrap', 'interview.md'),
  ]) {
    if (!existsSync(requiredPath)) {
      issues.push({
        severity: 'error',
        code: 'required_file_missing',
        message: `Required Nomos file is missing: ${requiredPath}`,
        path: requiredPath,
      });
    }
  }

  if (pack) {
    for (const module of pack.lifecycle_modules) {
      const lifecyclePath = resolve(root, 'lifecycle', `${module}.md`);
      if (!existsSync(lifecyclePath)) {
        issues.push({
          severity: 'warning',
          code: 'lifecycle_doc_missing',
          message: `Lifecycle module ${module} has no documentation file`,
          path: lifecyclePath,
        });
      }
    }
  }

  return {
    project_id: projectId,
    target,
    valid: !issues.some((issue) => issue.severity === 'error'),
    activation_status: state.activation_status,
    pack,
    issues,
  };
}

export function diffProjectNomos(
  projectId: string,
  metadata: Record<string, unknown> | null | undefined,
  options: ResolveAgoraProjectStateOptions & {
    base?: 'builtin' | 'active';
    candidate?: 'draft' | 'active';
  } = {},
): ProjectNomosDiffResult {
  const state = resolveProjectNomosState(projectId, metadata, options);
  const base = options.base ?? 'active';
  const candidate = options.candidate ?? 'draft';
  const basePack = base === 'builtin'
    ? buildBuiltInActiveNomosSummary(state.project_state_root, state.profile_path)
    : resolveProjectNomosPackForTarget(projectId, state, 'active');
  const candidatePack = resolveProjectNomosPackForTarget(projectId, state, candidate);

  const differences: ProjectNomosDiffEntry[] = [];
  for (const field of ['pack_id', 'name', 'version', 'description', 'lifecycle_modules', 'doctor_checks'] as const) {
    const fromValue = basePack?.[field] ?? null;
    const toValue = candidatePack?.[field] ?? null;
    if (isSameNomosFieldValue(fromValue, toValue)) {
      continue;
    }
    differences.push({
      field,
      from: fromValue,
      to: toValue,
    });
  }

  return {
    project_id: projectId,
    base,
    candidate,
    changed: differences.length > 0,
    base_pack: basePack,
    candidate_pack: candidatePack,
    differences,
  };
}

export function diagnoseProjectNomosDrift(
  projectId: string,
  metadata: Record<string, unknown> | null | undefined,
  options: ResolveAgoraProjectStateOptions = {},
): ProjectNomosDriftReport {
  const state = resolveProjectNomosState(projectId, metadata, options);
  const draftValidation = validateProjectNomos(projectId, metadata, {
    ...options,
    target: 'draft',
  });
  const activeValidation = validateProjectNomos(projectId, metadata, {
    ...options,
    target: 'active',
  });
  const diff = diffProjectNomos(projectId, metadata, {
    ...options,
    base: state.activation_status === 'active_project' ? 'active' : 'builtin',
    candidate: 'draft',
  });

  const activationBlockers = draftValidation.issues.filter((issue) => issue.severity === 'error').length;
  const structuralWarnings = draftValidation.issues.filter((issue) => issue.severity === 'warning').length
    + activeValidation.issues.filter((issue) => issue.severity === 'warning').length;

  const candidateLifecycleModules = new Set(diff.candidate_pack?.lifecycle_modules ?? []);
  const baseLifecycleModules = new Set(diff.base_pack?.lifecycle_modules ?? []);
  const candidateDoctorChecks = new Set(diff.candidate_pack?.doctor_checks ?? []);
  const baseDoctorChecks = new Set(diff.base_pack?.doctor_checks ?? []);

  const addedLifecycleModules = [...candidateLifecycleModules].filter((item) => !baseLifecycleModules.has(item));
  const removedLifecycleModules = [...baseLifecycleModules].filter((item) => !candidateLifecycleModules.has(item));
  const addedDoctorChecks = [...candidateDoctorChecks].filter((item) => !baseDoctorChecks.has(item));
  const removedDoctorChecks = [...baseDoctorChecks].filter((item) => !candidateDoctorChecks.has(item));

  const semanticChanges = diff.differences.length;
  const changedFields = diff.differences.map((entry) => entry.field);

  let riskLevel: ProjectNomosDriftRiskLevel = 'none';
  if (activationBlockers > 0) {
    riskLevel = 'high';
  } else if (removedLifecycleModules.length > 0 || removedDoctorChecks.length > 0) {
    riskLevel = 'medium';
  } else if (structuralWarnings > 0 || semanticChanges > 0) {
    riskLevel = 'low';
  }

  return {
    project_id: projectId,
    activation_status: state.activation_status,
    risk_level: riskLevel,
    activation_blockers: activationBlockers,
    structural_warnings: structuralWarnings,
    semantic_changes: semanticChanges,
    changed_fields: changedFields,
    added_lifecycle_modules: addedLifecycleModules,
    removed_lifecycle_modules: removedLifecycleModules,
    added_doctor_checks: addedDoctorChecks,
    removed_doctor_checks: removedDoctorChecks,
  };
}

export function activateProjectNomosDraft(
  projectId: string,
  options: ActivateProjectNomosDraftOptions,
): ActivateProjectNomosDraftResult {
  const review = reviewProjectNomosDraft(projectId, options.metadata, options);
  if (!review.can_activate || !review.draft) {
    throw new Error([
      `Cannot activate project Nomos draft for ${projectId}.`,
      ...review.issues,
    ].join(' '));
  }

  const activatedAt = options.activatedAt ?? new Date().toISOString();
  const existing = options.metadata ?? {};
  const existingAgora = asRecord(existing.agora);
  const existingNomos = asRecord(existingAgora.nomos);
  const nextMetadata = {
    ...existing,
    agora: {
      ...existingAgora,
      nomos: {
        ...existingNomos,
        id: review.draft.pack_id,
        version: review.draft.version,
        source: review.draft.source,
        install_mode: 'copy_on_install',
        root_template: existingNomos.root_template ?? NOMOS_PROJECT_STATE_ROOT_TEMPLATE,
        activation_status: 'active_project',
        draft_root: review.draft.root,
        draft_profile_path: review.draft.profile_path,
        active_root: review.draft.root,
        active_profile_path: review.draft.profile_path,
        activated_at: activatedAt,
        activated_by: options.actor,
      },
    },
  };

  return {
    project_id: projectId,
    nomos_id: review.draft.pack_id,
    activation_status: 'active_project',
    active_root: review.draft.root,
    active_profile_path: review.draft.profile_path,
    activated_at: activatedAt,
    activated_by: options.actor,
    metadata: nextMetadata,
  };
}

export function exportProjectNomosPack(
  projectId: string,
  metadata: Record<string, unknown> | null | undefined,
  options: ExportProjectNomosPackOptions,
): ExportProjectNomosPackResult {
  const target = options.target ?? 'draft';
  const state = resolveProjectNomosState(projectId, metadata, options);
  const root = target === 'active' ? state.active_root : state.draft_root;
  const pack = resolveProjectNomosPackForTarget(projectId, state, target);
  if (!pack || !existsSync(root)) {
    throw new Error(`Cannot export Nomos pack for ${projectId}: ${target} pack is missing.`);
  }

  if (options.replaceExisting && existsSync(options.outputDir) && readdirSync(options.outputDir).length > 0) {
    removeDirectoryTree(options.outputDir, {
      label: 'export project nomos pack',
      requirePackMarker: true,
    });
  }
  mkdirSync(options.outputDir, { recursive: true });
  if (readdirSync(options.outputDir).length > 0) {
    throw new Error(`Nomos export output directory must be empty: ${options.outputDir}`);
  }
  copyDirectoryRecursive(root, options.outputDir);

  return {
    project_id: projectId,
    target,
    output_dir: options.outputDir,
    pack,
  };
}

export function publishProjectNomosPack(
  projectId: string,
  metadata: Record<string, unknown> | null | undefined,
  options: PublishProjectNomosPackOptions = {},
): PublishProjectNomosPackResult {
  const target = options.target ?? 'draft';
  const state = resolveProjectNomosState(projectId, metadata, options);
  const exported = exportProjectNomosPack(projectId, metadata, {
    ...options,
    target,
    outputDir: resolveCatalogPackRoot(options.packId ?? null, projectId, metadata, target, options),
    replaceExisting: options.replaceExisting ?? true,
  });
  if (!exported.pack) {
    throw new Error(`Cannot publish Nomos pack for ${projectId}: ${target} pack is missing.`);
  }

  const catalogLayout = resolveAgoraNomosCatalogLayout(options);
  const manifestPath = resolve(exported.output_dir, 'catalog-entry.json');
  const entry: PublishedNomosCatalogEntry = {
    schema_version: 1,
    pack_id: exported.pack.pack_id,
    published_at: options.publishedAt ?? new Date().toISOString(),
    source_kind: 'project_publish',
    published_by: options.publishedBy?.trim() || null,
    published_note: options.publishedNote?.trim() || null,
    source_project_id: projectId,
    source_target: target,
    source_activation_status: state.activation_status,
    source_repo_path: state.repo_path,
    published_root: exported.output_dir,
    manifest_path: manifestPath,
    pack: {
      ...exported.pack,
      root: exported.output_dir,
      profile_path: resolve(exported.output_dir, 'profile.toml'),
    },
  };
  writeFileSync(manifestPath, JSON.stringify(entry, null, 2), 'utf8');

  return {
    project_id: projectId,
    target,
    catalog_root: catalogLayout.root,
    catalog_pack_root: exported.output_dir,
    manifest_path: manifestPath,
    entry,
  };
}

export function installLocalNomosPackToProject(
  projectId: string,
  metadata: Record<string, unknown> | null | undefined,
  options: InstallLocalNomosPackToProjectOptions,
): InstallLocalNomosPackToProjectResult {
  const layout = resolveAgoraProjectStateLayout(projectId, options);
  const sourceProfilePath = resolve(options.packDir, 'profile.toml');
  if (!existsSync(options.packDir) || !existsSync(sourceProfilePath)) {
    throw new Error(`Nomos pack directory is invalid: ${options.packDir}`);
  }

  if (options.replaceExisting ?? true) {
    removeDirectoryTree(layout.projectNomosDraftDir, {
      label: 'install local nomos pack',
      allowedParents: [layout.root],
    });
  }
  mkdirSync(layout.projectNomosDraftDir, { recursive: true });
  copyDirectoryRecursive(options.packDir, layout.projectNomosDraftDir);

  const pack = loadProjectNomosPackSummary(
    layout.projectNomosDraftDir,
    layout.projectNomosDraftProfilePath,
    'project_state_draft',
  );
  if (!pack) {
    throw new Error(`Installed Nomos pack is missing profile: ${layout.projectNomosDraftProfilePath}`);
  }

  const existing = options.metadata ?? metadata ?? {};
  const existingAgora = asRecord(asRecord(existing).agora);
  const existingNomos = asRecord(existingAgora.nomos);
  const nextMetadata = {
    ...existing,
    agora: {
      ...existingAgora,
      nomos: {
        ...existingNomos,
        draft_root: layout.projectNomosDraftDir,
        draft_profile_path: layout.projectNomosDraftProfilePath,
        draft_profile_installed: true,
      },
    },
  } as Record<string, unknown>;

  return {
    project_id: projectId,
    pack,
    installed_root: layout.projectNomosDraftDir,
    installed_profile_path: layout.projectNomosDraftProfilePath,
    metadata: nextMetadata,
  };
}

export function listPublishedNomosCatalog(
  options: ListPublishedNomosCatalogOptions = {},
): ListPublishedNomosCatalogResult {
  const layout = resolveAgoraNomosCatalogLayout(options);
  if (!existsSync(layout.packsRoot)) {
    return { catalog_root: layout.root, total: 0, summaries: [], entries: [] };
  }

  const entries = listCatalogManifestPaths(layout.packsRoot)
    .map((manifestPath) => {
      try {
        return loadPublishedNomosCatalogEntry(manifestPath);
      } catch {
        return options.includeInvalid ? null : null;
      }
    })
    .filter((entry): entry is PublishedNomosCatalogEntry => entry !== null)
    .sort((left, right) => right.published_at.localeCompare(left.published_at));

  return {
    catalog_root: layout.root,
    total: entries.length,
    summaries: entries.map((entry) => buildPublishedCatalogSummary(entry)),
    entries,
  };
}

export function inspectPublishedNomosCatalogPack(
  packId: string,
  options: ResolveAgoraProjectStateOptions = {},
): PublishedNomosCatalogEntry {
  const manifestPath = resolveCatalogManifestPath(packId, options);
  return loadPublishedNomosCatalogEntry(manifestPath);
}

export function installCatalogNomosPackToProject(
  projectId: string,
  metadata: Record<string, unknown> | null | undefined,
  options: InstallCatalogNomosPackToProjectOptions,
): InstallCatalogNomosPackToProjectResult {
  const entry = inspectPublishedNomosCatalogPack(options.packId, options);
  const installOptions: InstallLocalNomosPackToProjectOptions = {
    ...(options.metadata !== undefined ? { metadata: options.metadata } : {}),
    ...(options.userAgoraDir !== undefined ? { userAgoraDir: options.userAgoraDir } : {}),
    ...(options.replaceExisting !== undefined ? { replaceExisting: options.replaceExisting } : {}),
    packDir: entry.published_root,
  };
  const installed = installLocalNomosPackToProject(projectId, metadata, installOptions);
  return {
    ...installed,
    catalog_entry: entry,
  };
}

export function exportNomosShareBundle(
  options: ExportNomosShareBundleOptions,
): ExportNomosShareBundleResult {
  const entry = inspectPublishedNomosCatalogPack(options.packId, options);
  if (options.replaceExisting && existsSync(options.outputDir) && readdirSync(options.outputDir).length > 0) {
    removeDirectoryTree(options.outputDir, {
      label: 'export nomos share bundle',
      requirePackMarker: true,
    });
  }
  mkdirSync(options.outputDir, { recursive: true });
  if (readdirSync(options.outputDir).length > 0) {
    throw new Error(`Nomos share bundle output directory must be empty: ${options.outputDir}`);
  }
  copyDirectoryRecursive(entry.published_root, options.outputDir);

  const manifest: NomosShareBundleManifest = {
    schema_version: 1,
    bundle_kind: 'nomos_share_bundle',
    exported_at: options.exportedAt ?? new Date().toISOString(),
    pack: {
      pack_id: entry.pack.pack_id,
      name: entry.pack.name,
      version: entry.pack.version,
      description: entry.pack.description,
      lifecycle_modules: [...entry.pack.lifecycle_modules],
      doctor_checks: [...entry.pack.doctor_checks],
      source: entry.pack.source,
    },
    source: {
      catalog_pack_id: entry.pack_id,
      source_project_id: entry.source_project_id,
      source_target: entry.source_target,
      source_activation_status: entry.source_activation_status,
      source_repo_path: entry.source_repo_path,
      published_by: entry.published_by,
      published_note: entry.published_note,
    },
  };
  const manifestPath = resolve(options.outputDir, 'nomos-share-bundle.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  return {
    pack_id: entry.pack_id,
    output_dir: options.outputDir,
    manifest_path: manifestPath,
    manifest,
  };
}

export function importNomosShareBundle(
  options: ImportNomosShareBundleOptions,
): ImportNomosShareBundleResult {
  const manifestPath = resolve(options.sourceDir, 'nomos-share-bundle.json');
  const manifest = loadNomosShareBundleManifest(manifestPath);
  const catalogPackRoot = resolveCatalogPackDir(manifest.pack.pack_id, options);
  if (options.replaceExisting ?? true) {
    removeDirectoryTree(catalogPackRoot, {
      label: 'import nomos share bundle',
      requirePackMarker: true,
      allowedParents: [resolveAgoraNomosCatalogLayout(options).packsRoot],
    });
  }
  mkdirSync(catalogPackRoot, { recursive: true });
  copyDirectoryRecursive(options.sourceDir, catalogPackRoot);

  const importedEntry: PublishedNomosCatalogEntry = {
    schema_version: 1,
    pack_id: manifest.pack.pack_id,
    published_at: manifest.exported_at,
    source_kind: 'share_bundle',
    published_by: manifest.source.published_by,
    published_note: manifest.source.published_note,
    source_project_id: manifest.source.source_project_id,
    source_target: manifest.source.source_target,
    source_activation_status: manifest.source.source_activation_status,
    source_repo_path: manifest.source.source_repo_path,
    published_root: catalogPackRoot,
    manifest_path: resolve(catalogPackRoot, 'catalog-entry.json'),
    pack: {
      pack_id: manifest.pack.pack_id,
      name: manifest.pack.name,
      version: manifest.pack.version,
      description: manifest.pack.description,
      lifecycle_modules: [...manifest.pack.lifecycle_modules],
      doctor_checks: [...manifest.pack.doctor_checks],
      source: manifest.pack.source,
      root: catalogPackRoot,
      profile_path: resolve(catalogPackRoot, 'profile.toml'),
    },
  };
  writeFileSync(importedEntry.manifest_path, JSON.stringify(importedEntry, null, 2), 'utf8');

  return {
    source_dir: options.sourceDir,
    manifest_path: manifestPath,
    entry: importedEntry,
  };
}

export function importNomosSource(
  options: ImportNomosSourceOptions,
): ImportNomosSourceResult {
  const bundleManifestPath = resolve(options.sourceDir, 'nomos-share-bundle.json');
  if (existsSync(bundleManifestPath)) {
    const imported = importNomosShareBundle(options);
    return {
      source_dir: imported.source_dir,
      source_kind: 'share_bundle',
      manifest_path: imported.manifest_path,
      entry: imported.entry,
    };
  }

  const sourceProfilePath = resolve(options.sourceDir, 'profile.toml');
  const sourcePack = loadProjectNomosPackSummary(options.sourceDir, sourceProfilePath, 'external_pack_root');
  if (!sourcePack) {
    throw new Error(`Nomos source directory is invalid: ${options.sourceDir}`);
  }

  const catalogPackRoot = resolveCatalogPackDir(sourcePack.pack_id, options);
  if (options.replaceExisting ?? true) {
    removeDirectoryTree(catalogPackRoot, {
      label: 'import nomos source',
      requirePackMarker: true,
      allowedParents: [resolveAgoraNomosCatalogLayout(options).packsRoot],
    });
  }
  mkdirSync(catalogPackRoot, { recursive: true });
  copyDirectoryRecursive(options.sourceDir, catalogPackRoot);

  const importedEntry: PublishedNomosCatalogEntry = {
    schema_version: 1,
    pack_id: sourcePack.pack_id,
    published_at: options.importedAt ?? new Date().toISOString(),
    source_kind: 'pack_root',
    published_by: null,
    published_note: null,
    source_project_id: 'external',
    source_target: 'draft',
    source_activation_status: 'active_builtin',
    source_repo_path: options.sourceDir,
    published_root: catalogPackRoot,
    manifest_path: resolve(catalogPackRoot, 'catalog-entry.json'),
    pack: {
      ...sourcePack,
      root: catalogPackRoot,
      profile_path: resolve(catalogPackRoot, 'profile.toml'),
    },
  };
  writeFileSync(importedEntry.manifest_path, JSON.stringify(importedEntry, null, 2), 'utf8');

  return {
    source_dir: options.sourceDir,
    source_kind: 'pack_root',
    manifest_path: null,
    entry: importedEntry,
  };
}

export function installNomosFromSource(
  projectId: string,
  metadata: Record<string, unknown> | null | undefined,
  options: InstallNomosFromSourceOptions,
): InstallNomosFromSourceResult {
  const imported = importNomosSource({
    sourceDir: options.sourceDir,
    ...(options.userAgoraDir !== undefined ? { userAgoraDir: options.userAgoraDir } : {}),
    ...(options.replaceExisting !== undefined ? { replaceExisting: options.replaceExisting } : {}),
  });
  const installed = installCatalogNomosPackToProject(projectId, metadata, {
    packId: imported.entry.pack_id,
    ...(options.metadata !== undefined ? { metadata: options.metadata } : {}),
    ...(options.userAgoraDir !== undefined ? { userAgoraDir: options.userAgoraDir } : {}),
    ...(options.replaceExisting !== undefined ? { replaceExisting: options.replaceExisting } : {}),
  });
  return {
    ...installed,
    imported,
  };
}

export function scaffoldNomosPack(options: ScaffoldNomosPackOptions): ScaffoldNomosPackResult {
  const lifecycleModules = Array.from(new Set(options.lifecycleModules ?? DEFAULT_CUSTOM_NOMOS_PACK_LIFECYCLE_MODULES));
  const doctorChecks = Array.from(new Set(options.doctorChecks ?? DEFAULT_CUSTOM_NOMOS_PACK_DOCTOR_CHECKS));
  const version = options.version?.trim() || '0.1.0';

  if (!existsSync(options.templateDir)) {
    throw new Error(`Nomos pack template not found: ${options.templateDir}`);
  }

  if (options.replaceExisting && existsSync(options.outputDir) && readdirSync(options.outputDir).length > 0) {
    removeDirectoryTree(options.outputDir, {
      label: 'scaffold nomos pack',
      requirePackMarker: true,
    });
  }

  if (existsSync(options.outputDir) && readdirSync(options.outputDir).length > 0) {
    throw new Error(`Nomos pack output directory must be empty: ${options.outputDir}`);
  }

  mkdirSync(options.outputDir, { recursive: true });
  copyDirectoryRecursive(options.templateDir, options.outputDir);

  const profilePath = resolve(options.outputDir, 'profile.toml');
  const readmePath = resolve(options.outputDir, 'README.md');
  const constitutionPath = resolve(options.outputDir, 'constitution', 'constitution.md');
  const docsReferenceDir = resolve(options.outputDir, 'docs', 'reference');
  const lifecycleDir = resolve(options.outputDir, 'lifecycle');
  const bootstrapPromptsDir = resolve(options.outputDir, 'prompts', 'bootstrap');
  const closeoutPromptsDir = resolve(options.outputDir, 'prompts', 'closeout');
  const doctorPromptsDir = resolve(options.outputDir, 'prompts', 'doctor');

  mkdirSync(resolve(options.outputDir, 'constitution'), { recursive: true });
  mkdirSync(docsReferenceDir, { recursive: true });
  mkdirSync(lifecycleDir, { recursive: true });
  mkdirSync(bootstrapPromptsDir, { recursive: true });

  writeFileSync(profilePath, renderNomosPackTemplateProfileToml({
    id: options.id,
    name: options.name,
    description: options.description,
    version,
    lifecycleModules,
    doctorChecks,
  }), 'utf8');
  writeFileSync(readmePath, renderCustomNomosReadme({
    id: options.id,
    name: options.name,
    description: options.description,
    version,
    lifecycleModules,
  }), 'utf8');
  writeFileSync(constitutionPath, renderCustomNomosConstitution({
    name: options.name,
    description: options.description,
  }), 'utf8');
  writeFileSync(resolve(docsReferenceDir, 'methodologies.md'), renderCustomNomosMethodologies({
    name: options.name,
    lifecycleModules,
  }), 'utf8');
  writeFileSync(resolve(bootstrapPromptsDir, 'interview.md'), renderCustomNomosBootstrapInterview({
    name: options.name,
    description: options.description,
  }), 'utf8');

  for (const knownModule of NOMOS_LIFECYCLE_MODULES) {
    const targetPath = resolve(lifecycleDir, `${knownModule}.md`);
    rmSync(targetPath, { force: true });
    if (!lifecycleModules.includes(knownModule)) {
      continue;
    }
    writeFileSync(targetPath, renderCustomNomosLifecycleDoc(knownModule, options.name), 'utf8');
  }

  const closeoutPromptPath = resolve(closeoutPromptsDir, 'review.md');
  rmSync(closeoutPromptPath, { force: true });
  if (lifecycleModules.includes('task-closeout')) {
    mkdirSync(closeoutPromptsDir, { recursive: true });
    writeFileSync(closeoutPromptPath, renderCustomNomosCloseoutPrompt(options.name), 'utf8');
  }

  const doctorPromptPath = resolve(doctorPromptsDir, 'project.md');
  rmSync(doctorPromptPath, { force: true });
  if (lifecycleModules.includes('governance-doctor')) {
    mkdirSync(doctorPromptsDir, { recursive: true });
    writeFileSync(doctorPromptPath, renderCustomNomosDoctorPrompt(options.name), 'utf8');
  }

  return {
    outputDir: options.outputDir,
    profilePath,
    constitutionPath,
    readmePath,
  };
}

export function renderNomosProjectProfileToml(profile: NomosProjectProfile): string {
  const lines = [
    `schema_version = ${profile.schema_version}`,
    '',
    '[project]',
    `id = ${tomlString(profile.project.id)}`,
    `state_root = ${tomlString(profile.project.state_root)}`,
    '',
    '[pack]',
    `id = ${tomlString(profile.pack.id)}`,
    `name = ${tomlString(profile.pack.name)}`,
    `version = ${tomlString(profile.pack.version)}`,
    `description = ${tomlString(profile.pack.description)}`,
    `source = ${tomlString(profile.pack.source)}`,
    `install_mode = ${tomlString(profile.pack.install_mode)}`,
    '',
    '[repository_shim]',
    `entry = ${tomlString(profile.repository_shim.entry)}`,
    `required_sections = ${tomlStringArray(profile.repository_shim.required_sections)}`,
    '',
    '[project_state]',
    `root_template = ${tomlString(profile.project_state.root_template)}`,
    `directories = ${tomlStringArray(profile.project_state.directories)}`,
    '',
    '[project_state.versioning]',
    `mode = ${tomlString(profile.project_state.versioning.mode)}`,
    `auto_init = ${profile.project_state.versioning.auto_init ? 'true' : 'false'}`,
    '',
    '[bootstrap]',
    `methodology_mode = ${tomlString(profile.bootstrap.methodology_mode)}`,
    `shim_fields_only = ${profile.bootstrap.shim_fields_only ? 'true' : 'false'}`,
    `prompts_dir = ${tomlString(profile.bootstrap.prompts_dir)}`,
    '',
    '[constitution]',
    `entry = ${tomlString(profile.constitution.entry)}`,
    '',
    '[docs]',
    `root = ${tomlString(profile.docs.root)}`,
    '',
    '[docs.skeleton]',
    `create_if_missing = ${tomlStringArray(profile.docs.skeleton.create_if_missing)}`,
    '',
    '[lifecycle]',
    `modules = ${tomlStringArray(profile.lifecycle.modules)}`,
    '',
    '[doctor]',
    `checks = ${tomlStringArray(profile.doctor.checks)}`,
    '',
    '[provenance]',
    `pack_source = ${tomlString(profile.provenance.pack_source)}`,
  ];

  if (profile.provenance.docs_repo_remote) {
    lines.push(`docs_repo_remote = ${tomlString(profile.provenance.docs_repo_remote)}`);
  }

  return lines.join('\n') + '\n';
}

export function renderRepoAgentsShim(options: RenderRepoAgentsShimOptions) {
  const { profile } = options;
  const sectionOrder = profile.repository_shim.required_sections.map((section) => ({
    id: section,
    title: REPO_AGENTS_SHIM_SECTION_TITLES[section],
  }));

  const lines = [
    '# AGENTS.md',
    '',
    '_This file is a repo-facing shim. Treat it as an index and bootstrap protocol, not as the project body._',
    '',
    ...sectionOrder.flatMap(({ id, title }) => renderRepoAgentsShimSection(id, title, profile)),
  ];

  return lines.join('\n').trimEnd() + '\n';
}

function renderRepoAgentsShimSection(
  section: RepoAgentsShimSection,
  title: string,
  profile: NomosProjectProfile,
) {
  switch (section) {
    case 'general_constitution':
      return [
        `## ${title}`,
        '',
        '- Use first-principles reasoning before proposing changes.',
        '- Do not assume missing requirements, context, or constraints.',
        '- Do not present uncertain claims as confirmed facts.',
        '- Do not claim completion without verification.',
        '- Ask for explicit confirmation before high-risk or destructive actions.',
        '',
      ];
    case 'pack_index':
      return [
        `## ${title}`,
        '',
        `- Nomos Pack: ${profile.pack.name} (\`${profile.pack.id}@${profile.pack.version}\`)`,
        `- Global Project State: \`${profile.project.state_root}\``,
        `- Constitution Entry: \`${profile.constitution.entry}\``,
        `- Primary References: \`${profile.project.state_root}/docs/reference\`, \`${profile.project.state_root}/brain\`, \`${profile.project.state_root}/lifecycle\``,
        '',
      ];
    case 'bootstrap_method':
      return [
        `## ${title}`,
        '',
        '- Treat this repo as the execution surface and the global project state as the harness body.',
        `- If the harness is still skeletal, bootstrap it through \`${profile.project.state_root}/${profile.bootstrap.prompts_dir}\`.`,
        '- Interview the user to identify repository paths, current surface area, constraints, and methodologies before filling project docs.',
        '- Write bootstrap outputs into project-state references and brain documents, never back into `AGENTS.md`.',
        '',
      ];
    case 'fill_policy':
      return [
        `## ${title}`,
        '',
        '- Pack-provided structure and prompts live under the global project state.',
        '- Project-specific content belongs in `brain/`, `docs/reference/`, `docs/architecture/`, and later planning/walkthrough artifacts.',
        '- `AGENTS.md` stays thin: update routing or methodology pointers here, not the project body.',
        '',
      ];
  }
}

function resolveRepoRoot(repoPath: string | null | undefined, initializeRepo: boolean) {
  if (!repoPath) {
    if (initializeRepo) {
      throw new Error('repoPath is required when initializeRepo=true');
    }
    return null;
  }

  const repoRoot = resolve(repoPath);
  if (existsSync(repoRoot)) {
    if (!statSync(repoRoot).isDirectory()) {
      throw new Error(`repoPath must be a directory: ${repoRoot}`);
    }
    return repoRoot;
  }

  if (!initializeRepo) {
    throw new Error(`repoPath does not exist: ${repoRoot}`);
  }

  mkdirSync(repoRoot, { recursive: true });
  return repoRoot;
}

function writeRepoShim(targetPath: string, profile: NomosProjectProfile) {
  writeFileSync(targetPath, renderRepoAgentsShim({ profile }), 'utf8');
  return true;
}

function ensureGitRepository(root: string) {
  if (existsSync(resolve(root, '.git'))) {
    return false;
  }
  try {
    childProcess.execFileSync('git', ['init', '--initial-branch=main'], {
      cwd: root,
      stdio: 'ignore',
    });
    return true;
  } catch (error) {
    throw new Error(`Failed to initialize git repository at ${root}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function seedBuiltInAgoraNomosFiles(layout: AgoraProjectStateLayout, profile: NomosProjectProfile) {
  writeFileIfMissing(layout.constitutionEntryPath, renderBuiltInConstitution(profile));
  writeFileIfMissing(layout.docsReferenceIndexPath, renderBuiltInReferenceIndex(profile));
  writeFileIfMissing(layout.docsReferenceMethodologiesPath, renderBuiltInMethodologiesReference(profile));
  writeFileIfMissing(layout.docsReferenceCurrentSurfacePath, renderBuiltInCurrentSurfaceReference(profile));
  writeFileIfMissing(layout.docsReferenceGovernancePath, renderBuiltInGovernanceReference(profile));
  writeFileIfMissing(layout.docsReferenceLifecyclePath, renderBuiltInLifecycleReference(profile));
  writeFileIfMissing(layout.docsReferenceBootstrapFieldsPath, renderBuiltInBootstrapFieldsReference(profile));
  writeFileIfMissing(layout.docsArchitectureOperatingModelPath, renderBuiltInOperatingModelArchitecture(profile, layout));
  writeFileIfMissing(layout.lifecycleProjectBootstrapPath, renderBuiltInProjectBootstrapLifecycle(layout));
  writeFileIfMissing(layout.lifecycleTaskContextDeliveryPath, renderBuiltInTaskContextDeliveryLifecycle(layout));
  writeFileIfMissing(layout.lifecycleTaskCloseoutPath, renderBuiltInTaskCloseoutLifecycle(layout));
  writeFileIfMissing(layout.lifecycleProjectArchivePath, renderBuiltInProjectArchiveLifecycle(layout));
  writeFileIfMissing(layout.lifecycleGovernanceDoctorPath, renderBuiltInGovernanceDoctorLifecycle(layout));
  writeFileIfMissing(layout.bootstrapInterviewPromptPath, renderBuiltInBootstrapInterviewPrompt(profile, layout));
  writeFileIfMissing(layout.bootstrapExistingProjectPromptPath, renderBuiltInExistingProjectPrompt(layout));
  writeFileIfMissing(layout.bootstrapNewProjectPromptPath, renderBuiltInNewProjectPrompt(layout));
  writeFileIfMissing(layout.bootstrapNoRepoPromptPath, renderBuiltInNoRepoPrompt(layout));
  writeFileIfMissing(layout.closeoutReviewPromptPath, renderBuiltInCloseoutReviewPrompt(profile));
  writeFileIfMissing(layout.doctorProjectPromptPath, renderBuiltInDoctorPrompt(profile, layout));
}

function copyDirectoryRecursive(sourceDir: string, targetDir: string) {
  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = resolve(sourceDir, entry.name);
    const targetPath = resolve(targetDir, entry.name);
    if (entry.isDirectory()) {
      mkdirSync(targetPath, { recursive: true });
      copyDirectoryRecursive(sourcePath, targetPath);
      continue;
    }
    copyFileSync(sourcePath, targetPath);
  }
}

function listCatalogManifestPaths(rootDir: string): string[] {
  const entries: string[] = [];
  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    const entryPath = resolve(rootDir, entry.name);
    if (entry.isDirectory()) {
      entries.push(...listCatalogManifestPaths(entryPath));
      continue;
    }
    if (entry.isFile() && entry.name === 'catalog-entry.json') {
      entries.push(entryPath);
    }
  }
  return entries;
}

function writeFileIfMissing(path: string, content: string) {
  if (existsSync(path)) {
    return;
  }
  writeFileSync(path, content, 'utf8');
}

function renderProjectNomosAuthoringSpec(input: {
  projectId: string;
  projectName: string;
  repoPath?: string | null;
  nomosId?: string | null;
}) {
  return [
    '---',
    `project_id: ${tomlString(input.projectId)}`,
    `project_name: ${tomlString(input.projectName)}`,
    `base_nomos_id: ${tomlString(input.nomosId ?? DEFAULT_AGORA_NOMOS_ID)}`,
    `project_shape: ${tomlString(input.repoPath ? 'existing_repo' : 'no_repo')}`,
    `repo_path: ${tomlString(input.repoPath ?? '')}`,
    'purpose: ""',
    `lifecycle_modules: ${tomlStringArray(DEFAULT_CUSTOM_NOMOS_PACK_LIFECYCLE_MODULES)}`,
    `doctor_checks: ${tomlStringArray(DEFAULT_CUSTOM_NOMOS_PACK_DOCTOR_CHECKS)}`,
    'methodology_keep: []',
    'methodology_change: []',
    'open_questions: []',
    '---',
    '',
    '# Project Nomos Authoring Spec',
    '',
    `Project: \`${input.projectId}\` (${input.projectName})`,
    '',
    'Use this file to capture the interview outputs that should shape the project-specific Nomos draft.',
    '',
    `- Installed baseline Nomos: \`${input.nomosId ?? 'agora/default'}\``,
    `- Repo path: ${input.repoPath ? `\`${input.repoPath}\`` : 'none yet'}`,
    '',
    'Fill these sections during the Nomos authoring task:',
    '- Project shape and current working surface',
    '- Which default methodologies should stay or change',
    '- Lifecycle modules and approval rules',
    '- Governance / doctor expectations',
    '- Open questions that still block final Nomos refinement',
    '',
  ].join('\n');
}

function renderNomosPackTemplateProfileToml(input: {
  id: string;
  name: string;
  description: string;
  version: string;
  lifecycleModules: readonly string[];
  doctorChecks: readonly string[];
}) {
  return [
    `id = ${tomlString(input.id)}`,
    `name = ${tomlString(input.name)}`,
    `version = ${tomlString(input.version)}`,
    `description = ${tomlString(input.description)}`,
    '',
    '[constitution]',
    'entry = "constitution/constitution.md"',
    '',
    '[docs]',
    'root = "docs"',
    '',
    '[docs.skeleton]',
    'create_if_missing = ["architecture", "planning", "walkthrough", "qa", "security", "reference"]',
    '',
    '[lifecycle]',
    `modules = ${tomlStringArray(input.lifecycleModules)}`,
    '',
    '[install]',
    'default_mode = "copy_on_install"',
    '',
    '[doctor]',
    `checks = ${tomlStringArray(input.doctorChecks)}`,
    '',
  ].join('\n');
}

function renderCustomNomosReadme(input: {
  id: string;
  name: string;
  description: string;
  version: string;
  lifecycleModules: readonly string[];
}) {
  return [
    `# ${input.name}`,
    '',
    input.description,
    '',
    '## Pack Metadata',
    '',
    `- id: \`${input.id}\``,
    `- version: \`${input.version}\``,
    `- lifecycle modules: ${input.lifecycleModules.join(', ')}`,
    '',
    '## Intent',
    '',
    'Use this Nomos when a project should start from this methodology and lifecycle baseline.',
    '',
  ].join('\n');
}

function renderCustomNomosConstitution(input: { name: string; description: string }) {
  return [
    `# ${input.name} Constitution`,
    '',
    input.description,
    '',
    'Define the pack-level rules this Nomos should enforce across projects.',
    '',
    '- Keep the constitution reusable across more than one project.',
    '- Push project-specific facts into installed project state, not into the pack itself.',
    '',
  ].join('\n');
}

function renderCustomNomosMethodologies(input: { name: string; lifecycleModules: readonly string[] }) {
  return [
    '# Methodologies',
    '',
    `${input.name} starts projects from these default methodologies:`,
    '',
    '- Interview before filling project-specific context.',
    '- Keep repo-root `AGENTS.md` thin and route detailed content into global project state.',
    `- Default lifecycle modules: ${input.lifecycleModules.join(', ')}.`,
    '',
  ].join('\n');
}

function renderCustomNomosBootstrapInterview(input: { name: string; description: string }) {
  return [
    `# ${input.name} Bootstrap Interview`,
    '',
    input.description,
    '',
    'Interview for pack-level methodology and install defaults, not one project’s private facts.',
    '',
    '- What kind of projects is this Nomos for?',
    '- What repo/project-state shape should it start from?',
    '- What lifecycle/governance defaults should it enforce?',
    '',
  ].join('\n');
}

function renderRefinedProjectNomosMethodologies(spec: ProjectNomosAuthoringSpec) {
  return [
    '# Methodologies',
    '',
    `${spec.project_name} Nomos should start from these decisions:`,
    '',
    spec.methodology_keep.length > 0 ? `Keep:` : 'Keep: (none yet)',
    ...renderListOrPlaceholder(spec.methodology_keep),
    '',
    spec.methodology_change.length > 0 ? 'Change:' : 'Change: (none yet)',
    ...renderListOrPlaceholder(spec.methodology_change),
    '',
    `Lifecycle modules: ${spec.lifecycle_modules.join(', ')}`,
    `Doctor checks: ${spec.doctor_checks.join(', ')}`,
    '',
  ].join('\n');
}

function renderRefinedProjectNomosBootstrapInterview(spec: ProjectNomosAuthoringSpec) {
  return [
    `# ${spec.project_name} Nomos Bootstrap Interview`,
    '',
    spec.purpose.trim() || 'Refine this project-specific Nomos from the interview outputs captured in the authoring spec.',
    '',
    `Project shape: \`${spec.project_shape}\``,
    `Repo path: ${spec.repo_path ? `\`${spec.repo_path}\`` : 'none yet'}`,
    '',
    'Open questions:',
    ...renderListOrPlaceholder(spec.open_questions),
    '',
  ].join('\n');
}

function renderCustomNomosLifecycleDoc(module: NomosLifecycleModule, name: string) {
  switch (module) {
    case 'project-bootstrap':
      return `# Project Bootstrap Lifecycle\n\nDefine how ${name} initializes a new project and what the first interview must cover.\n`;
    case 'task-context-delivery':
      return `# Task Context Delivery Lifecycle\n\nDefine how ${name} materializes audience-specific context into task workspaces and briefs.\n`;
    case 'task-closeout':
      return `# Task Closeout Lifecycle\n\nDefine how ${name} collects harvest drafts, review gates, and archive transitions after task completion.\n`;
    case 'project-archive':
      return `# Project Archive Lifecycle\n\nDefine how ${name} archives or deletes completed projects and what checks are required first.\n`;
    case 'governance-doctor':
      return `# Governance Doctor Lifecycle\n\nDefine how ${name} audits constitution, docs, lifecycle, and drift health.\n`;
  }
}

function renderCustomNomosCloseoutPrompt(name: string) {
  return [
    `# ${name} Closeout Review`,
    '',
    'Summarize what should be harvested back into project state before archive approval.',
    '',
  ].join('\n');
}

function renderCustomNomosDoctorPrompt(name: string) {
  return [
    `# ${name} Doctor`,
    '',
    'Review constitution, docs, lifecycle, and drift signals for this Nomos installation.',
    '',
  ].join('\n');
}

function buildBuiltInActiveNomosSummary(projectStateRoot: string, profilePath: string): ProjectNomosPackSummary {
  return {
    pack_id: BUILT_IN_AGORA_NOMOS_PACK.id,
    name: BUILT_IN_AGORA_NOMOS_PACK.name,
    version: BUILT_IN_AGORA_NOMOS_PACK.version,
    description: BUILT_IN_AGORA_NOMOS_PACK.description,
    lifecycle_modules: [...NOMOS_LIFECYCLE_MODULES],
    doctor_checks: [
      'repo-shim-present',
      'project-state-layout-complete',
      'constitution-present',
      'docs-skeleton-complete',
      'bootstrap-prompts-present',
    ],
    source: BUILT_IN_AGORA_NOMOS_PACK.source,
    root: projectStateRoot,
    profile_path: profilePath,
  };
}

function resolveCatalogPackRoot(
  requestedPackId: string | null,
  projectId: string,
  metadata: Record<string, unknown> | null | undefined,
  target: 'draft' | 'active',
  options: ResolveAgoraProjectStateOptions = {},
): string {
  const state = resolveProjectNomosState(projectId, metadata, options);
  const pack = resolveProjectNomosPackForTarget(projectId, state, target);
  const packId = requestedPackId?.trim() || pack?.pack_id;
  if (!packId) {
    throw new Error(`Cannot resolve published Nomos pack id for ${projectId}.`);
  }
  return resolveCatalogPackDir(packId, options);
}

function resolveCatalogPackDir(packId: string, options: ResolveAgoraProjectStateOptions = {}) {
  const layout = resolveAgoraNomosCatalogLayout(options);
  const segments = packId.split('/').map((segment) => segment.trim()).filter(Boolean);
  if (segments.length === 0) {
    throw new Error(`Nomos pack id is invalid: ${packId}`);
  }
  return resolve(layout.packsRoot, ...segments);
}

function resolveCatalogManifestPath(packId: string, options: ResolveAgoraProjectStateOptions = {}) {
  return resolve(resolveCatalogPackDir(packId, options), 'catalog-entry.json');
}

function resolveProjectNomosPackForTarget(
  projectId: string,
  state: ResolvedProjectNomosState,
  target: ProjectNomosValidationTarget | 'active',
): ProjectNomosPackSummary | null {
  if (target === 'active') {
    return state.activation_status === 'active_project'
      ? loadProjectNomosPackSummary(state.active_root, state.active_profile_path, 'project_state_draft')
      : buildBuiltInActiveNomosSummary(state.project_state_root, state.profile_path);
  }
  if (target === 'draft') {
    return loadProjectNomosPackSummary(state.draft_root, state.draft_profile_path, 'project_state_draft');
  }
  return buildBuiltInActiveNomosSummary(state.project_state_root, state.profile_path);
}

function loadProjectNomosPackSummary(
  root: string,
  profilePath: string,
  source: string,
): ProjectNomosPackSummary | null {
  if (!existsSync(profilePath)) {
    return null;
  }

  const parsed = parseSimpleToml(readFileSync(profilePath, 'utf8'));
  const packId = asTomlRequiredString(parsed.root.id, 'id');
  const name = asTomlRequiredString(parsed.root.name, 'name');
  const version = asTomlRequiredString(parsed.root.version, 'version');
  const description = asTomlRequiredString(parsed.root.description, 'description');
  const lifecycleModules = asTomlStringArray(parsed.sections.lifecycle?.modules, 'lifecycle.modules');
  const doctorChecks = asTomlStringArray(parsed.sections.doctor?.checks, 'doctor.checks');

  return {
    pack_id: packId,
    name,
    version,
    description,
    lifecycle_modules: lifecycleModules,
    doctor_checks: doctorChecks,
    source,
    root,
    profile_path: profilePath,
  };
}

function loadPublishedNomosCatalogEntry(manifestPath: string): PublishedNomosCatalogEntry {
  if (!existsSync(manifestPath)) {
    throw new Error(`Nomos catalog manifest is missing: ${manifestPath}`);
  }
  const raw = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
  const pack = asRecord(raw.pack);
  return {
    schema_version: 1,
    pack_id: asRequiredString(raw.pack_id, 'pack_id'),
    published_at: asRequiredString(raw.published_at, 'published_at'),
    source_kind: asPublishedNomosSourceKind(raw.source_kind),
    published_by: asOptionalString(raw.published_by),
    published_note: asOptionalString(raw.published_note),
    source_project_id: asRequiredString(raw.source_project_id, 'source_project_id'),
    source_target: (asRequiredString(raw.source_target, 'source_target') === 'active' ? 'active' : 'draft'),
    source_activation_status: ((asRequiredString(raw.source_activation_status, 'source_activation_status') === 'active_project') ? 'active_project' : 'active_builtin'),
    source_repo_path: asOptionalString(raw.source_repo_path),
    published_root: asRequiredString(raw.published_root, 'published_root'),
    manifest_path: asRequiredString(raw.manifest_path, 'manifest_path'),
    pack: {
      pack_id: asRequiredString(pack.pack_id, 'pack.pack_id'),
      name: asRequiredString(pack.name, 'pack.name'),
      version: asRequiredString(pack.version, 'pack.version'),
      description: asRequiredString(pack.description, 'pack.description'),
      lifecycle_modules: asStringArray(pack.lifecycle_modules),
      doctor_checks: asStringArray(pack.doctor_checks),
      source: asRequiredString(pack.source, 'pack.source'),
      root: asRequiredString(pack.root, 'pack.root'),
      profile_path: asRequiredString(pack.profile_path, 'pack.profile_path'),
    },
  };
}

function loadNomosShareBundleManifest(manifestPath: string): NomosShareBundleManifest {
  if (!existsSync(manifestPath)) {
    throw new Error(`Nomos share bundle manifest is missing: ${manifestPath}`);
  }
  const raw = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
  const pack = asRecord(raw.pack);
  const source = asRecord(raw.source);
  return {
    schema_version: 1,
    bundle_kind: 'nomos_share_bundle',
    exported_at: asRequiredString(raw.exported_at, 'exported_at'),
    pack: {
      pack_id: asRequiredString(pack.pack_id, 'pack.pack_id'),
      name: asRequiredString(pack.name, 'pack.name'),
      version: asRequiredString(pack.version, 'pack.version'),
      description: asRequiredString(pack.description, 'pack.description'),
      lifecycle_modules: asStringArray(pack.lifecycle_modules),
      doctor_checks: asStringArray(pack.doctor_checks),
      source: asRequiredString(pack.source, 'pack.source'),
    },
    source: {
      catalog_pack_id: asRequiredString(source.catalog_pack_id, 'source.catalog_pack_id'),
      source_project_id: asRequiredString(source.source_project_id, 'source.source_project_id'),
      source_target: (asRequiredString(source.source_target, 'source.source_target') === 'active' ? 'active' : 'draft'),
      source_activation_status: ((asRequiredString(source.source_activation_status, 'source.source_activation_status') === 'active_project') ? 'active_project' : 'active_builtin'),
      source_repo_path: asOptionalString(source.source_repo_path),
      published_by: asOptionalString(source.published_by),
      published_note: asOptionalString(source.published_note),
    },
  };
}

function asPublishedNomosSourceKind(value: unknown): PublishedNomosCatalogEntry['source_kind'] {
  if (value === 'share_bundle' || value === 'pack_root' || value === 'project_publish') {
    return value;
  }
  return 'project_publish';
}

function buildPublishedCatalogSummary(entry: PublishedNomosCatalogEntry): PublishedNomosCatalogSummary {
  return {
    pack_id: entry.pack_id,
    name: entry.pack.name,
    version: entry.pack.version,
    description: entry.pack.description,
    published_at: entry.published_at,
    source_kind: entry.source_kind,
    published_by: entry.published_by,
    source_project_id: entry.source_project_id,
    source_target: entry.source_target,
    source_repo_path: entry.source_repo_path,
  };
}

function asRequiredString(value: unknown, field: string) {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  throw new Error(`Project Nomos authoring spec is missing ${field}`);
}

function asOptionalString(value: unknown) {
  return typeof value === 'string' ? value : null;
}

function asStringArray(value: unknown, fallback: readonly string[] = []) {
  if (!value) {
    return [...fallback];
  }
  if (!Array.isArray(value)) {
    throw new Error('Project Nomos authoring spec expected an array value');
  }
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function asProjectShape(value: unknown): ProjectNomosAuthoringSpec['project_shape'] {
  if (value === 'existing_repo' || value === 'new_repo' || value === 'no_repo') {
    return value;
  }
  throw new Error(`Unsupported project_shape: ${String(value)}`);
}

function asLifecycleModules(value: unknown) {
  const items = asStringArray(value, DEFAULT_CUSTOM_NOMOS_PACK_LIFECYCLE_MODULES);
  const modules: NomosLifecycleModule[] = [];
  for (const item of items) {
    if (!NOMOS_LIFECYCLE_MODULES.includes(item as NomosLifecycleModule)) {
      throw new Error(`Unsupported Nomos lifecycle module: ${item}`);
    }
    modules.push(item as NomosLifecycleModule);
  }
  return modules;
}

function renderListOrPlaceholder(values: readonly string[]) {
  if (values.length === 0) {
    return ['- none yet'];
  }
  return values.map((value) => `- ${value}`);
}

function isSameNomosFieldValue(a: unknown, b: unknown) {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }
    const left = [...a].map((value) => String(value)).sort();
    const right = [...b].map((value) => String(value)).sort();
    return left.every((value, index) => value === right[index]);
  }
  return a === b;
}

function isWithinParent(target: string, parent: string) {
  const resolvedTarget = resolve(target);
  const resolvedParent = resolve(parent);
  return resolvedTarget === resolvedParent || resolvedTarget.startsWith(`${resolvedParent}/`);
}

function assertSafeRemovePath(
  target: string,
  options: {
    label: string;
    allowedParents?: string[];
    requirePackMarker?: boolean;
  },
) {
  const resolvedTarget = resolve(target);
  const forbidden = new Set([
    resolve('/'),
    resolve(homedir()),
    resolve(process.cwd()),
  ]);
  if (!resolvedTarget || forbidden.has(resolvedTarget)) {
    throw new Error(`Refusing to remove unsafe path for ${options.label}: ${resolvedTarget}`);
  }
  if (options.allowedParents?.some((parent) => isWithinParent(resolvedTarget, parent))) {
    return;
  }
  if (options.requirePackMarker && existsSync(resolve(resolvedTarget, 'profile.toml'))) {
    return;
  }
  throw new Error(`Refusing to remove path outside allowed scope for ${options.label}: ${resolvedTarget}`);
}

function removeDirectoryTree(
  target: string,
  options: {
    label: string;
    allowedParents?: string[];
    requirePackMarker?: boolean;
  },
) {
  assertSafeRemovePath(target, options);
  rmSync(target, { recursive: true, force: true });
}

function asTomlRequiredString(value: unknown, field: string) {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  throw new Error(`Nomos pack profile is missing ${field}`);
}

function asTomlStringArray(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    throw new Error(`Nomos pack profile is missing ${field}`);
  }
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function renderBuiltInConstitution(profile: NomosProjectProfile) {
  return [
    '# Agora Default Nomos Constitution',
    '',
    `This project uses ${profile.pack.name} (\`${profile.pack.id}@${profile.pack.version}\`).`,
    '',
    '- Use first-principles reasoning before proposing changes.',
    '- Do not assume missing requirements or constraints.',
    '- Do not treat uncertain statements as confirmed facts.',
    '- Do not claim completion without verification.',
    '- Keep the repo-facing shim thin and move durable project knowledge into global project state.',
    '- Treat project brain, docs harness, lifecycle, and governance as one operating system.',
    '',
    'Default operating stance:',
    '- CLI and REST are the primary automation/control surfaces.',
    '- Repo-root `AGENTS.md` is an index, not the project body.',
    '- The global project state is the durable harness body.',
    '- Planning, walkthrough, QA, and security artifacts are expected parts of delivery.',
    '',
  ].join('\n');
}

function renderBuiltInReferenceIndex(profile: NomosProjectProfile) {
  return [
    '# Nomos Reference Index',
    '',
    `Nomos pack: \`${profile.pack.id}@${profile.pack.version}\``,
    '',
    'Use this directory for project-specific reference material produced during bootstrap and later execution.',
    '',
    'Built-in defaults shipped with Agora Default Nomos:',
    '- current-surface.md',
    '- methodologies.md',
    '- governance.md',
    '- lifecycle.md',
    '- bootstrap-fields.md',
    '',
    'Expected follow-up documents:',
    '- constraints.md',
    '- open-questions.md',
    '- domain references that become durable execution inputs',
    '',
  ].join('\n');
}

function renderBuiltInMethodologiesReference(profile: NomosProjectProfile) {
  return [
    '# Methodologies',
    '',
    `Record the project-specific methodologies discovered while bootstrapping ${profile.pack.name}.`,
    '',
    'Agora Default Nomos starts from these defaults:',
    '- First-principles / proposal discipline',
    '- Planning trio + SSoT + walkthrough loop',
    '- Evidence-before-assertion verification',
    '- CLI-first, REST-second, plugin bridge for human IM use',
    '- Closeout before archive; harvest before deletion',
    '',
    'Refine these sections for the current project:',
    '- Proposal discipline',
    '- Planning and documentation loop',
    '- Verification expectations',
    '- Runtime / IM bridge expectations',
    '- Release, closeout, and archive discipline',
    '',
  ].join('\n');
}

function renderBuiltInCurrentSurfaceReference(profile: NomosProjectProfile) {
  return [
    '# Current Surface',
    '',
    `Capture the current project reality for \`${profile.project.id}\`.`,
    '',
    'Suggested sections:',
    '- Code or asset roots',
    '- Active tools and runtimes',
    '- Existing docs and reference material',
    '- Known owners and operators',
    '- Current IM / runtime / automation entry surfaces',
    '',
  ].join('\n');
}

function renderBuiltInGovernanceReference(profile: NomosProjectProfile) {
  return [
    '# Governance',
    '',
    `Capture how ${profile.pack.name} should be enforced inside this project.`,
    '',
    'Default governance expectations:',
    '- Non-trivial work should have planning artifacts.',
    '- Completion claims require tests, smoke, or other verification evidence.',
    '- Important lifecycle transitions should write durable docs or brain updates.',
    '- Human approval remains reserved for true review/approval gates.',
    '',
    'Project-specific additions belong here, not in `AGENTS.md`.',
    '',
  ].join('\n');
}

function renderBuiltInLifecycleReference(profile: NomosProjectProfile) {
  return [
    '# Lifecycle Reference',
    '',
    `Document how ${profile.pack.name} expects work to move through the project lifecycle.`,
    '',
    'Lifecycle modules shipped by default:',
    '- project-bootstrap',
    '- task-context-delivery',
    '- task-closeout',
    '- project-archive',
    '- governance-doctor',
    '',
    'Use the lifecycle directory for module-level operating rules and refinements.',
    '',
  ].join('\n');
}

function renderBuiltInBootstrapFieldsReference(profile: NomosProjectProfile) {
  return [
    '# Bootstrap Fields',
    '',
    `Use this file to capture the methodology fields that ${profile.pack.name} expects to fill during bootstrap.`,
    '',
    'Required bootstrap fields:',
    '- Project shape (existing repo / new repo / no repo)',
    '- Current surface and working roots',
    '- Known constraints and non-negotiable decisions',
    '- Methodologies for planning, execution, and verification',
    '- Governance expectations and approval boundaries',
    '- Open questions that should stay visible after bootstrap',
    '',
    'This file is a declaration/reference, not the interview script itself.',
    '',
  ].join('\n');
}

function renderBuiltInOperatingModelArchitecture(profile: NomosProjectProfile, layout: AgoraProjectStateLayout) {
  return [
    '# Operating Model',
    '',
    `This architecture note explains how ${profile.pack.name} treats the project operating surfaces.`,
    '',
    'Three surfaces:',
    '- Repo surface: execution surface, code, and the thin `AGENTS.md` shim.',
    `- Global project state: durable harness body under \`${layout.root}\`.`,
    '- Runtime/control state: database, sessions, queues, and live adapter state.',
    '',
    'Default rule:',
    '- Keep repo-facing instructions thin.',
    '- Keep durable context, methodologies, and lifecycle artifacts in global project state.',
    '- Keep runtime state out of the durable docs layer.',
    '',
  ].join('\n');
}

function renderBuiltInBootstrapInterviewPrompt(profile: NomosProjectProfile, layout: AgoraProjectStateLayout) {
  return [
    '# Harness Bootstrap Interview',
    '',
    `You are bootstrapping ${profile.pack.name} for project \`${profile.project.id}\`.`,
    '',
    'Objectives:',
    '- Identify the current project surface before changing process.',
    '- Fill the global project-state harness docs and project brain.',
    '- Establish the initial methodologies, constraints, and open questions.',
    '',
    'Write outputs into:',
    `- ${layout.brainDir}`,
    `- ${layout.docsReferenceDir}`,
    `- ${layout.docsArchitectureDir}`,
    `- ${layout.docsPlanningDir}`,
    '',
    'Bootstrap references:',
    `- Field declarations: ${layout.docsReferenceBootstrapFieldsPath}`,
    `- Governance defaults: ${layout.docsReferenceGovernancePath}`,
    `- Lifecycle defaults: ${layout.docsReferenceLifecyclePath}`,
    '',
    'Interview prompts:',
    '1. What already exists today?',
    '2. Where is the code or working surface?',
    '3. What constraints are already known?',
    '4. What decisions are already fixed?',
    '5. What remains unknown and must be tracked as open questions?',
    '6. Which parts of the default Agora methodologies should stay, and which must be customized?',
    '',
    'Branch prompts:',
    `- Existing repo flow: ${layout.bootstrapExistingProjectPromptPath}`,
    `- New repo flow: ${layout.bootstrapNewProjectPromptPath}`,
    `- No-repo flow: ${layout.bootstrapNoRepoPromptPath}`,
    '',
  ].join('\n');
}

function renderBuiltInExistingProjectPrompt(layout: AgoraProjectStateLayout) {
  return [
    '# Existing Project Bootstrap',
    '',
    'Use this branch when the user already has a code or working repository.',
    '',
    'Collect:',
    '- Repo path and current branch state',
    '- Existing docs, tests, and build commands',
    '- What should remain in the repo vs move into global project state',
    '- Which governance/doc harness defaults already exist and should be preserved',
    '',
    'Write findings into:',
    `- ${layout.docsReferenceCurrentSurfacePath}`,
    `- ${layout.docsReferenceMethodologiesPath}`,
    `- ${layout.docsArchitectureOperatingModelPath}`,
    '',
  ].join('\n');
}

function renderBuiltInNewProjectPrompt(layout: AgoraProjectStateLayout) {
  return [
    '# New Project Bootstrap',
    '',
    'Use this branch when Agora is initializing a brand new repository or working directory.',
    '',
    'Collect:',
    '- What kind of repo should be created',
    '- Initial stack and toolchain expectations',
    '- Which docs and governance skeletons should be filled first',
    '- What the first durable reference set should contain before implementation starts',
    '',
    'Write findings into:',
    `- ${layout.docsReferenceCurrentSurfacePath}`,
    `- ${layout.docsReferenceMethodologiesPath}`,
    `- ${layout.docsArchitectureOperatingModelPath}`,
    '',
  ].join('\n');
}

function renderBuiltInNoRepoPrompt(layout: AgoraProjectStateLayout) {
  return [
    '# No-Repo Bootstrap',
    '',
    'Use this branch when the project is not code-first or no repo exists yet.',
    '',
    'Collect:',
    '- The current project surface and outputs',
    '- What should be tracked as durable reference material',
    '- Whether a repo should exist later and what would trigger it',
    '- Which default Agora methodologies still apply to this non-code-first project',
    '',
    'Write findings into:',
    `- ${layout.docsReferenceCurrentSurfacePath}`,
    `- ${layout.docsReferenceMethodologiesPath}`,
    `- ${layout.docsArchitectureOperatingModelPath}`,
    '',
  ].join('\n');
}

function renderBuiltInCloseoutReviewPrompt(profile: NomosProjectProfile) {
  return [
    '# Harness Closeout Review',
    '',
    `Use this prompt when closing tasks under ${profile.pack.name}.`,
    '',
    '- Review what should be harvested back into project brain.',
    '- Identify docs/reference updates required by the task.',
    '- Confirm whether archive can proceed.',
    '- Keep task-local state temporary; move durable learnings into project state.',
    '',
  ].join('\n');
}

function renderBuiltInDoctorPrompt(profile: NomosProjectProfile, layout: AgoraProjectStateLayout) {
  return [
    '# Project Doctor',
    '',
    `Use this prompt when diagnosing ${profile.pack.name} health for project \`${profile.project.id}\`.`,
    '',
    'Check:',
    '- Repo shim presence and routing correctness',
    '- Project-state layout completeness',
    '- Bootstrap prompt and lifecycle prompt presence',
    '- Brain/index/doctor dependent services if configured',
    '- Drift between lifecycle expectations and current project state',
    '',
    'Primary inspection roots:',
    `- ${layout.root}`,
    `- ${layout.docsReferenceDir}`,
    `- ${layout.lifecycleDir}`,
    '',
  ].join('\n');
}

function renderBuiltInProjectBootstrapLifecycle(layout: AgoraProjectStateLayout) {
  return [
    '# Project Bootstrap Lifecycle',
    '',
    'Responsibilities:',
    '- Install the built-in Agora Nomos skeleton.',
    '- Bind repo and global project state.',
    '- Spawn the harness bootstrap task.',
    '- Seed the first durable project references and brain scaffolds.',
    '',
    `Primary prompts live under \`${layout.bootstrapPromptsDir}\`.`,
    '',
  ].join('\n');
}

function renderBuiltInTaskContextDeliveryLifecycle(layout: AgoraProjectStateLayout) {
  return [
    '# Task Context Delivery Lifecycle',
    '',
    'Responsibilities:',
    '- Materialize audience-specific context artifacts for controller, craftsman, and citizen.',
    '- Keep task execution briefs pointed at the correct audience artifact.',
    '- Refresh task context when project/task bindings or lifecycle state changes.',
    '',
    `Task-local artifacts remain under \`${layout.tasksDir}\`, while durable knowledge belongs in \`${layout.brainDir}\`.`,
    '',
  ].join('\n');
}

function renderBuiltInTaskCloseoutLifecycle(layout: AgoraProjectStateLayout) {
  return [
    '# Task Closeout Lifecycle',
    '',
    'Responsibilities:',
    '- Produce harvest drafts for project-bound tasks.',
    '- Gate archive behind review-pending approval.',
    '- Push durable outputs back into project brain and harness docs before cleanup.',
    '',
    `Closeout prompts live under \`${layout.closeoutPromptsDir}\`.`,
    '',
  ].join('\n');
}

function renderBuiltInProjectArchiveLifecycle(layout: AgoraProjectStateLayout) {
  return [
    '# Project Archive Lifecycle',
    '',
    'Responsibilities:',
    '- Allow project archive only after active task constraints are satisfied.',
    '- Keep project archive/delete semantics explicit and fail-closed.',
    '- Preserve global project state as the durable record of the project harness.',
    '',
    `Archive projections and history belong under \`${layout.archiveDir}\`.`,
    '',
  ].join('\n');
}

function renderBuiltInGovernanceDoctorLifecycle(layout: AgoraProjectStateLayout) {
  return [
    '# Governance Doctor Lifecycle',
    '',
    'Responsibilities:',
    '- Diagnose harness completeness and lifecycle drift.',
    '- Surface missing prompts, missing profile/repo shim state, and project-brain health issues.',
    '- Provide an operator-facing health summary without mutating durable state.',
    '',
    `Doctor prompts live under \`${layout.doctorPromptsDir}\`.`,
    '',
  ].join('\n');
}
