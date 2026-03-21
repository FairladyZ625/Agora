import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
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

export interface ResolveAgoraProjectStateOptions extends Pick<EnsureBundledAgoraAssetsOptions, 'userAgoraDir'> {}

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
  closeoutPromptsDir: string;
  doctorPromptsDir: string;
  closeoutReviewPromptPath: string;
  constitutionEntryPath: string;
  docsReferenceIndexPath: string;
  scriptsDir: string;
  skillsDir: string;
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
  repoShimWritten: boolean;
  repoGitInitialized: boolean;
  projectStateGitInitialized: boolean;
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
    closeoutPromptsDir: resolve(promptsDir, 'closeout'),
    doctorPromptsDir: resolve(promptsDir, 'doctor'),
    closeoutReviewPromptPath: resolve(promptsDir, 'closeout', 'review.md'),
    constitutionEntryPath: resolve(root, 'constitution', 'constitution.md'),
    docsReferenceIndexPath: resolve(docsRoot, 'reference', 'README.md'),
    scriptsDir: resolve(root, 'scripts'),
    skillsDir: resolve(root, 'skills'),
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
  writeFileIfMissing(layout.bootstrapInterviewPromptPath, renderBuiltInBootstrapInterviewPrompt(profile, layout));
  writeFileIfMissing(layout.closeoutReviewPromptPath, renderBuiltInCloseoutReviewPrompt(profile));
}

function writeFileIfMissing(path: string, content: string) {
  if (existsSync(path)) {
    return;
  }
  writeFileSync(path, content, 'utf8');
}

function renderBuiltInConstitution(profile: NomosProjectProfile) {
  return [
    '# General Constitution',
    '',
    `This project uses ${profile.pack.name} (\`${profile.pack.id}@${profile.pack.version}\`).`,
    '',
    '- Use first-principles reasoning before proposing changes.',
    '- Do not assume missing requirements or constraints.',
    '- Do not treat uncertain statements as confirmed facts.',
    '- Do not claim completion without verification.',
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
    'Suggested first documents:',
    '- current-surface.md',
    '- methodologies.md',
    '- constraints.md',
    '- open-questions.md',
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
    'Interview prompts:',
    '1. What already exists today?',
    '2. Where is the code or working surface?',
    '3. What constraints are already known?',
    '4. What decisions are already fixed?',
    '5. What remains unknown and must be tracked as open questions?',
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
    '',
  ].join('\n');
}
