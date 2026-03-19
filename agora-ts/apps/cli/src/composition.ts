import { mkdirSync } from 'node:fs';
import {
  agoraDataDirPath,
  ensureBundledAgoraAssetsInstalled,
  hasInstalledBrainPack,
  loadAgoraConfig,
  normalizePathLikeEnvValue,
  resolveAgoraRuntimeEnvironmentFromConfigPackage,
  syncBundledBrainPackContents,
  type AgoraConfig,
} from '@agora-ts/config';
import { createAgoraDatabase, runMigrations, type AgoraDatabase } from '@agora-ts/db';
import { resolve as resolvePath } from 'node:path';
import { createDashboardSessionClient, type DashboardSessionClient } from './dashboard-session-client.js';
import {
  CitizenService,
  AcpCraftsmanInputPort,
  AcpCraftsmanProbePort,
  AcpCraftsmanTailPort,
  AcpRuntimeRecoveryPort,
  ClaudeCraftsmanAdapter,
  CodexCraftsmanAdapter,
  createDefaultCraftsmanAdapters,
  CraftsmanDispatcher,
  DirectAcpxRuntimePort,
  DashboardQueryService,
  FilesystemSkillCatalogAdapter,
  FilesystemProjectBrainQueryAdapter,
  FilesystemProjectKnowledgeAdapter,
  FilesystemTaskBrainWorkspaceAdapter,
  GeminiCraftsmanAdapter,
  GitWorktreeWorkdirIsolator,
  HumanAccountService,
  InventoryBackedAgentRuntimePort,
  OpenAiCompatibleProjectBrainEmbeddingAdapter,
  OpenClawCitizenProjectionAdapter,
  ProjectBrainAutomationService,
  ProjectBrainChunkingPolicy,
  ProjectBrainIndexService,
  ProjectBrainRetrievalService,
  OsHostResourcePort,
  ProjectBrainService,
  ProjectService,
  QdrantProjectBrainVectorIndexAdapter,
  StubIMMessagingPort,
  RolePackService,
  TaskBrainBindingService,
  TmuxCraftsmanInputPort,
  TmuxCraftsmanProbePort,
  TmuxCraftsmanTailPort,
  TmuxRuntimeRecoveryPort,
  type ProjectKnowledgePort,
  type ProjectBrainEmbeddingPort,
  type ProjectBrainVectorIndexPort,
  type CraftsmanInputPort,
  type CraftsmanExecutionProbePort,
  type CraftsmanExecutionTailPort,
  type RuntimeRecoveryPort,
  type TaskBrainWorkspacePort,
  resolveCraftsmanRuntimeMode,
  TaskContextBindingService,
  TaskConversationService,
  TaskParticipationService,
  TaskService,
  TemplateAuthoringService,
  TmuxRuntimeService,
  type AgentRuntimePort,
  type IMMessagingPort,
  type IMProvisioningPort,
} from '@agora-ts/core';
import { loadOpenClawDiscordAccountTokens, OpenClawAgentRegistry } from '@agora-ts/adapters-openclaw';
import { DiscordIMMessagingAdapter, DiscordIMProvisioningAdapter } from '@agora-ts/adapters-discord';

export interface CreateCliCompositionOptions {
  configPath?: string;
  dbPath?: string;
}

export interface CliCompositionContext {
  config: AgoraConfig;
  runtimeEnv: ReturnType<typeof resolveAgoraRuntimeEnvironmentFromConfigPackage>;
  db: AgoraDatabase;
  templatesDir: string;
  rolePackDir: string;
  brainPackDir: string;
}

export interface CliCompositionFactories {
  createCraftsmanDispatcher: (
    context: CliCompositionContext,
    deps?: {
      acpRuntime?: DirectAcpxRuntimePort;
    },
  ) => CraftsmanDispatcher;
  createAgentRuntimePort: (context: CliCompositionContext) => AgentRuntimePort;
  createIMMessagingPort: (context: CliCompositionContext) => IMMessagingPort;
  createIMProvisioningPort: (context: CliCompositionContext) => IMProvisioningPort | undefined;
  createTaskContextBindingService: (context: CliCompositionContext) => TaskContextBindingService;
  createProjectKnowledgePort: (context: CliCompositionContext) => ProjectKnowledgePort;
  createProjectService: (
    context: CliCompositionContext,
    deps: { projectKnowledgePort: ProjectKnowledgePort },
  ) => ProjectService;
  createProjectBrainService: (
    context: CliCompositionContext,
    deps: { projectService: ProjectService; citizenService: CitizenService },
  ) => ProjectBrainService;
  createProjectBrainAutomationService: (
    context: CliCompositionContext,
    deps: {
      projectBrainService: ProjectBrainService;
      taskBrainBindingService: TaskBrainBindingService;
      taskBrainWorkspacePort: TaskBrainWorkspacePort;
      retrievalService?: ProjectBrainRetrievalService;
    },
  ) => ProjectBrainAutomationService;
  createCitizenService: (
    context: CliCompositionContext,
    deps: { projectService: ProjectService; rolePackService: RolePackService },
  ) => CitizenService;
  createTaskParticipationService: (
    context: CliCompositionContext,
    deps: { agentRuntimePort: AgentRuntimePort },
  ) => TaskParticipationService;
  createTaskService: (
    context: CliCompositionContext,
    deps: {
      craftsmanDispatcher: CraftsmanDispatcher;
      taskBrainBindingService: TaskBrainBindingService;
      taskBrainWorkspacePort: TaskBrainWorkspacePort;
      imProvisioningPort: IMProvisioningPort | undefined;
      messagingPort: IMMessagingPort;
      taskContextBindingService: TaskContextBindingService;
      taskParticipationService: TaskParticipationService;
      projectBrainAutomationService: ProjectBrainAutomationService;
      projectService: ProjectService;
      agentRuntimePort: AgentRuntimePort;
      craftsmanInputPort: CraftsmanInputPort;
      craftsmanExecutionProbePort: CraftsmanExecutionProbePort;
      craftsmanExecutionTailPort: CraftsmanExecutionTailPort;
      runtimeRecoveryPort: RuntimeRecoveryPort;
    },
  ) => TaskService;
  createLegacyRuntimeService: (context: CliCompositionContext) => TmuxRuntimeService;
  createTmuxRuntimeService?: (context: CliCompositionContext) => TmuxRuntimeService;
  createDashboardSessionClient: (context: CliCompositionContext) => DashboardSessionClient;
  createHumanAccountService: (context: CliCompositionContext) => HumanAccountService;
  createTaskConversationService: (context: CliCompositionContext) => TaskConversationService;
  createTemplateAuthoringService: (context: CliCompositionContext) => TemplateAuthoringService;
  createRolePackService: (context: CliCompositionContext) => RolePackService;
  createDashboardQueryService: (context: CliCompositionContext) => DashboardQueryService;
  createTaskBrainBindingService: (context: CliCompositionContext) => TaskBrainBindingService;
  createTaskBrainWorkspacePort: (context: CliCompositionContext) => TaskBrainWorkspacePort;
  createProjectBrainEmbeddingPort: (context: CliCompositionContext) => ProjectBrainEmbeddingPort | undefined;
  createProjectBrainVectorIndexPort: (context: CliCompositionContext) => ProjectBrainVectorIndexPort | undefined;
  createProjectBrainIndexService: (
    context: CliCompositionContext,
    deps: {
      projectBrainService: ProjectBrainService;
      embeddingPort?: ProjectBrainEmbeddingPort;
      vectorIndexPort?: ProjectBrainVectorIndexPort;
    },
  ) => ProjectBrainIndexService | undefined;
  createProjectBrainRetrievalService: (
    context: CliCompositionContext,
    deps: {
      taskLookup: { getTask(taskId: string): ReturnType<TaskService['getTask']> };
      projectBrainService: ProjectBrainService;
      embeddingPort?: ProjectBrainEmbeddingPort;
      vectorIndexPort?: ProjectBrainVectorIndexPort;
    },
  ) => ProjectBrainRetrievalService | undefined;
}

export interface CliComposition {
  config: AgoraConfig;
  db: AgoraDatabase;
  taskService: TaskService;
  projectService: ProjectService;
  projectBrainService: ProjectBrainService;
  projectBrainAutomationService: ProjectBrainAutomationService;
  projectBrainIndexService?: ProjectBrainIndexService;
  projectBrainRetrievalService?: ProjectBrainRetrievalService;
  citizenService: CitizenService;
  legacyRuntimeService: TmuxRuntimeService;
  tmuxRuntimeService: TmuxRuntimeService;
  dashboardSessionClient: DashboardSessionClient;
  humanAccountService: HumanAccountService;
  taskConversationService: TaskConversationService;
  templateAuthoringService: TemplateAuthoringService;
  rolePackService: RolePackService;
  dashboardQueryService: DashboardQueryService;
  taskBrainBindingService: TaskBrainBindingService;
}

function ensureRuntimeBrainPackRoot(projectRoot: string): string {
  const explicitRoot = process.env.AGORA_BRAIN_PACK_ROOT;
  const runtimeBrainPackDir = explicitRoot
    ? resolvePath(explicitRoot)
    : resolvePath(agoraDataDirPath(), 'agora-ai-brain');
  const bundledBrainPackDir = resolvePath(projectRoot, 'agora-ai-brain');
  if (!hasInstalledBrainPack(runtimeBrainPackDir)) {
    syncBundledBrainPackContents(bundledBrainPackDir, runtimeBrainPackDir);
  }
  mkdirSync(resolvePath(runtimeBrainPackDir, 'tasks'), { recursive: true });
  return runtimeBrainPackDir;
}

export function createDefaultCliCompositionFactories(): CliCompositionFactories {
  return {
    createCraftsmanDispatcher: (context, deps) => {
      const mode = resolveCraftsmanRuntimeMode('cli');
      const acpRuntime = mode === 'acp' ? (deps?.acpRuntime ?? new DirectAcpxRuntimePort()) : undefined;
      const dispatcherOptions: ConstructorParameters<typeof CraftsmanDispatcher>[1] = {
        maxConcurrentRunning: context.config.craftsmen.max_concurrent_running,
        adapters: createDefaultCraftsmanAdapters({
          mode,
          callbackUrl: `${context.runtimeEnv.apiBaseUrl}/api/craftsmen/callback`,
          apiToken: context.config.api_auth.enabled ? context.config.api_auth.token : null,
          ...(acpRuntime ? { acpRuntime } : {}),
        }),
      };
      if (context.config.craftsmen.isolate_git_worktrees) {
        dispatcherOptions.workdirIsolator = new GitWorktreeWorkdirIsolator({
          rootDir: resolvePath(context.config.craftsmen.isolated_root),
        });
      }
      return new CraftsmanDispatcher(context.db, dispatcherOptions);
    },
    createAgentRuntimePort: () => {
      const registry = new OpenClawAgentRegistry(
        process.env.AGORA_OPENCLAW_CONFIG_PATH
          ? { configPath: process.env.AGORA_OPENCLAW_CONFIG_PATH }
          : {},
      );
      return new InventoryBackedAgentRuntimePort(registry);
    },
    createIMMessagingPort: (context) => {
      const { im } = context.config;
      if (im.provider === 'discord' && im.discord?.bot_token) {
        return new DiscordIMMessagingAdapter({ botToken: im.discord.bot_token });
      }
      return new StubIMMessagingPort();
    },
    createIMProvisioningPort: (context) => {
      const { im } = context.config;
      if (im.provider === 'discord' && im.discord?.bot_token && im.discord?.default_channel_id) {
        const accountTokens = loadOpenClawDiscordAccountTokens(
          process.env.AGORA_OPENCLAW_CONFIG_PATH
            ? { configPath: process.env.AGORA_OPENCLAW_CONFIG_PATH }
            : {},
        );
        const primaryAccountId = Object.entries(accountTokens).find(([, token]) => token === im.discord?.bot_token)?.[0] ?? null;
        return new DiscordIMProvisioningAdapter({
          botToken: im.discord.bot_token,
          defaultChannelId: im.discord.default_channel_id,
          participantTokens: accountTokens,
          primaryAccountId,
        });
      }
      return undefined;
    },
    createTaskContextBindingService: (context) => new TaskContextBindingService(context.db),
    createProjectKnowledgePort: (context) => new FilesystemProjectKnowledgeAdapter({
      brainPackRoot: context.brainPackDir,
    }),
    createProjectService: (context, deps) => new ProjectService(context.db, {
      knowledgePort: deps.projectKnowledgePort,
    }),
    createProjectBrainService: (context, deps) => new ProjectBrainService({
      projectService: deps.projectService,
      citizenService: deps.citizenService,
      projectBrainQueryPort: new FilesystemProjectBrainQueryAdapter({
        brainPackRoot: context.brainPackDir,
      }),
    }),
    createCitizenService: (context, deps) => new CitizenService(context.db, {
      projectService: deps.projectService,
      rolePackService: deps.rolePackService,
      projectionPorts: [new OpenClawCitizenProjectionAdapter()],
    }),
    createProjectBrainAutomationService: (_context, deps) => new ProjectBrainAutomationService({
      projectBrainService: deps.projectBrainService,
      taskBrainBindingService: deps.taskBrainBindingService,
      taskBrainWorkspacePort: deps.taskBrainWorkspacePort,
      ...(deps.retrievalService ? { retrievalService: deps.retrievalService } : {}),
    }),
    createTaskParticipationService: (context, deps) => new TaskParticipationService(context.db, {
      agentRuntimePort: deps.agentRuntimePort,
    }),
    createTaskService: (context, deps) => new TaskService(context.db, {
      archonUsers: context.config.permissions.archonUsers,
      allowAgents: context.config.permissions.allowAgents,
      craftsmanDispatcher: deps.craftsmanDispatcher,
      taskBrainBindingService: deps.taskBrainBindingService,
      taskBrainWorkspacePort: deps.taskBrainWorkspacePort,
      imMessagingPort: deps.messagingPort,
      taskContextBindingService: deps.taskContextBindingService,
      taskParticipationService: deps.taskParticipationService,
      projectBrainAutomationService: deps.projectBrainAutomationService,
      projectService: deps.projectService,
      agentRuntimePort: deps.agentRuntimePort,
      runtimeRecoveryPort: deps.runtimeRecoveryPort,
      craftsmanInputPort: deps.craftsmanInputPort,
      craftsmanExecutionProbePort: deps.craftsmanExecutionProbePort,
      craftsmanExecutionTailPort: deps.craftsmanExecutionTailPort,
      hostResourcePort: new OsHostResourcePort(),
      craftsmanGovernance: {
        maxConcurrentPerAgent: context.config.craftsmen.max_concurrent_per_agent,
        hostMemoryWarningUtilizationLimit: context.config.craftsmen.host_memory_warning_utilization_limit,
        hostMemoryUtilizationLimit: context.config.craftsmen.host_memory_utilization_limit,
        hostSwapWarningUtilizationLimit: context.config.craftsmen.host_swap_warning_utilization_limit,
        hostSwapUtilizationLimit: context.config.craftsmen.host_swap_utilization_limit,
        hostLoadPerCpuWarningLimit: context.config.craftsmen.host_load_per_cpu_warning_limit,
        hostLoadPerCpuLimit: context.config.craftsmen.host_load_per_cpu_limit,
      },
      escalationPolicy: {
        controllerAfterMs: context.config.scheduler.task_probe_controller_after_sec * 1000,
        rosterAfterMs: context.config.scheduler.task_probe_roster_after_sec * 1000,
        inboxAfterMs: context.config.scheduler.task_probe_inbox_after_sec * 1000,
      },
      ...(deps.imProvisioningPort ? { imProvisioningPort: deps.imProvisioningPort } : {}),
    }),
    createLegacyRuntimeService: () => new TmuxRuntimeService({
      adapters: {
        codex: new CodexCraftsmanAdapter(),
        claude: new ClaudeCraftsmanAdapter(),
        gemini: new GeminiCraftsmanAdapter(),
      },
    }),
    createTmuxRuntimeService: () => new TmuxRuntimeService({
      adapters: {
        codex: new CodexCraftsmanAdapter(),
        claude: new ClaudeCraftsmanAdapter(),
        gemini: new GeminiCraftsmanAdapter(),
      },
    }),
    createDashboardSessionClient: (context) => createDashboardSessionClient({
      apiBaseUrl: context.runtimeEnv.apiBaseUrl,
      sessionFilePath: resolvePath(context.runtimeEnv.projectRoot, '.agora-ts/dashboard-session.json'),
    }),
    createHumanAccountService: (context) => new HumanAccountService(context.db),
    createTaskConversationService: (context) => new TaskConversationService(context.db),
    createTemplateAuthoringService: (context) => new TemplateAuthoringService({
      db: context.db,
      templatesDir: context.templatesDir,
    }),
    createRolePackService: (context) => new RolePackService({
      db: context.db,
      rolePacksDir: context.rolePackDir,
    }),
    createDashboardQueryService: (context) => new DashboardQueryService(context.db, {
      templatesDir: context.templatesDir,
      skillCatalogPort: new FilesystemSkillCatalogAdapter(),
    }),
    createTaskBrainBindingService: (context) => new TaskBrainBindingService(context.db),
    createTaskBrainWorkspacePort: (context) => new FilesystemTaskBrainWorkspaceAdapter({
      brainPackRoot: context.brainPackDir,
    }),
    createProjectBrainEmbeddingPort: () => process.env.OPENAI_API_KEY
      ? new OpenAiCompatibleProjectBrainEmbeddingAdapter()
      : undefined,
    createProjectBrainVectorIndexPort: () => process.env.QDRANT_URL
      ? new QdrantProjectBrainVectorIndexAdapter(buildVectorIndexOptions())
      : undefined,
    createProjectBrainIndexService: (_context, deps) => deps.embeddingPort && deps.vectorIndexPort
      ? new ProjectBrainIndexService({
          projectBrainService: deps.projectBrainService,
          chunkingPolicy: new ProjectBrainChunkingPolicy(),
          embeddingPort: deps.embeddingPort,
          vectorIndexPort: deps.vectorIndexPort,
        })
      : undefined,
    createProjectBrainRetrievalService: (_context, deps) => deps.embeddingPort && deps.vectorIndexPort
      ? new ProjectBrainRetrievalService({
          taskLookup: deps.taskLookup,
          projectBrainService: deps.projectBrainService,
          embeddingPort: deps.embeddingPort,
          vectorIndexPort: deps.vectorIndexPort,
        })
      : undefined,
  };
}

export function createCliComposition(
  options: CreateCliCompositionOptions = {},
  overrides: Partial<CliCompositionFactories> = {},
): CliComposition {
  const config = loadAgoraConfig(options.configPath ?? normalizePathLikeEnvValue('AGORA_CONFIG_PATH', process.env.AGORA_CONFIG_PATH) ?? '');
  const runtimeEnv = resolveAgoraRuntimeEnvironmentFromConfigPackage();
  const db = createAgoraDatabase({
    dbPath: options.dbPath ?? normalizePathLikeEnvValue('AGORA_DB_PATH', process.env.AGORA_DB_PATH) ?? config.db_path,
    busyTimeoutMs: config.db_busy_timeout_ms,
  });
  runMigrations(db);
  ensureBundledAgoraAssetsInstalled({
    projectRoot: runtimeEnv.projectRoot ?? new URL('../../../../', import.meta.url).pathname,
  });
  const templatesDir = resolvePath(runtimeEnv.projectRoot, 'agora-ts/templates');
  const rolePackDir = resolvePath(runtimeEnv.projectRoot, 'agora-ts/role-packs/agora-default');
  const brainPackDir = ensureRuntimeBrainPackRoot(runtimeEnv.projectRoot);
  const context: CliCompositionContext = {
    config,
    runtimeEnv,
    db,
    templatesDir,
    rolePackDir,
    brainPackDir,
  };
  const factories = {
    ...createDefaultCliCompositionFactories(),
    ...overrides,
  };
  const craftsmanMode = resolveCraftsmanRuntimeMode('cli');
  const acpRuntime = craftsmanMode === 'acp' ? new DirectAcpxRuntimePort() : undefined;
  const craftsmanDispatcher = factories.createCraftsmanDispatcher(
    context,
    acpRuntime ? { acpRuntime } : undefined,
  );
  const agentRuntimePort = factories.createAgentRuntimePort(context);
  const messagingPort = factories.createIMMessagingPort(context);
  const imProvisioningPort = factories.createIMProvisioningPort(context);
  const taskContextBindingService = factories.createTaskContextBindingService(context);
  const projectKnowledgePort = factories.createProjectKnowledgePort(context);
  const projectService = factories.createProjectService(context, { projectKnowledgePort });
  const rolePackService = factories.createRolePackService(context);
  const citizenService = factories.createCitizenService(context, { projectService, rolePackService });
  const projectBrainService = factories.createProjectBrainService(context, { projectService, citizenService });
  const projectBrainEmbeddingPort = factories.createProjectBrainEmbeddingPort(context);
  const projectBrainVectorIndexPort = factories.createProjectBrainVectorIndexPort(context);
  const projectBrainIndexService = factories.createProjectBrainIndexService(context, {
    projectBrainService,
    ...(projectBrainEmbeddingPort ? { embeddingPort: projectBrainEmbeddingPort } : {}),
    ...(projectBrainVectorIndexPort ? { vectorIndexPort: projectBrainVectorIndexPort } : {}),
  });
  let taskServiceRef: TaskService | null = null;
  const projectBrainRetrievalService = factories.createProjectBrainRetrievalService(context, {
    taskLookup: {
      getTask: (taskId) => taskServiceRef?.getTask(taskId) ?? null,
    },
    projectBrainService,
    ...(projectBrainEmbeddingPort ? { embeddingPort: projectBrainEmbeddingPort } : {}),
    ...(projectBrainVectorIndexPort ? { vectorIndexPort: projectBrainVectorIndexPort } : {}),
  });
  const taskParticipationService = factories.createTaskParticipationService(context, {
    agentRuntimePort,
  });
  const legacyRuntimeServiceFactory = overrides.createLegacyRuntimeService
    ?? overrides.createTmuxRuntimeService
    ?? factories.createLegacyRuntimeService
    ?? factories.createTmuxRuntimeService;
  if (!legacyRuntimeServiceFactory) {
    throw new Error('legacy runtime service factory is not configured');
  }
  const legacyRuntimeService = legacyRuntimeServiceFactory(context);
  const tmuxRuntimeService = legacyRuntimeService;
  const taskBrainBindingService = factories.createTaskBrainBindingService(context);
  const taskBrainWorkspacePort = factories.createTaskBrainWorkspacePort(context);
  const projectBrainAutomationService = factories.createProjectBrainAutomationService(context, {
    projectBrainService,
    taskBrainBindingService,
    taskBrainWorkspacePort,
    ...(projectBrainRetrievalService ? { retrievalService: projectBrainRetrievalService } : {}),
  });
  const taskService = factories.createTaskService(context, {
    craftsmanDispatcher,
    taskBrainBindingService,
    taskBrainWorkspacePort,
    imProvisioningPort,
    messagingPort,
    taskContextBindingService,
    taskParticipationService,
    projectBrainAutomationService,
    projectService,
    agentRuntimePort,
    ...createCraftsmanTransportDeps(craftsmanMode, legacyRuntimeService, acpRuntime),
  });
  taskServiceRef = taskService;
  const dashboardSessionClient = factories.createDashboardSessionClient(context);
  const humanAccountService = factories.createHumanAccountService(context);
  const taskConversationService = factories.createTaskConversationService(context);
  const templateAuthoringService = factories.createTemplateAuthoringService(context);
  const dashboardQueryService = factories.createDashboardQueryService(context);
  return {
    config,
    db,
    taskService,
    projectService,
    projectBrainService,
    projectBrainAutomationService,
    ...(projectBrainIndexService ? { projectBrainIndexService } : {}),
    ...(projectBrainRetrievalService ? { projectBrainRetrievalService } : {}),
    citizenService,
    legacyRuntimeService,
    tmuxRuntimeService,
    dashboardSessionClient,
    humanAccountService,
    taskConversationService,
    templateAuthoringService,
    rolePackService,
    dashboardQueryService,
    taskBrainBindingService,
  };
}

function createCraftsmanTransportDeps(
  mode: ReturnType<typeof resolveCraftsmanRuntimeMode>,
  legacyRuntimeService: TmuxRuntimeService,
  acpRuntime?: DirectAcpxRuntimePort,
): {
  craftsmanInputPort: CraftsmanInputPort;
  craftsmanExecutionProbePort: CraftsmanExecutionProbePort;
  craftsmanExecutionTailPort: CraftsmanExecutionTailPort;
  runtimeRecoveryPort: RuntimeRecoveryPort;
} {
  if (mode === 'acp') {
    const runtime = acpRuntime ?? new DirectAcpxRuntimePort();
    return {
      craftsmanInputPort: new AcpCraftsmanInputPort(runtime),
      craftsmanExecutionProbePort: new AcpCraftsmanProbePort(runtime),
      craftsmanExecutionTailPort: new AcpCraftsmanTailPort(runtime),
      runtimeRecoveryPort: new AcpRuntimeRecoveryPort(runtime),
    };
  }
  return {
    craftsmanInputPort: new TmuxCraftsmanInputPort(legacyRuntimeService),
    craftsmanExecutionProbePort: new TmuxCraftsmanProbePort(legacyRuntimeService),
    craftsmanExecutionTailPort: new TmuxCraftsmanTailPort(legacyRuntimeService),
    runtimeRecoveryPort: new TmuxRuntimeRecoveryPort(legacyRuntimeService),
  };
}

function parseOptionalInt(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  return Number.parseInt(trimmed, 10);
}

function buildVectorIndexOptions() {
  const vectorSize = parseOptionalInt(process.env.OPENAI_EMBEDDING_DIMENSION);
  return {
    ...(vectorSize !== null ? { vectorSize } : {}),
  };
}
