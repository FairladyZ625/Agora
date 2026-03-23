import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { resolveUserAgoraDir, type EnsureBundledAgoraAssetsOptions } from './runtime-assets.js';

export const REPO_AGENTS_SHIM_SECTION_ORDER = [
  'general_constitution',
  'pack_index',
  'bootstrap_method',
  'fill_policy',
] as const;

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
  'brain',
  'tasks',
  'archive',
  'prompts/bootstrap',
  'prompts/closeout',
  'prompts/doctor',
  'scripts',
  'skills',
] as const;

export const NOMOS_LIFECYCLE_MODULES = [
  'project-bootstrap',
  'task-context-delivery',
  'task-closeout',
  'project-archive',
  'governance-doctor',
] as const;

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
  docsReferenceGovernancePath: string;
  docsReferenceLifecyclePath: string;
  docsReferenceBootstrapFieldsPath: string;
  docsArchitectureOperatingModelPath: string;
  scriptsDir: string;
  skillsDir: string;
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
}

export interface ScaffoldNomosPackResult {
  outputDir: string;
  profilePath: string;
  constitutionPath: string;
  readmePath: string;
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
] as const;

export const BUILT_IN_AGORA_NOMOS_ARCHITECTURE_DOCS = [
  'operating-model.md',
] as const;

export const BUILT_IN_AGORA_NOMOS_LIFECYCLE_DOCS = [
  'project-bootstrap.md',
  'task-context-delivery.md',
  'task-closeout.md',
  'project-archive.md',
  'governance-doctor.md',
] as const;

export const BUILT_IN_AGORA_NOMOS_BOOTSTRAP_PROMPTS = [
  'interview.md',
  'existing-project.md',
  'new-project.md',
  'no-repo.md',
] as const;

export const BUILT_IN_AGORA_NOMOS_CLOSEOUT_PROMPTS = [
  'review.md',
] as const;

export const BUILT_IN_AGORA_NOMOS_DOCTOR_PROMPTS = [
  'project.md',
] as const;

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

export function resolveAgoraProjectsDir(options: ResolveAgoraProjectStateOptions = {}) {
  return resolve(resolveUserAgoraDir(options), 'projects');
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
    docsReferenceGovernancePath: resolve(docsRoot, 'reference', 'governance.md'),
    docsReferenceLifecyclePath: resolve(docsRoot, 'reference', 'lifecycle.md'),
    docsReferenceBootstrapFieldsPath: resolve(docsRoot, 'reference', 'bootstrap-fields.md'),
    docsArchitectureOperatingModelPath: resolve(docsRoot, 'architecture', 'operating-model.md'),
    scriptsDir: resolve(root, 'scripts'),
    skillsDir: resolve(root, 'skills'),
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
        ...existingNomos,
      },
    },
  };
}

export function scaffoldNomosPack(options: ScaffoldNomosPackOptions): ScaffoldNomosPackResult {
  const lifecycleModules = Array.from(new Set(options.lifecycleModules ?? DEFAULT_CUSTOM_NOMOS_PACK_LIFECYCLE_MODULES));
  const doctorChecks = Array.from(new Set(options.doctorChecks ?? DEFAULT_CUSTOM_NOMOS_PACK_DOCTOR_CHECKS));
  const version = options.version?.trim() || '0.1.0';

  if (!existsSync(options.templateDir)) {
    throw new Error(`Nomos pack template not found: ${options.templateDir}`);
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

function tomlString(value: string) {
  return JSON.stringify(value);
}

function tomlStringArray(values: readonly string[]) {
  return `[${values.map((value) => tomlString(value)).join(', ')}]`;
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
  execFileSync('git', ['init', '--initial-branch=main'], {
    cwd: root,
    stdio: 'ignore',
  });
  return true;
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

function writeFileIfMissing(path: string, content: string) {
  if (existsSync(path)) {
    return;
  }
  writeFileSync(path, content, 'utf8');
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
