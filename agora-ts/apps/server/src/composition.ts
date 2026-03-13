import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';
import {
  ClaudeCraftsmanAdapter,
  CodexCraftsmanAdapter,
  createDefaultCraftsmanAdapters,
  CraftsmanDispatcher,
  DashboardQueryService,
  FilesystemTaskBrainWorkspaceAdapter,
  FileArchiveJobNotifier,
  FileArchiveJobReceiptIngestor,
  GeminiCraftsmanAdapter,
  GitWorktreeWorkdirIsolator,
  InboxService,
  InventoryBackedAgentRuntimePort,
  LiveSessionStore,
  NotificationDispatcher,
  HumanAccountService,
  TmuxCraftsmanInputPort,
  TmuxCraftsmanProbePort,
  type TaskBrainWorkspacePort,
  TaskBrainBindingService,
  StubIMMessagingPort,
  TaskConversationService,
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
import { DiscordIMMessagingAdapter, DiscordIMProvisioningAdapter } from '@agora-ts/adapters-discord';
import { agoraDataDirPath, type AgoraConfig } from '@agora-ts/config';
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
  isCraftsmanSessionAlive?: (sessionId: string) => boolean;
}

export interface ServerCompositionOptions {
  isCraftsmanSessionAlive?: (sessionId: string) => boolean;
}

export interface ServerComposition {
  taskService: TaskService;
  dashboardQueryService: DashboardQueryService;
  templateAuthoringService: TemplateAuthoringService;
  inboxService: InboxService;
  liveSessionStore: LiveSessionStore;
  tmuxRuntimeService: TmuxRuntimeService;
  taskContextBindingService: TaskContextBindingService;
  taskParticipationService: TaskParticipationService;
  humanAccountService: HumanAccountService;
  notificationDispatcher: NotificationDispatcher;
  taskConversationService: TaskConversationService;
}

export interface ServerCompositionFactories {
  createLiveSessionStore: (context: ServerCompositionContext) => LiveSessionStore;
  createAgentRegistry: (context: ServerCompositionContext) => AgentInventorySource;
  createPresenceSource: (context: ServerCompositionContext) => PresenceSource;
  createAgentRuntimePort: (context: ServerCompositionContext, deps: { agentRegistry: AgentInventorySource }) => AgentRuntimePort;
  createCraftsmanDispatcher: (context: ServerCompositionContext) => CraftsmanDispatcher;
  createTmuxRuntimeService: (context: ServerCompositionContext) => TmuxRuntimeService;
  createTaskService: (
    context: ServerCompositionContext,
    deps: {
      craftsmanDispatcher: CraftsmanDispatcher;
      tmuxRuntimeService: TmuxRuntimeService;
      imProvisioningPort: IMProvisioningPort | undefined;
      messagingPort: IMMessagingPort;
      taskBrainBindingService: TaskBrainBindingService;
      taskBrainWorkspacePort: TaskBrainWorkspacePort;
      taskContextBindingService: TaskContextBindingService;
      taskParticipationService: TaskParticipationService;
      agentRuntimePort: AgentRuntimePort;
      craftsmanInputPort: TmuxCraftsmanInputPort;
      craftsmanExecutionProbePort: TmuxCraftsmanProbePort;
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
      tmuxRuntimeService: TmuxRuntimeService;
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
  createTaskParticipationService: (
    context: ServerCompositionContext,
    deps: { agentRuntimePort: AgentRuntimePort },
  ) => TaskParticipationService;
  createHumanAccountService: (context: ServerCompositionContext) => HumanAccountService;
  createNotificationDispatcher: (context: ServerCompositionContext, deps: { messagingPort: IMMessagingPort }) => NotificationDispatcher;
  createTaskConversationService: (context: ServerCompositionContext) => TaskConversationService;
}

function ensureRuntimeBrainPackRoot(projectRoot: string): string {
  const explicitRoot = process.env.AGORA_BRAIN_PACK_ROOT;
  const runtimeBrainPackDir = explicitRoot
    ? resolvePath(explicitRoot)
    : resolvePath(agoraDataDirPath(), 'agora-ai-brain');
  if (existsSync(runtimeBrainPackDir)) {
    return runtimeBrainPackDir;
  }
  const bundledBrainPackDir = resolvePath(projectRoot, 'agora-ai-brain');
  mkdirSync(runtimeBrainPackDir, { recursive: true });
  cpSync(bundledBrainPackDir, runtimeBrainPackDir, {
    recursive: true,
    filter: (source) => !source.startsWith(resolvePath(bundledBrainPackDir, 'tasks')),
  });
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
    createCraftsmanDispatcher: (context) => {
      const adapterMode = resolveCraftsmanRuntimeMode('server');
      const dispatcherOptions: ConstructorParameters<typeof CraftsmanDispatcher>[1] = {
        maxConcurrentRunning: context.config.craftsmen.max_concurrent_running,
        adapters: createDefaultCraftsmanAdapters({
          mode: adapterMode,
          callbackUrl: `${context.runtimeEnv.apiBaseUrl}/api/craftsmen/callback`,
          apiToken: context.config.api_auth.enabled ? context.config.api_auth.token : null,
        }),
      };
      if (context.config.craftsmen.isolate_git_worktrees) {
        dispatcherOptions.workdirIsolator = new GitWorktreeWorkdirIsolator({
          rootDir: resolvePath(context.config.craftsmen.isolated_root),
        });
      }
      return new CraftsmanDispatcher(context.db, dispatcherOptions);
    },
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
        isCraftsmanSessionAlive: context.isCraftsmanSessionAlive ?? defaultSessionAliveProbe(deps.tmuxRuntimeService),
        imMessagingPort: deps.messagingPort,
        taskBrainBindingService: deps.taskBrainBindingService,
        taskBrainWorkspacePort: deps.taskBrainWorkspacePort,
        taskContextBindingService: deps.taskContextBindingService,
        taskParticipationService: deps.taskParticipationService,
        agentRuntimePort: deps.agentRuntimePort,
        craftsmanInputPort: deps.craftsmanInputPort,
        craftsmanExecutionProbePort: deps.craftsmanExecutionProbePort,
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
      tmuxRuntimeService: deps.tmuxRuntimeService,
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
      brainPackRoot: ensureRuntimeBrainPackRoot(context.runtimeEnv.projectRoot),
    }),
    createTaskParticipationService: (context, deps) => new TaskParticipationService(context.db, {
      agentRuntimePort: deps.agentRuntimePort,
    }),
    createHumanAccountService: (context) => new HumanAccountService(context.db),
    createNotificationDispatcher: (context, deps) => new NotificationDispatcher(context.db, { messagingPort: deps.messagingPort }),
    createTaskConversationService: (context) => new TaskConversationService(context.db),
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
  const craftsmanDispatcher = factories.createCraftsmanDispatcher(context);
  const tmuxRuntimeService = factories.createTmuxRuntimeService(context);
  const taskContextBindingService = factories.createTaskContextBindingService(context);
  const taskBrainBindingService = factories.createTaskBrainBindingService(context);
  const taskBrainWorkspacePort = factories.createTaskBrainWorkspacePort(context);
  const taskParticipationService = factories.createTaskParticipationService(context, { agentRuntimePort });
  const humanAccountService = factories.createHumanAccountService(context);
  const imProvisioningPort = factories.createIMProvisioningPort(context);
  const messagingPort = factories.createIMMessagingPort(context);
  const taskService = factories.createTaskService(context, {
    craftsmanDispatcher,
    tmuxRuntimeService,
    imProvisioningPort,
    messagingPort,
    taskBrainBindingService,
    taskBrainWorkspacePort,
    taskContextBindingService,
    taskParticipationService,
    agentRuntimePort,
    craftsmanInputPort: new TmuxCraftsmanInputPort(tmuxRuntimeService),
    craftsmanExecutionProbePort: new TmuxCraftsmanProbePort(tmuxRuntimeService),
  });
  const archiveJobNotifier = factories.createArchiveJobNotifier(context);
  const archiveJobReceiptIngestor = factories.createArchiveJobReceiptIngestor(context);
  const dashboardQueryService = factories.createDashboardQueryService(context, {
    liveSessionStore,
    agentRegistry,
    presenceSource,
    tmuxRuntimeService,
    archiveJobNotifier,
    archiveJobReceiptIngestor,
    imProvisioningPort,
    taskContextBindingService,
  });
  const templateAuthoringService = factories.createTemplateAuthoringService(context);
  const inboxService = factories.createInboxService(context, { taskService });
  const notificationDispatcher = factories.createNotificationDispatcher(context, { messagingPort });
  const taskConversationService = factories.createTaskConversationService(context);

  return {
    taskService,
    dashboardQueryService,
    templateAuthoringService,
    inboxService,
    liveSessionStore,
    tmuxRuntimeService,
    taskContextBindingService,
    taskParticipationService,
    humanAccountService,
    notificationDispatcher,
    taskConversationService,
  };
}

function defaultSessionAliveProbe(tmuxRuntimeService: TmuxRuntimeService) {
  return (sessionId: string) => {
    if (!sessionId.startsWith('tmux:')) {
      return true;
    }
    try {
      return tmuxRuntimeService.status().panes.some((pane) => pane.transportSessionId === sessionId);
    } catch {
      return true;
    }
  };
}
