import { mkdirSync } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';
import {
  CitizenService,
  CcConnectManagementService,
  CompositeAgentInventorySource,
  CompositePresenceSource,
  CraftsmanCallbackService,
  CraftsmanDispatcher,
  DashboardQueryService,
  FileArchiveJobNotifier,
  FileArchiveJobReceiptIngestor,
  GitWorktreeWorkdirIsolator,
  InboxService,
  InventoryBackedAgentRuntimePort,
  LiveSessionStore,
  NotificationDispatcher,
  HumanAccountService,
  ContextSourceBindingService,
  ContextMaterializationService,
  ProjectAgentRosterService,
  ProjectBrainAutomationService,
  ProjectBrainIndexQueueService,
  ProjectBrainRetrievalService,
  type ProjectBrainIndexWorkerService,
  ProjectBrainService,
  ProjectContextWriter,
  ProjectMembershipService,
  ProjectService,
  RetrievalRegistry,
  RetrievalService,
  RolePackService,
  TaskAuthorityService,
  type ProjectKnowledgePort,
  type CraftsmanInputPort,
  type CraftsmanExecutionProbePort,
  type CraftsmanExecutionTailPort,
  type InteractiveRuntimePort,
  type RuntimeRecoveryPort,
  type TaskBrainWorkspacePort,
  TaskBrainBindingService,
  StubIMMessagingPort,
  TaskConversationService,
  TaskInboundService,
  TaskContextBindingService,
  TaskParticipationService,
  RuntimeThreadMessageRouter,
  type RuntimeThreadMessageInput,
  resolveCraftsmanRuntimeMode,
  TaskService,
  TemplateAuthoringService,
  type AgentInventorySource,
  type AgentRuntimePort,
  type IMMessagingPort,
  type IMProvisioningPort,
  type PresenceSource,
} from '@agora-ts/core';
import {
  CcConnectAgentRegistry,
  CcConnectManagementPresenceSource,
  CcConnectSessionMirrorService,
} from '@agora-ts/adapters-cc-connect';
import { FilesystemContextSourceRetrievalAdapter, FilesystemSkillCatalogAdapter, FilesystemProjectBrainQueryAdapter, FilesystemProjectKnowledgeAdapter, FilesystemTaskBrainWorkspaceAdapter } from '@agora-ts/adapters-brain';
import { ProjectContextBriefingMaterializer, RuntimeRepoShimMaterializer } from '@agora-ts/adapters-materialization';
import { ClaudeCraftsmanAdapter, CodexCraftsmanAdapter, GeminiCraftsmanAdapter } from '@agora-ts/adapters-craftsman';
import { OsHostResourcePort } from '@agora-ts/adapters-host';
import { AcpCraftsmanInputPort, AcpCraftsmanProbePort, AcpCraftsmanTailPort, AcpRuntimeRecoveryPort, createDefaultCraftsmanAdapters, DirectAcpxRuntimePort, TmuxCraftsmanInputPort, TmuxCraftsmanProbePort, TmuxCraftsmanTailPort, TmuxRuntimeRecoveryPort, TmuxRuntimeService } from '@agora-ts/adapters-runtime';
import { loadOpenClawDiscordAccountTokens, OpenClawAgentRegistry, OpenClawCitizenProjectionAdapter, OpenClawLogPresenceSource } from '@agora-ts/adapters-openclaw';
import { DiscordGatewayPresenceService, DiscordIMMessagingAdapter, DiscordIMProvisioningAdapter } from '@agora-ts/adapters-discord';
import { ObsidianContextSourceRetrievalAdapter } from '@agora-ts/adapters-obsidian';
import { agoraDataDirPath, hasInstalledBrainPack, refineProjectNomosDraftFromSpec, resolveAgoraProjectStateLayout, resolveProjectNomosRuntimePaths, resolveProjectNomosState, syncBundledBrainPackContents, type AgoraConfig } from '@agora-ts/config';
import type { LiveSessionDto } from '@agora-ts/contracts';
import {
  type AgoraDatabase,
  ApprovalRequestRepository,
  ArchiveJobRepository,
  CitizenRepository,
  CraftsmanExecutionRepository,
  FlowLogRepository,
  HumanAccountRepository,
  HumanIdentityBindingRepository,
  InboxRepository,
  NotificationOutboxRepository,
  ParticipantBindingRepository,
  ProgressLogRepository,
  ProjectAgentRosterRepository,
  ProjectBrainIndexJobRepository,
  ProjectMembershipRepository,
  ProjectRepository,
  ProjectWriteLockRepository,
  RoleBindingRepository,
  RoleDefinitionRepository,
  RuntimeSessionBindingRepository,
  SubtaskRepository,
  TaskAuthorityRepository,
  TaskBrainBindingRepository,
  TaskContextBindingRepository,
  TaskConversationReadCursorRepository,
  TaskConversationRepository,
  TaskRepository,
  TemplateRepository,
  TodoRepository,
  SqliteGateCommandPort,
  SqliteGateQueryPort,
} from '@agora-ts/db';

type RuntimeEnvironment = {
  apiBaseUrl: string;
  projectRoot: string;
};

type CcConnectBridgeRuntimeController = {
  readonly runtime_provider: 'cc-connect';
  start(): void;
  stop(): void;
  sendInboundMessage(input: RuntimeThreadMessageInput): Promise<void>;
};

type DiscordThreadIngressController = {
  start(): void;
  stop(): void;
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
  contextRetrievalService: RetrievalService;
  contextMaterializationService: ContextMaterializationService;
  citizenService: CitizenService;
  dashboardQueryService: DashboardQueryService;
  templateAuthoringService: TemplateAuthoringService;
  inboxService: InboxService;
  liveSessionStore: LiveSessionStore;
  legacyRuntimeService: InteractiveRuntimePort;
  tmuxRuntimeService: InteractiveRuntimePort;
  taskContextBindingService: TaskContextBindingService;
  taskParticipationService: TaskParticipationService;
  humanAccountService: HumanAccountService;
  notificationDispatcher: NotificationDispatcher;
  imProvisioningPort?: IMProvisioningPort;
  taskConversationService: TaskConversationService;
  taskInboundService: TaskInboundService;
  ccConnectSessionMirrorService?: CcConnectSessionMirrorService;
  ccConnectBridgeRuntimeService?: CcConnectBridgeRuntimeController;
  discordPresenceService?: DiscordGatewayPresenceService;
  discordThreadIngressService?: DiscordThreadIngressController;
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
  createLegacyRuntimeService: (context: ServerCompositionContext) => InteractiveRuntimePort;
  createTmuxRuntimeService?: (context: ServerCompositionContext) => InteractiveRuntimePort;
  createTaskService: (
    context: ServerCompositionContext,
    deps: {
      craftsmanDispatcher: CraftsmanDispatcher;
      legacyRuntimeService: InteractiveRuntimePort;
      imProvisioningPort: IMProvisioningPort | undefined;
      messagingPort: IMMessagingPort;
      taskBrainBindingService: TaskBrainBindingService;
      taskBrainWorkspacePort: TaskBrainWorkspacePort;
      taskContextBindingService: TaskContextBindingService;
      taskParticipationService: TaskParticipationService;
      humanAccountService: HumanAccountService;
      contextMaterializationService: ContextMaterializationService;
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
      legacyRuntimeService: InteractiveRuntimePort;
      archiveJobNotifier: FileArchiveJobNotifier | undefined;
      archiveJobReceiptIngestor: FileArchiveJobReceiptIngestor | undefined;
      imProvisioningPort: IMProvisioningPort | undefined;
      taskBrainBindingService: TaskBrainBindingService;
      taskBrainWorkspacePort: TaskBrainWorkspacePort;
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
  createContextRetrievalService: (
    context: ServerCompositionContext,
    deps: { projectService: ProjectService; projectBrainService: ProjectBrainService },
  ) => RetrievalService;
  createContextMaterializationService: (
    context: ServerCompositionContext,
    deps: { projectService: ProjectService; projectBrainService: ProjectBrainService; contextRetrievalService: RetrievalService },
  ) => ContextMaterializationService;
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
    deps: {
      taskConversationService: TaskConversationService;
      taskContextBindingService: TaskContextBindingService;
      taskService: TaskService;
      taskParticipationService: TaskParticipationService;
      runtimeThreadMessageRouter?: RuntimeThreadMessageRouter;
    },
  ) => TaskInboundService;
  createDiscordPresenceService: (context: ServerCompositionContext) => DiscordGatewayPresenceService | undefined;
  createDiscordThreadIngressService?: (
    context: ServerCompositionContext,
    deps: {
      taskContextBindingService: TaskContextBindingService;
      taskInboundService: TaskInboundService;
    },
  ) => DiscordThreadIngressController | undefined;
  createCcConnectSessionMirrorService?: (
    context: ServerCompositionContext,
    deps: {
      liveSessionStore: LiveSessionStore;
      taskParticipationService: TaskParticipationService;
    },
  ) => CcConnectSessionMirrorService | undefined;
  createCcConnectBridgeRuntimeService?: (
    context: ServerCompositionContext,
    deps: {
      imProvisioningPort: IMProvisioningPort | undefined;
      taskConversationService: TaskConversationService;
      taskContextBindingService: TaskContextBindingService;
      taskParticipationService: TaskParticipationService;
      liveSessionStore: LiveSessionStore;
    },
  ) => CcConnectBridgeRuntimeController | undefined;
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
    createAgentRegistry: () => new CompositeAgentInventorySource([
      new OpenClawAgentRegistry(
        process.env.AGORA_OPENCLAW_CONFIG_PATH
          ? { configPath: process.env.AGORA_OPENCLAW_CONFIG_PATH }
          : {},
      ),
      new CcConnectAgentRegistry(),
    ]),
    createPresenceSource: () => new CompositePresenceSource([
      new OpenClawLogPresenceSource(
        process.env.AGORA_OPENCLAW_GATEWAY_LOG_PATH
          ? {
              logPath: process.env.AGORA_OPENCLAW_GATEWAY_LOG_PATH,
              staleAfterMs: Number(process.env.AGORA_PROVIDER_STALE_AFTER_MS ?? 10 * 60 * 1000),
          }
          : {
              staleAfterMs: Number(process.env.AGORA_PROVIDER_STALE_AFTER_MS ?? 10 * 60 * 1000),
            },
      ),
      new CcConnectManagementPresenceSource({
        managementService: new CcConnectManagementService(),
        staleAfterMs: Number(process.env.AGORA_PROVIDER_STALE_AFTER_MS ?? 10 * 60 * 1000),
        pollIntervalMs: Number(process.env.AGORA_CC_CONNECT_POLL_INTERVAL_MS ?? 30_000),
      }),
    ]),
    createAgentRuntimePort: (_context, deps) => new InventoryBackedAgentRuntimePort(deps.agentRegistry),
    createCraftsmanDispatcher: (context, deps) => {
      const adapterMode = resolveCraftsmanRuntimeMode('server');
      const acpRuntime = adapterMode === 'acp' ? (deps?.acpRuntime ?? new DirectAcpxRuntimePort()) : undefined;
      const adapters = createDefaultCraftsmanAdapters({
        mode: adapterMode,
        callbackUrl: `${context.runtimeEnv.apiBaseUrl}/api/craftsmen/callback`,
        apiToken: context.config.api_auth.enabled ? context.config.api_auth.token : null,
        ...(acpRuntime ? { acpRuntime } : {}),
      });
      return new CraftsmanDispatcher({
        executionRepository: new CraftsmanExecutionRepository(context.db),
        subtaskRepository: new SubtaskRepository(context.db),
        maxConcurrentRunning: context.config.craftsmen.max_concurrent_running,
        adapters,
        ...(context.config.craftsmen.isolate_git_worktrees
          ? {
              workdirIsolator: new GitWorktreeWorkdirIsolator({
                rootDir: resolvePath(context.config.craftsmen.isolated_root),
              }),
            }
          : {}),
      });
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
      const db = context.db;
      const taskRepository = new TaskRepository(db);
      const flowLogRepository = new FlowLogRepository(db);
      const progressLogRepository = new ProgressLogRepository(db);
      const subtaskRepository = new SubtaskRepository(db);
      const taskContextBindingRepository = new TaskContextBindingRepository(db);
      const taskConversationRepository = new TaskConversationRepository(db);
      const todoRepository = new TodoRepository(db);
      const archiveJobRepository = new ArchiveJobRepository(db);
      const approvalRequestRepository = new ApprovalRequestRepository(db);
      const inboxRepository = new InboxRepository(db);
      const craftsmanExecutionRepository = new CraftsmanExecutionRepository(db);
      const templateRepository = new TemplateRepository(db);
      const projectMembershipService = new ProjectMembershipService({
        membershipRepository: new ProjectMembershipRepository(db),
        accountRepository: new HumanAccountRepository(db),
      });
      const projectAgentRosterService = new ProjectAgentRosterService({
        repository: new ProjectAgentRosterRepository(db),
      });
      return new TaskService({
        databasePort: db,
        gateCommandPort: new SqliteGateCommandPort(db),
        gateQueryPort: new SqliteGateQueryPort(db),
        repositories: {
          task: taskRepository,
          flowLog: flowLogRepository,
          progressLog: progressLogRepository,
          subtask: subtaskRepository,
          taskContextBinding: taskContextBindingRepository,
          taskConversation: taskConversationRepository,
          todo: todoRepository,
          archiveJob: archiveJobRepository,
          approvalRequest: approvalRequestRepository,
          inbox: inboxRepository,
          craftsmanExecution: craftsmanExecutionRepository,
          template: templateRepository,
        },
        subServices: {
          taskAuthority: new TaskAuthorityService({
            repository: new TaskAuthorityRepository(db),
          }),
          projectMembership: projectMembershipService,
          projectAgentRoster: projectAgentRosterService,
          craftsmanCallback: new CraftsmanCallbackService({
            executionRepository: craftsmanExecutionRepository,
            subtaskRepository,
            taskRepository,
            flowLogRepository,
            progressLogRepository,
            outboxRepository: new NotificationOutboxRepository(db),
            bindingRepository: taskContextBindingRepository,
            conversationRepository: taskConversationRepository,
          }),
          projectContextWriter: new ProjectContextWriter({
            writeLockRepository: new ProjectWriteLockRepository(db),
            projectService: deps.projectService,
            taskBrainWorkspacePort: deps.taskBrainWorkspacePort,
          }),
        },
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
        contextMaterializationService: deps.contextMaterializationService,
        resolveHumanReminderParticipantRefs: ({ task, provider, reason }) => {
          if (reason !== 'approval_waiting') {
            return [];
          }
          const identity = deps.humanAccountService.getIdentityByUsername(task.creator, provider);
          return identity ? [identity.external_user_id] : [];
        },
        projectService: deps.projectService,
        agentRuntimePort: deps.agentRuntimePort,
        runtimeRecoveryPort: deps.runtimeRecoveryPort,
        craftsmanInputPort: deps.craftsmanInputPort,
        craftsmanExecutionProbePort: deps.craftsmanExecutionProbePort,
        craftsmanExecutionTailPort: deps.craftsmanExecutionTailPort,
        hostResourcePort: new OsHostResourcePort(),
        liveSessionStore: deps.liveSessionStore,
        skillCatalogPort: new FilesystemSkillCatalogAdapter(),
        projectNomosAuthoringPort: {
          refineProjectNomosDraft: (projectId: string) => refineProjectNomosDraftFromSpec(projectId),
          resolveProjectNomosRuntimeContext: (projectId: string) => {
            const project = deps.projectService.requireProject(projectId);
            const state = resolveProjectNomosState(projectId, project.metadata ?? null);
            const runtimePaths = resolveProjectNomosRuntimePaths(projectId, project.metadata ?? null);
            return {
              nomos_id: state.nomos_id,
              activation_status: state.activation_status,
              bootstrap_interview_prompt_path: runtimePaths.bootstrap_interview_prompt_path,
              closeout_review_prompt_path: runtimePaths.closeout_review_prompt_path,
              doctor_project_prompt_path: runtimePaths.doctor_project_prompt_path,
            };
          },
        },
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
    createDashboardQueryService: (context, deps) => new DashboardQueryService({
      templatesDir: context.templatesDir,
      taskRepository: new TaskRepository(context.db),
      subtaskRepository: new SubtaskRepository(context.db),
      archiveJobRepository: new ArchiveJobRepository(context.db),
      todoRepository: new TodoRepository(context.db),
      executionRepository: new CraftsmanExecutionRepository(context.db),
      progressLogRepository: new ProgressLogRepository(context.db),
      templateRepository: new TemplateRepository(context.db),
      ...(deps.archiveJobNotifier ? { archiveJobNotifier: deps.archiveJobNotifier } : {}),
      ...(deps.archiveJobReceiptIngestor ? { archiveJobReceiptIngestor: deps.archiveJobReceiptIngestor } : {}),
      taskBrainBindingService: deps.taskBrainBindingService,
      taskBrainWorkspacePort: deps.taskBrainWorkspacePort,
      taskContextBindingService: deps.taskContextBindingService,
      ...(deps.imProvisioningPort ? { imProvisioningPort: deps.imProvisioningPort } : {}),
      liveSessions: deps.liveSessionStore,
      agentRegistry: deps.agentRegistry,
      presenceSource: deps.presenceSource,
      legacyRuntimeService: deps.legacyRuntimeService,
      skillCatalogPort: new FilesystemSkillCatalogAdapter(),
    }),
    createTemplateAuthoringService: (context) => new TemplateAuthoringService({
      templatesDir: context.templatesDir,
      templateRepository: new TemplateRepository(context.db),
    }),
    createInboxService: (context, deps) => new InboxService(deps.taskService, {
      inboxRepository: new InboxRepository(context.db),
      todoRepository: new TodoRepository(context.db),
    }),
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
    createTaskContextBindingService: (context) => new TaskContextBindingService({
      repository: new TaskContextBindingRepository(context.db),
    }),
    createTaskBrainBindingService: (context) => new TaskBrainBindingService({
      repository: new TaskBrainBindingRepository(context.db),
    }),
    createTaskBrainWorkspacePort: (context) => new FilesystemTaskBrainWorkspaceAdapter({
      brainPackRoot: context.brainPackDir,
      projectStateRootResolver: (projectId) => resolveAgoraProjectStateLayout(projectId).root,
    }),
    createProjectKnowledgePort: (context) => new FilesystemProjectKnowledgeAdapter({
      brainPackRoot: context.brainPackDir,
      projectStateRootResolver: (projectId) => resolveAgoraProjectStateLayout(projectId).root,
    }),
    createProjectService: (context, deps) => new ProjectService({
      projectRepository: new ProjectRepository(context.db),
      taskRepository: new TaskRepository(context.db),
      membershipService: new ProjectMembershipService({
        membershipRepository: new ProjectMembershipRepository(context.db),
        accountRepository: new HumanAccountRepository(context.db),
      }),
      agentRosterService: new ProjectAgentRosterService({
        repository: new ProjectAgentRosterRepository(context.db),
      }),
      transactionManager: createTransactionManager(context.db),
      knowledgePort: deps.projectKnowledgePort,
      projectBrainIndexQueueService: new ProjectBrainIndexQueueService({
        repository: new ProjectBrainIndexJobRepository(context.db),
      }),
    }),
    createRolePackService: (context) => new RolePackService({
      roleDefinitions: new RoleDefinitionRepository(context.db),
      roleBindings: new RoleBindingRepository(context.db),
      rolePacksDir: context.rolePackDir,
    }),
    createCitizenService: (context, deps) => new CitizenService({
      repository: new CitizenRepository(context.db),
      projectService: deps.projectService,
      rolePackService: deps.rolePackService,
      projectionPorts: [new OpenClawCitizenProjectionAdapter()],
    }),
    createProjectBrainService: (context, deps) => new ProjectBrainService({
      projectService: deps.projectService,
      citizenService: deps.citizenService,
      projectBrainQueryPort: new FilesystemProjectBrainQueryAdapter({
        brainPackRoot: context.brainPackDir,
        projectStateRootResolver: (projectId) => resolveAgoraProjectStateLayout(projectId).root,
      }),
      projectBrainIndexQueueService: new ProjectBrainIndexQueueService({
        repository: new ProjectBrainIndexJobRepository(context.db),
      }),
    }),
    createContextRetrievalService: (context, deps) => {
      const contextSourceBindingService = new ContextSourceBindingService({
        projectService: deps.projectService,
      });
      const registry = new RetrievalRegistry([
        new ProjectBrainRetrievalService({
          taskLookup: new TaskRepository(context.db),
          projectBrainService: deps.projectBrainService,
        }),
        new FilesystemContextSourceRetrievalAdapter({
          listProjectBindings: (projectId: string) => contextSourceBindingService.listProjectBindings(projectId),
        }),
        new ObsidianContextSourceRetrievalAdapter({
          listProjectBindings: (projectId: string) => contextSourceBindingService.listProjectBindings(projectId),
        }),
      ]);
      return new RetrievalService({ registry });
    },
    createContextMaterializationService: (_context, deps) => new ContextMaterializationService({
      ports: [
        new ProjectContextBriefingMaterializer({
          projectBrainAutomationService: new ProjectBrainAutomationService({
            projectBrainService: deps.projectBrainService,
            retrievalService: deps.contextRetrievalService,
          }),
        }),
        new RuntimeRepoShimMaterializer({
          projectService: deps.projectService,
        }),
      ],
    }),
    createTaskParticipationService: (context, deps) => new TaskParticipationService({
      participantRepository: new ParticipantBindingRepository(context.db),
      runtimeSessionRepository: new RuntimeSessionBindingRepository(context.db),
      taskBindingRepository: new TaskContextBindingRepository(context.db),
      agentRuntimePort: deps.agentRuntimePort,
    }),
    createHumanAccountService: (context) => new HumanAccountService({
      accountRepository: new HumanAccountRepository(context.db),
      identityBindingRepository: new HumanIdentityBindingRepository(context.db),
    }),
    createNotificationDispatcher: (context, deps) => new NotificationDispatcher({
      outboxRepository: new NotificationOutboxRepository(context.db),
      conversationRepository: new TaskConversationRepository(context.db),
      bindingRepository: new TaskContextBindingRepository(context.db),
      messagingPort: deps.messagingPort,
    }),
    createTaskConversationService: (context) => new TaskConversationService({
      bindingRepository: new TaskContextBindingRepository(context.db),
      conversationRepository: new TaskConversationRepository(context.db),
      readCursorRepository: new TaskConversationReadCursorRepository(context.db),
    }),
    createTaskInboundService: (_context, deps) => new TaskInboundService(
      deps.taskConversationService,
      deps.taskContextBindingService,
      deps.taskService,
      deps.taskParticipationService,
      deps.runtimeThreadMessageRouter,
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
    createDiscordThreadIngressService: () => undefined,
    createCcConnectSessionMirrorService: () => undefined,
    createCcConnectBridgeRuntimeService: () => undefined,
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
  const contextRetrievalService = factories.createContextRetrievalService(context, { projectService, projectBrainService });
  const contextMaterializationService = factories.createContextMaterializationService(context, {
    projectService,
    projectBrainService,
    contextRetrievalService,
  });
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
    humanAccountService,
    contextMaterializationService,
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
    taskBrainBindingService,
    taskBrainWorkspacePort,
    taskContextBindingService,
  });
  const templateAuthoringService = factories.createTemplateAuthoringService(context);
  const inboxService = factories.createInboxService(context, { taskService });
  const notificationDispatcher = factories.createNotificationDispatcher(context, { messagingPort });
  const taskConversationService = factories.createTaskConversationService(context);
  const ccConnectBridgeRuntimeService = factories.createCcConnectBridgeRuntimeService?.(context, {
    imProvisioningPort,
    taskConversationService,
    taskContextBindingService,
    taskParticipationService,
    liveSessionStore,
  });
  const runtimeThreadMessageRouter = new RuntimeThreadMessageRouter(
    ccConnectBridgeRuntimeService ? [ccConnectBridgeRuntimeService] : [],
  );
  const taskInboundService = factories.createTaskInboundService(context, {
    taskConversationService,
    taskContextBindingService,
    taskService,
    taskParticipationService,
    runtimeThreadMessageRouter,
  });
  const discordPresenceService = factories.createDiscordPresenceService(context);
  const discordThreadIngressService = factories.createDiscordThreadIngressService?.(context, {
    taskContextBindingService,
    taskInboundService,
  });
  const ccConnectSessionMirrorService = overrides.createCcConnectSessionMirrorService
    ? overrides.createCcConnectSessionMirrorService(context, {
        liveSessionStore,
        taskParticipationService,
      })
    : new CcConnectSessionMirrorService({
        managementService: new CcConnectManagementService(),
        liveSessionStore,
        onSessionSync: (session: LiveSessionDto) => {
          taskParticipationService.syncLiveSession(session);
        },
        logger: {
          warn: (message, meta) => console.warn(message, meta),
        },
      });

  return {
    taskService,
    projectService,
    projectBrainService,
    contextRetrievalService,
    contextMaterializationService,
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
    ...(imProvisioningPort ? { imProvisioningPort } : {}),
    taskConversationService,
    taskInboundService,
    ...(ccConnectSessionMirrorService ? { ccConnectSessionMirrorService } : {}),
    ...(ccConnectBridgeRuntimeService ? { ccConnectBridgeRuntimeService } : {}),
    ...(discordPresenceService ? { discordPresenceService } : {}),
    ...(discordThreadIngressService ? { discordThreadIngressService } : {}),
  };
}

function defaultSessionAliveProbe(legacyRuntimeService: InteractiveRuntimePort) {
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
  legacyRuntimeService: InteractiveRuntimePort,
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

function createTransactionManager(db: AgoraDatabase): { begin(): void; commit(): void; rollback(): void } {
  return {
    begin: () => db.exec('BEGIN'),
    commit: () => db.exec('COMMIT'),
    rollback: () => db.exec('ROLLBACK'),
  };
}
