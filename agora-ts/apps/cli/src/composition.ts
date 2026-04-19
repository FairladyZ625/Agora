import { mkdirSync } from 'node:fs';
import {
  agoraDataDirPath,
  ensureBundledAgoraAssetsInstalled,
  hasInstalledBrainPack,
  loadAgoraConfig,
  normalizePathLikeEnvValue,
  resolveAgoraProjectStateLayout,
  refineProjectNomosDraftFromSpec,
  resolveProjectNomosRuntimePaths,
  resolveProjectNomosState,
  resolveAgoraRuntimeEnvironmentFromConfigPackage,
  syncBundledBrainPackContents,
  type AgoraConfig,
} from '@agora-ts/config';
import {
  createAgoraDatabase,
  runMigrations,
  type AgoraDatabase,
  CraftsmanExecutionRepository,
  SubtaskRepository,
  TaskRepository,
  TaskContextBindingRepository,
  TaskBrainBindingRepository,
  TaskConversationRepository,
  TaskConversationReadCursorRepository,
  ProjectBrainIndexJobRepository,
  HumanAccountRepository,
  HumanIdentityBindingRepository,
  ProjectMembershipRepository,
  ProjectAgentRosterRepository,
  ProjectRepository,
  CitizenRepository,
  RoleDefinitionRepository,
  RoleBindingRepository,
  FlowLogRepository,
  ProgressLogRepository,
  TodoRepository,
  ArchiveJobRepository,
  ApprovalRequestRepository,
  InboxRepository,
  NotificationOutboxRepository,
  TemplateRepository,
  ParticipantBindingRepository,
  RuntimeSessionBindingRepository,
  TaskAuthorityRepository,
  ProjectWriteLockRepository,
  SqliteGateQueryPort,
  SqliteGateCommandPort,
} from '@agora-ts/db';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { createDashboardSessionClient, type DashboardSessionClient } from './dashboard-session-client.js';
import {
  CitizenService,
  CompositeAgentInventorySource,
  CraftsmanCallbackService,
  CraftsmanDispatcher,
  DashboardQueryService,
  FileArchiveJobNotifier,
  FileArchiveJobReceiptIngestor,
  GitWorktreeWorkdirIsolator,
  HumanAccountService,
  InventoryBackedAgentRuntimePort,
  ContextSourceBindingService,
  ContextMaterializationService,
  ProjectBrainAutomationService,
  ProjectBrainChunkingPolicy,
  ProjectBrainIndexQueueService,
  ProjectBrainIndexService,
  ProjectBrainRetrievalService,
  ProjectBrainService,
  ProjectContextWriter,
  ProjectMembershipService,
  ProjectAgentRosterService,
  ProjectService,
  RetrievalRegistry,
  RetrievalService,
  StubIMMessagingPort,
  RolePackService,
  TaskAuthorityService,
  TaskBrainBindingService,
  type ProjectKnowledgePort,
  type ProjectBrainEmbeddingPort,
  type ProjectBrainVectorIndexPort,
  type CraftsmanInputPort,
  type CraftsmanExecutionProbePort,
  type CraftsmanExecutionTailPort,
  type InteractiveRuntimePort,
  type RuntimeRecoveryPort,
  type TaskBrainWorkspacePort,
  resolveCraftsmanRuntimeMode,
  TaskContextBindingService,
  TaskConversationService,
  TaskParticipationService,
  TaskService,
  TemplateAuthoringService,
  type AgentInventorySource,
  type AgentRuntimePort,
  type IMMessagingPort,
  type IMProvisioningPort,
} from '@agora-ts/core';
import { FilesystemContextSourceRetrievalAdapter, FilesystemSkillCatalogAdapter, FilesystemProjectBrainQueryAdapter, FilesystemProjectKnowledgeAdapter, FilesystemTaskBrainWorkspaceAdapter, OpenAiCompatibleProjectBrainEmbeddingAdapter, QdrantProjectBrainVectorIndexAdapter } from '@agora-ts/adapters-brain';
import { ProjectContextBriefingMaterializer, RuntimeRepoShimMaterializer } from '@agora-ts/adapters-materialization';
import { CcConnectAgentRegistry, CcConnectCitizenProjectionAdapter } from '@agora-ts/adapters-cc-connect';
import { ClaudeCraftsmanAdapter, CodexCraftsmanAdapter, GeminiCraftsmanAdapter } from '@agora-ts/adapters-craftsman';
import { OsHostResourcePort } from '@agora-ts/adapters-host';
import { AcpCraftsmanInputPort, AcpCraftsmanProbePort, AcpCraftsmanTailPort, AcpRuntimeRecoveryPort, createDefaultCraftsmanAdapters, DirectAcpxRuntimePort, TmuxCraftsmanInputPort, TmuxCraftsmanProbePort, TmuxCraftsmanTailPort, TmuxRuntimeRecoveryPort, TmuxRuntimeService } from '@agora-ts/adapters-runtime';
import { loadOpenClawDiscordAccountTokens, OpenClawAgentRegistry, OpenClawCitizenProjectionAdapter } from '@agora-ts/adapters-openclaw';
import { DiscordIMMessagingAdapter, DiscordIMProvisioningAdapter } from '@agora-ts/adapters-discord';
import { ObsidianContextSourceRetrievalAdapter } from '@agora-ts/adapters-obsidian';
import type { TransactionManager } from '@agora-ts/contracts';

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
      retrievalService?: Pick<RetrievalService, 'retrieve'>;
    },
  ) => ProjectBrainAutomationService;
  createContextMaterializationService: (
    context: CliCompositionContext,
    deps: {
      projectService: ProjectService;
      projectBrainAutomationService: ProjectBrainAutomationService;
    },
  ) => ContextMaterializationService;
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
      humanAccountService: HumanAccountService;
      contextMaterializationService: ContextMaterializationService;
      projectBrainAutomationService: ProjectBrainAutomationService;
      projectService: ProjectService;
      agentRuntimePort: AgentRuntimePort;
      craftsmanInputPort: CraftsmanInputPort;
      craftsmanExecutionProbePort: CraftsmanExecutionProbePort;
      craftsmanExecutionTailPort: CraftsmanExecutionTailPort;
      runtimeRecoveryPort: RuntimeRecoveryPort;
    },
  ) => TaskService;
  createLegacyRuntimeService: (context: CliCompositionContext) => InteractiveRuntimePort;
  createTmuxRuntimeService?: (context: CliCompositionContext) => InteractiveRuntimePort;
  createDashboardSessionClient: (context: CliCompositionContext) => DashboardSessionClient;
  createHumanAccountService: (context: CliCompositionContext) => HumanAccountService;
  createTaskConversationService: (context: CliCompositionContext) => TaskConversationService;
  createTemplateAuthoringService: (context: CliCompositionContext) => TemplateAuthoringService;
  createRolePackService: (context: CliCompositionContext) => RolePackService;
  createArchiveJobNotifier: (context: CliCompositionContext) => FileArchiveJobNotifier;
  createArchiveJobReceiptIngestor: (context: CliCompositionContext) => FileArchiveJobReceiptIngestor;
  createDashboardQueryService: (
    context: CliCompositionContext,
    deps: {
      agentRegistry: AgentInventorySource;
      archiveJobNotifier: FileArchiveJobNotifier;
      archiveJobReceiptIngestor: FileArchiveJobReceiptIngestor;
      imProvisioningPort: IMProvisioningPort | undefined;
      taskBrainBindingService: TaskBrainBindingService;
      taskBrainWorkspacePort: TaskBrainWorkspacePort;
      taskContextBindingService: TaskContextBindingService;
    },
  ) => DashboardQueryService;
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
  imProvisioningPort?: IMProvisioningPort;
  taskContextBindingService: TaskContextBindingService;
  projectService: ProjectService;
  projectBrainService: ProjectBrainService;
  projectBrainAutomationService: ProjectBrainAutomationService;
  contextMaterializationService: ContextMaterializationService;
  projectBrainIndexService?: ProjectBrainIndexService;
  projectBrainRetrievalService?: ProjectBrainRetrievalService;
  contextRetrievalService: RetrievalService;
  citizenService: CitizenService;
  legacyRuntimeService: InteractiveRuntimePort;
  tmuxRuntimeService: InteractiveRuntimePort;
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
      const adapters = createDefaultCraftsmanAdapters({
        mode,
        callbackUrl: `${context.runtimeEnv.apiBaseUrl}/api/craftsmen/callback`,
        apiToken: context.config.api_auth.enabled ? context.config.api_auth.token : null,
        ...(acpRuntime ? { acpRuntime } : {}),
      });
      const options: ConstructorParameters<typeof CraftsmanDispatcher>[0] = {
        executionRepository: new CraftsmanExecutionRepository(context.db),
        subtaskRepository: new SubtaskRepository(context.db),
        maxConcurrentRunning: context.config.craftsmen.max_concurrent_running,
        adapters,
      };
      if (context.config.craftsmen.isolate_git_worktrees) {
        options.workdirIsolator = new GitWorktreeWorkdirIsolator({
          rootDir: resolvePath(context.config.craftsmen.isolated_root),
        });
      }
      return new CraftsmanDispatcher(options);
    },
    createAgentRuntimePort: () => {
      const registry = new CompositeAgentInventorySource([
        new OpenClawAgentRegistry(
          process.env.AGORA_OPENCLAW_CONFIG_PATH
            ? { configPath: process.env.AGORA_OPENCLAW_CONFIG_PATH }
            : {},
        ),
        new CcConnectAgentRegistry(),
      ]);
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
    createTaskContextBindingService: (context) => new TaskContextBindingService({
      repository: new TaskContextBindingRepository(context.db),
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
    createCitizenService: (context, deps) => new CitizenService({
      repository: new CitizenRepository(context.db),
      projectService: deps.projectService,
      rolePackService: deps.rolePackService,
      projectionPorts: [new OpenClawCitizenProjectionAdapter(), new CcConnectCitizenProjectionAdapter()],
    }),
    createProjectBrainAutomationService: (_context, deps) => new ProjectBrainAutomationService({
      projectBrainService: deps.projectBrainService,
      taskBrainBindingService: deps.taskBrainBindingService,
      taskBrainWorkspacePort: deps.taskBrainWorkspacePort,
      ...(deps.retrievalService ? { retrievalService: deps.retrievalService } : {}),
    }),
    createContextMaterializationService: (_context, deps) => new ContextMaterializationService({
      ports: [
        new ProjectContextBriefingMaterializer({
          projectBrainAutomationService: deps.projectBrainAutomationService,
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
    createTaskService: (context, deps) => new TaskService({
      archonUsers: context.config.permissions.archonUsers,
      allowAgents: context.config.permissions.allowAgents,
      craftsmanDispatcher: deps.craftsmanDispatcher,
      taskBrainBindingService: deps.taskBrainBindingService,
      taskBrainWorkspacePort: deps.taskBrainWorkspacePort,
      imMessagingPort: deps.messagingPort,
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
      projectBrainAutomationService: deps.projectBrainAutomationService,
      projectService: deps.projectService,
      agentRuntimePort: deps.agentRuntimePort,
      runtimeRecoveryPort: deps.runtimeRecoveryPort,
      craftsmanInputPort: deps.craftsmanInputPort,
      craftsmanExecutionProbePort: deps.craftsmanExecutionProbePort,
      craftsmanExecutionTailPort: deps.craftsmanExecutionTailPort,
      hostResourcePort: new OsHostResourcePort(),
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
      ...(deps.imProvisioningPort ? { imProvisioningPort: deps.imProvisioningPort } : {}),
      databasePort: context.db,
      gateQueryPort: new SqliteGateQueryPort(context.db),
      gateCommandPort: new SqliteGateCommandPort(context.db),
      repositories: {
        task: new TaskRepository(context.db),
        flowLog: new FlowLogRepository(context.db),
        progressLog: new ProgressLogRepository(context.db),
        subtask: new SubtaskRepository(context.db),
        taskContextBinding: new TaskContextBindingRepository(context.db),
        taskConversation: new TaskConversationRepository(context.db),
        todo: new TodoRepository(context.db),
        archiveJob: new ArchiveJobRepository(context.db),
        approvalRequest: new ApprovalRequestRepository(context.db),
        inbox: new InboxRepository(context.db),
        craftsmanExecution: new CraftsmanExecutionRepository(context.db),
        template: new TemplateRepository(context.db),
      },
      subServices: {
        taskAuthority: new TaskAuthorityService({
          repository: new TaskAuthorityRepository(context.db),
        }),
        projectMembership: new ProjectMembershipService({
          membershipRepository: new ProjectMembershipRepository(context.db),
          accountRepository: new HumanAccountRepository(context.db),
        }),
        projectAgentRoster: new ProjectAgentRosterService({
          repository: new ProjectAgentRosterRepository(context.db),
        }),
        craftsmanCallback: new CraftsmanCallbackService({
          executionRepository: new CraftsmanExecutionRepository(context.db),
          subtaskRepository: new SubtaskRepository(context.db),
          taskRepository: new TaskRepository(context.db),
          flowLogRepository: new FlowLogRepository(context.db),
          progressLogRepository: new ProgressLogRepository(context.db),
          outboxRepository: new NotificationOutboxRepository(context.db),
          bindingRepository: new TaskContextBindingRepository(context.db),
          conversationRepository: new TaskConversationRepository(context.db),
        }),
        projectContextWriter: new ProjectContextWriter({
          writeLockRepository: new ProjectWriteLockRepository(context.db),
          projectService: deps.projectService,
          taskBrainWorkspacePort: deps.taskBrainWorkspacePort,
        }),
      },
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
    createHumanAccountService: (context) => new HumanAccountService({
      accountRepository: new HumanAccountRepository(context.db),
      identityBindingRepository: new HumanIdentityBindingRepository(context.db),
    }),
    createTaskConversationService: (context) => new TaskConversationService({
      bindingRepository: new TaskContextBindingRepository(context.db),
      conversationRepository: new TaskConversationRepository(context.db),
      readCursorRepository: new TaskConversationReadCursorRepository(context.db),
    }),
    createTemplateAuthoringService: (context) => new TemplateAuthoringService({
      templatesDir: context.templatesDir,
      templateRepository: new TemplateRepository(context.db),
    }),
    createRolePackService: (context) => new RolePackService({
      roleDefinitions: new RoleDefinitionRepository(context.db),
      roleBindings: new RoleBindingRepository(context.db),
      rolePacksDir: context.rolePackDir,
    }),
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
      agentRegistry: deps.agentRegistry,
      archiveJobNotifier: deps.archiveJobNotifier,
      archiveJobReceiptIngestor: deps.archiveJobReceiptIngestor,
      taskBrainBindingService: deps.taskBrainBindingService,
      taskBrainWorkspacePort: deps.taskBrainWorkspacePort,
      taskContextBindingService: deps.taskContextBindingService,
      ...(deps.imProvisioningPort ? { imProvisioningPort: deps.imProvisioningPort } : {}),
      skillCatalogPort: new FilesystemSkillCatalogAdapter(),
    }),
    createTaskBrainBindingService: (context) => new TaskBrainBindingService({
      repository: new TaskBrainBindingRepository(context.db),
    }),
    createTaskBrainWorkspacePort: (context) => new FilesystemTaskBrainWorkspaceAdapter({
      brainPackRoot: context.brainPackDir,
      projectStateRootResolver: (projectId) => resolveAgoraProjectStateLayout(projectId).root,
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
  const loadedConfig = loadAgoraConfig(options.configPath ?? normalizePathLikeEnvValue('AGORA_CONFIG_PATH', process.env.AGORA_CONFIG_PATH) ?? '');
  const runtimeEnv = resolveAgoraRuntimeEnvironmentFromConfigPackage();
  const resolvedDbPath = options.dbPath ?? normalizePathLikeEnvValue('AGORA_DB_PATH', process.env.AGORA_DB_PATH) ?? loadedConfig.db_path;
  const config: AgoraConfig = {
    ...loadedConfig,
    db_path: resolvedDbPath,
  };
  const db = createAgoraDatabase({
    dbPath: resolvedDbPath,
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
  const contextSourceBindingService = new ContextSourceBindingService({
    projectService,
  });
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
  const retrievalRegistry = new RetrievalRegistry([
    new FilesystemContextSourceRetrievalAdapter({
      listProjectBindings: (projectId: string) => contextSourceBindingService.listProjectBindings(projectId),
    }),
    new ObsidianContextSourceRetrievalAdapter({
      listProjectBindings: (projectId: string) => contextSourceBindingService.listProjectBindings(projectId),
    }),
    ...(projectBrainRetrievalService ? [projectBrainRetrievalService] : []),
  ]);
  const contextRetrievalService = new RetrievalService({
    registry: retrievalRegistry,
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
    retrievalService: contextRetrievalService,
  });
  const contextMaterializationService = factories.createContextMaterializationService(context, {
    projectService,
    projectBrainAutomationService,
  });
  const humanAccountService = factories.createHumanAccountService(context);
  const taskService = factories.createTaskService(context, {
    craftsmanDispatcher,
    taskBrainBindingService,
    taskBrainWorkspacePort,
    imProvisioningPort,
    messagingPort,
    taskContextBindingService,
    taskParticipationService,
    humanAccountService,
    contextMaterializationService,
    projectBrainAutomationService,
    projectService,
    agentRuntimePort,
    ...createCraftsmanTransportDeps(craftsmanMode, legacyRuntimeService, acpRuntime),
  });
  taskServiceRef = taskService;
  const dashboardSessionClient = factories.createDashboardSessionClient(context);
  const taskConversationService = factories.createTaskConversationService(context);
  const templateAuthoringService = factories.createTemplateAuthoringService(context);
  const archiveJobNotifier = factories.createArchiveJobNotifier(context);
  const archiveJobReceiptIngestor = factories.createArchiveJobReceiptIngestor(context);
  const dashboardQueryService = factories.createDashboardQueryService(context, {
    agentRegistry: new CompositeAgentInventorySource([
      new OpenClawAgentRegistry(
        process.env.AGORA_OPENCLAW_CONFIG_PATH
          ? { configPath: process.env.AGORA_OPENCLAW_CONFIG_PATH }
          : {},
      ),
      new CcConnectAgentRegistry(),
    ]),
    archiveJobNotifier,
    archiveJobReceiptIngestor,
    imProvisioningPort,
    taskBrainBindingService,
    taskBrainWorkspacePort,
    taskContextBindingService,
  });
  return {
    config,
    db,
    taskService,
    taskContextBindingService,
    ...(imProvisioningPort ? { imProvisioningPort } : {}),
    projectService,
    projectBrainService,
    projectBrainAutomationService,
    contextMaterializationService,
    ...(projectBrainIndexService ? { projectBrainIndexService } : {}),
    ...(projectBrainRetrievalService ? { projectBrainRetrievalService } : {}),
    contextRetrievalService,
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

function createTransactionManager(db: AgoraDatabase): TransactionManager {
  return {
    begin: () => db.exec('BEGIN'),
    commit: () => db.exec('COMMIT'),
    rollback: () => db.exec('ROLLBACK'),
  };
}
