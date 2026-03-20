import { mkdirSync } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';
import {
  AcpCraftsmanInputPort,
  AcpCraftsmanProbePort,
  AcpCraftsmanTailPort,
  CitizenService,
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
  FileArchiveJobNotifier,
  FileArchiveJobReceiptIngestor,
  GeminiCraftsmanAdapter,
  GitWorktreeWorkdirIsolator,
  InboxService,
  InventoryBackedAgentRuntimePort,
  LiveSessionStore,
  NotificationDispatcher,
  OpenClawCitizenProjectionAdapter,
  OsHostResourcePort,
  HumanAccountService,
  ProjectBrainIndexQueueService,
  type ProjectBrainIndexWorkerService,
  ProjectBrainService,
  ProjectService,
  RolePackService,
  TmuxCraftsmanInputPort,
  TmuxCraftsmanProbePort,
  TmuxCraftsmanTailPort,
  TmuxRuntimeRecoveryPort,
  type ProjectKnowledgePort,
  type CraftsmanInputPort,
  type CraftsmanExecutionProbePort,
  type CraftsmanExecutionTailPort,
  type RuntimeRecoveryPort,
  type TaskBrainWorkspacePort,
  TaskBrainBindingService,
  StubIMMessagingPort,
  TaskConversationService,
  TaskInboundService,
  TaskContextBindingService,
  TaskParticipationService,
  resolveCraftsmanRuntimeMode,
  TaskService,
  TemplateAuthoringService,
  TmuxRuntimeService,
  type AgentInventorySource,
  type AgentRuntimePort,
  type IMMessagingPort,
  type IMProvisioningPort,
  type PresenceSource,
} from '@agora-ts/core';
import { loadOpenClawDiscordAccountTokens, OpenClawAgentRegistry, OpenClawLogPresenceSource } from '@agora-ts/adapters-openclaw';
import { DiscordGatewayPresenceService, DiscordIMMessagingAdapter, DiscordIMProvisioningAdapter } from '@agora-ts/adapters-discord';
import { agoraDataDirPath, hasInstalledBrainPack, syncBundledBrainPackContents, type AgoraConfig } from '@agora-ts/config';
import type { AgoraDatabase } from '@agora-ts/db';

type RuntimeEnvironment = {
  apiBaseUrl: string;
  projectRoot: string;
};

export interface ServerCompositionContext {
  config: AgoraConfig;
  runtimeEnv: RuntimeEnvironment;
  db: AgoraDatabase;
  templatesDir: string;
  rolePackDir: string;
  brainPackDir: string;
  isCraftsmanSessionAlive?: (sessionId: string) => boolean;
}

export interface ServerCompositionOptions {
  isCraftsmanSessionAlive?: (sessionId: string) => boolean;
}

export interface ServerComposition {
  taskService: TaskService;
  projectService: ProjectService;
  projectBrainService: ProjectBrainService;
  citizenService: CitizenService;
  dashboardQueryService: DashboardQueryService;
  templateAuthoringService: TemplateAuthoringService;
  inboxService: InboxService;
  liveSessionStore: LiveSessionStore;
  legacyRuntimeService: TmuxRuntimeService;
  tmuxRuntimeService: TmuxRuntimeService;
  taskContextBindingService: TaskContextBindingService;
  taskParticipationService: TaskParticipationService;
  humanAccountService: HumanAccountService;
  notificationDispatcher: NotificationDispatcher;
  taskConversationService: TaskConversationService;
  taskInboundService: TaskInboundService;
  discordPresenceService?: DiscordGatewayPresenceService;
}

export interface ServerCompositionFactories {
  createLiveSessionStore: (context: ServerCompositionContext) => LiveSessionStore;
  createAgentRegistry: (context: ServerCompositionContext) => AgentInventorySource;
  createPresenceSource: (context: ServerCompositionContext) => PresenceSource;
  createAgentRuntimePort: (context: ServerCompositionContext, deps: { agentRegistry: AgentInventorySource }) => AgentRuntimePort;
  createCraftsmanDispatcher: (
    context: ServerCompositionContext,
    deps?: {
      acpRuntime?: DirectAcpxRuntimePort;
    },
  ) => CraftsmanDispatcher;
  createLegacyRuntimeService: (context: ServerCompositionContext) => TmuxRuntimeService;
  createTmuxRuntimeService?: (context: ServerCompositionContext) => TmuxRuntimeService;
  createTaskService: (
    context: ServerCompositionContext,
    deps: {
      craftsmanDispatcher: CraftsmanDispatcher;
      legacyRuntimeService: TmuxRuntimeService;
      imProvisioningPort: IMProvisioningPort | undefined;
      messagingPort: IMMessagingPort;
      taskBrainBindingService: TaskBrainBindingService;
      taskBrainWorkspacePort: TaskBrainWorkspacePort;
      taskContextBindingService: TaskContextBindingService;
      taskParticipationService: TaskParticipationService;
      projectService: ProjectService;
      agentRuntimePort: AgentRuntimePort;
      craftsmanInputPort: CraftsmanInputPort;
      craftsmanExecutionProbePort: CraftsmanExecutionProbePort;
      craftsmanExecutionTailPort: CraftsmanExecutionTailPort;
      runtimeRecoveryPort: RuntimeRecoveryPort;
      liveSessionStore: LiveSessionStore;
    },
  ) => TaskService;
  createArchiveJobNotifier: (context: ServerCompositionContext) => FileArchiveJobNotifier | undefined;
  createArchiveJobReceiptIngestor: (context: ServerCompositionContext) => FileArchiveJobReceiptIngestor | undefined;
  createDashboardQueryService: (
    context: ServerCompositionContext,
    deps: {
      liveSessionStore: LiveSessionStore;
      agentRegistry: AgentInventorySource;
      presenceSource: PresenceSource;
      legacyRuntimeService: TmuxRuntimeService;
      archiveJobNotifier: FileArchiveJobNotifier | undefined;
      archiveJobReceiptIngestor: FileArchiveJobReceiptIngestor | undefined;
      imProvisioningPort: IMProvisioningPort | undefined;
      taskContextBindingService: TaskContextBindingService;
    },
  ) => DashboardQueryService;
  createTemplateAuthoringService: (context: ServerCompositionContext) => TemplateAuthoringService;
  createInboxService: (context: ServerCompositionContext, deps: { taskService: TaskService }) => InboxService;
  createIMMessagingPort: (context: ServerCompositionContext) => IMMessagingPort;
  createIMProvisioningPort: (context: ServerCompositionContext) => IMProvisioningPort | undefined;
  createTaskContextBindingService: (context: ServerCompositionContext) => TaskContextBindingService;
  createTaskBrainBindingService: (context: ServerCompositionContext) => TaskBrainBindingService;
  createTaskBrainWorkspacePort: (context: ServerCompositionContext) => TaskBrainWorkspacePort;
  createProjectKnowledgePort: (context: ServerCompositionContext) => ProjectKnowledgePort;
  createProjectService: (
    context: ServerCompositionContext,
    deps: { projectKnowledgePort: ProjectKnowledgePort },
  ) => ProjectService;
  createRolePackService: (context: ServerCompositionContext) => RolePackService;
  createCitizenService: (
    context: ServerCompositionContext,
    deps: { projectService: ProjectService; rolePackService: RolePackService },
  ) => CitizenService;
  createProjectBrainService: (
    context: ServerCompositionContext,
    deps: { projectService: ProjectService; citizenService: CitizenService },
  ) => ProjectBrainService;
  createProjectBrainIndexWorkerService?: (
    context: ServerCompositionContext,
    deps: { projectBrainService: ProjectBrainService },
  ) => ProjectBrainIndexWorkerService | undefined;
  createTaskParticipationService: (
    context: ServerCompositionContext,
    deps: { agentRuntimePort: AgentRuntimePort },
  ) => TaskParticipationService;
  createHumanAccountService: (context: ServerCompositionContext) => HumanAccountService;
  createNotificationDispatcher: (context: ServerCompositionContext, deps: { messagingPort: IMMessagingPort }) => NotificationDispatcher;
  createTaskConversationService: (context: ServerCompositionContext) => TaskConversationService;
  createTaskInboundService: (
    context: ServerCompositionContext,
    deps: { taskConversationService: TaskConversationService; taskContextBindingService: TaskContextBindingService; taskService: TaskService },
  ) => TaskInboundService;
  createDiscordPresenceService: (context: ServerCompositionContext) => DiscordGatewayPresenceService | undefined;
}

export function ensureRuntimeBrainPackRoot(projectRoot: string): string {
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

export function createDefaultServerCompositionFactories(): ServerCompositionFactories {
  return {
    createLiveSessionStore: () => new LiveSessionStore({
      staleAfterMs: Number(process.env.AGORA_LIVE_SESSION_TTL_MS ?? 15 * 60 * 1000),
    }),
    createAgentRegistry: () => new OpenClawAgentRegistry(
      process.env.AGORA_OPENCLAW_CONFIG_PATH
        ? { configPath: process.env.AGORA_OPENCLAW_CONFIG_PATH }
        : {},
    ),
    createPresenceSource: () => new OpenClawLogPresenceSource(
      process.env.AGORA_OPENCLAW_GATEWAY_LOG_PATH
        ? {
            logPath: process.env.AGORA_OPENCLAW_GATEWAY_LOG_PATH,
            staleAfterMs: Number(process.env.AGORA_PROVIDER_STALE_AFTER_MS ?? 10 * 60 * 1000),
        }
        : {
            staleAfterMs: Number(process.env.AGORA_PROVIDER_STALE_AFTER_MS ?? 10 * 60 * 1000),
          },
    ),
    createAgentRuntimePort: (_context, deps) => new InventoryBackedAgentRuntimePort(deps.agentRegistry),
    createCraftsmanDispatcher: (context, deps) => {
      const adapterMode = resolveCraftsmanRuntimeMode('server');
      const acpRuntime = adapterMode === 'acp' ? (deps?.acpRuntime ?? new DirectAcpxRuntimePort()) : undefined;
      const dispatcherOptions: ConstructorParameters<typeof CraftsmanDispatcher>[1] = {
        maxConcurrentRunning: context.config.craftsmen.max_concurrent_running,
        adapters: createDefaultCraftsmanAdapters({
          mode: adapterMode,
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
    createTaskService: (context, deps) => {
      const imProvisioningPort = deps.imProvisioningPort;
      return new TaskService(context.db, {
        templatesDir: context.templatesDir,
        archonUsers: context.config.permissions.archonUsers,
        allowAgents: context.config.permissions.allowAgents,
        craftsmanDispatcher: deps.craftsmanDispatcher,
        isCraftsmanSessionAlive: context.isCraftsmanSessionAlive ?? defaultSessionAliveProbe(deps.legacyRuntimeService),
        imMessagingPort: deps.messagingPort,
        taskBrainBindingService: deps.taskBrainBindingService,
        taskBrainWorkspacePort: deps.taskBrainWorkspacePort,
        taskContextBindingService: deps.taskContextBindingService,
        taskParticipationService: deps.taskParticipationService,
        projectService: deps.projectService,
        agentRuntimePort: deps.agentRuntimePort,
        runtimeRecoveryPort: deps.runtimeRecoveryPort,
        craftsmanInputPort: deps.craftsmanInputPort,
        craftsmanExecutionProbePort: deps.craftsmanExecutionProbePort,
        craftsmanExecutionTailPort: deps.craftsmanExecutionTailPort,
        hostResourcePort: new OsHostResourcePort(),
        liveSessionStore: deps.liveSessionStore,
        skillCatalogPort: new FilesystemSkillCatalogAdapter(),
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
        ...(imProvisioningPort ? { imProvisioningPort } : {}),
      });
    },
    createArchiveJobNotifier: (context) => {
      const outboxDir = process.env.AGORA_ARCHIVE_WRITER_OUTBOX_DIR
        ?? join(dirname(resolvePath(context.config.db_path)), 'archive-outbox');
      return new FileArchiveJobNotifier({ outboxDir });
    },
    createArchiveJobReceiptIngestor: (context) => {
      const receiptDir = process.env.AGORA_ARCHIVE_WRITER_RECEIPT_DIR
        ?? join(dirname(resolvePath(context.config.db_path)), 'archive-receipts');
      return new FileArchiveJobReceiptIngestor({ receiptDir });
    },
    createDashboardQueryService: (context, deps) => new DashboardQueryService(context.db, {
      templatesDir: context.templatesDir,
      ...(deps.archiveJobNotifier ? { archiveJobNotifier: deps.archiveJobNotifier } : {}),
      ...(deps.archiveJobReceiptIngestor ? { archiveJobReceiptIngestor: deps.archiveJobReceiptIngestor } : {}),
      taskContextBindingService: deps.taskContextBindingService,
      ...(deps.imProvisioningPort ? { imProvisioningPort: deps.imProvisioningPort } : {}),
      liveSessions: deps.liveSessionStore,
      agentRegistry: deps.agentRegistry,
      presenceSource: deps.presenceSource,
      legacyRuntimeService: deps.legacyRuntimeService,
      skillCatalogPort: new FilesystemSkillCatalogAdapter(),
    }),
    createTemplateAuthoringService: (context) => new TemplateAuthoringService({
      db: context.db,
      templatesDir: context.templatesDir,
    }),
    createInboxService: (context, deps) => new InboxService(context.db, deps.taskService),
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
    createTaskBrainBindingService: (context) => new TaskBrainBindingService(context.db),
    createTaskBrainWorkspacePort: (context) => new FilesystemTaskBrainWorkspaceAdapter({
      brainPackRoot: context.brainPackDir,
    }),
    createProjectKnowledgePort: (context) => new FilesystemProjectKnowledgeAdapter({
      brainPackRoot: context.brainPackDir,
    }),
    createProjectService: (context, deps) => new ProjectService(context.db, {
      knowledgePort: deps.projectKnowledgePort,
      projectBrainIndexQueueService: new ProjectBrainIndexQueueService(context.db),
    }),
    createRolePackService: (context) => new RolePackService({
      db: context.db,
      rolePacksDir: context.rolePackDir,
    }),
    createCitizenService: (context, deps) => new CitizenService(context.db, {
      projectService: deps.projectService,
      rolePackService: deps.rolePackService,
      projectionPorts: [new OpenClawCitizenProjectionAdapter()],
    }),
    createProjectBrainService: (context, deps) => new ProjectBrainService({
      projectService: deps.projectService,
      citizenService: deps.citizenService,
      projectBrainQueryPort: new FilesystemProjectBrainQueryAdapter({
        brainPackRoot: context.brainPackDir,
      }),
      projectBrainIndexQueueService: new ProjectBrainIndexQueueService(context.db),
    }),
    createTaskParticipationService: (context, deps) => new TaskParticipationService(context.db, {
      agentRuntimePort: deps.agentRuntimePort,
    }),
    createHumanAccountService: (context) => new HumanAccountService(context.db),
    createNotificationDispatcher: (context, deps) => new NotificationDispatcher(context.db, { messagingPort: deps.messagingPort }),
    createTaskConversationService: (context) => new TaskConversationService(context.db),
    createTaskInboundService: (_context, deps) => new TaskInboundService(
      deps.taskConversationService,
      deps.taskContextBindingService,
      deps.taskService,
    ),
    createDiscordPresenceService: (context) => {
      const { im } = context.config;
      if (im.provider !== 'discord' || !im.discord?.bot_token) {
        return undefined;
      }
      return new DiscordGatewayPresenceService({
        botToken: im.discord.bot_token,
        enabled: im.discord.gateway_presence_enabled,
        status: im.discord.gateway_presence_status,
        activityName: im.discord.gateway_presence_activity,
        logger: {
          info: (message) => console.info(message),
          warn: (message) => console.warn(message),
          error: (message, error) => console.error(message, error),
        },
      });
    },
  };
}

export function buildServerComposition(
  context: ServerCompositionContext,
  overrides: Partial<ServerCompositionFactories> = {},
): ServerComposition {
  const factories = {
    ...createDefaultServerCompositionFactories(),
    ...overrides,
  };

  const liveSessionStore = factories.createLiveSessionStore(context);
  const agentRegistry = factories.createAgentRegistry(context);
  const presenceSource = factories.createPresenceSource(context);
  const agentRuntimePort = factories.createAgentRuntimePort(context, { agentRegistry });
  const craftsmanMode = resolveCraftsmanRuntimeMode('server');
  const acpRuntime = craftsmanMode === 'acp' ? new DirectAcpxRuntimePort() : undefined;
  const craftsmanDispatcher = factories.createCraftsmanDispatcher(
    context,
    acpRuntime ? { acpRuntime } : undefined,
  );
  const legacyRuntimeServiceFactory = overrides.createLegacyRuntimeService
    ?? overrides.createTmuxRuntimeService
    ?? factories.createLegacyRuntimeService
    ?? factories.createTmuxRuntimeService;
  if (!legacyRuntimeServiceFactory) {
    throw new Error('legacy runtime service factory is not configured');
  }
  const legacyRuntimeService = legacyRuntimeServiceFactory(context);
  const tmuxRuntimeService = legacyRuntimeService;
  const taskContextBindingService = factories.createTaskContextBindingService(context);
  const taskBrainBindingService = factories.createTaskBrainBindingService(context);
  const taskBrainWorkspacePort = factories.createTaskBrainWorkspacePort(context);
  const projectKnowledgePort = factories.createProjectKnowledgePort(context);
  const projectService = factories.createProjectService(context, { projectKnowledgePort });
  const rolePackService = factories.createRolePackService(context);
  const citizenService = factories.createCitizenService(context, { projectService, rolePackService });
  const projectBrainService = factories.createProjectBrainService(context, { projectService, citizenService });
  const taskParticipationService = factories.createTaskParticipationService(context, { agentRuntimePort });
  const humanAccountService = factories.createHumanAccountService(context);
  const imProvisioningPort = factories.createIMProvisioningPort(context);
  const messagingPort = factories.createIMMessagingPort(context);
  const taskService = factories.createTaskService(context, {
    craftsmanDispatcher,
    legacyRuntimeService,
    imProvisioningPort,
    messagingPort,
    liveSessionStore,
    taskBrainBindingService,
    taskBrainWorkspacePort,
    taskContextBindingService,
    taskParticipationService,
    projectService,
    agentRuntimePort,
    ...createCraftsmanTransportDeps(craftsmanMode, legacyRuntimeService, acpRuntime),
  });
  const archiveJobNotifier = factories.createArchiveJobNotifier(context);
  const archiveJobReceiptIngestor = factories.createArchiveJobReceiptIngestor(context);
  const dashboardQueryService = factories.createDashboardQueryService(context, {
    liveSessionStore,
    agentRegistry,
    presenceSource,
    legacyRuntimeService,
    archiveJobNotifier,
    archiveJobReceiptIngestor,
    imProvisioningPort,
    taskContextBindingService,
  });
  const templateAuthoringService = factories.createTemplateAuthoringService(context);
  const inboxService = factories.createInboxService(context, { taskService });
  const notificationDispatcher = factories.createNotificationDispatcher(context, { messagingPort });
  const taskConversationService = factories.createTaskConversationService(context);
  const taskInboundService = factories.createTaskInboundService(context, {
    taskConversationService,
    taskContextBindingService,
    taskService,
  });
  const discordPresenceService = factories.createDiscordPresenceService(context);

  return {
    taskService,
    projectService,
    projectBrainService,
    citizenService,
    dashboardQueryService,
    templateAuthoringService,
    inboxService,
    liveSessionStore,
    legacyRuntimeService,
    tmuxRuntimeService,
    taskContextBindingService,
    taskParticipationService,
    humanAccountService,
    notificationDispatcher,
    taskConversationService,
    taskInboundService,
    ...(discordPresenceService ? { discordPresenceService } : {}),
  };
}

function defaultSessionAliveProbe(legacyRuntimeService: TmuxRuntimeService) {
  return (sessionId: string) => {
    if (!sessionId.startsWith('tmux:')) {
      return true;
    }
    try {
      return legacyRuntimeService.status().panes.some((pane) => pane.transportSessionId === sessionId);
    } catch {
      return true;
    }
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
