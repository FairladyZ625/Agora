import { resolve as resolvePath } from 'node:path';
import {
  ClaudeCraftsmanAdapter,
  CodexCraftsmanAdapter,
  createDefaultCraftsmanAdapters,
  CraftsmanDispatcher,
  DashboardQueryService,
  FileArchiveJobNotifier,
  FileArchiveJobReceiptIngestor,
  GeminiCraftsmanAdapter,
  GitWorktreeWorkdirIsolator,
  InboxService,
  LiveSessionStore,
  OpenClawAgentRegistry,
  OpenClawLogPresenceSource,
  resolveCraftsmanRuntimeMode,
  TaskService,
  TemplateAuthoringService,
  TmuxRuntimeService,
} from '@agora-ts/core';
import type { AgoraConfig } from '@agora-ts/config';
import type { AgoraDatabase } from '@agora-ts/db';

type RuntimeEnvironment = {
  apiBaseUrl: string;
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
}

export interface ServerCompositionFactories {
  createLiveSessionStore: (context: ServerCompositionContext) => LiveSessionStore;
  createAgentRegistry: (context: ServerCompositionContext) => OpenClawAgentRegistry;
  createPresenceSource: (context: ServerCompositionContext) => OpenClawLogPresenceSource;
  createCraftsmanDispatcher: (context: ServerCompositionContext) => CraftsmanDispatcher;
  createTmuxRuntimeService: (context: ServerCompositionContext) => TmuxRuntimeService;
  createTaskService: (
    context: ServerCompositionContext,
    deps: { craftsmanDispatcher: CraftsmanDispatcher; tmuxRuntimeService: TmuxRuntimeService },
  ) => TaskService;
  createArchiveJobNotifier: (context: ServerCompositionContext) => FileArchiveJobNotifier;
  createArchiveJobReceiptIngestor: (context: ServerCompositionContext) => FileArchiveJobReceiptIngestor;
  createDashboardQueryService: (
    context: ServerCompositionContext,
    deps: {
      liveSessionStore: LiveSessionStore;
      agentRegistry: OpenClawAgentRegistry;
      presenceSource: OpenClawLogPresenceSource;
      tmuxRuntimeService: TmuxRuntimeService;
      archiveJobNotifier: FileArchiveJobNotifier;
      archiveJobReceiptIngestor: FileArchiveJobReceiptIngestor;
    },
  ) => DashboardQueryService;
  createTemplateAuthoringService: (context: ServerCompositionContext) => TemplateAuthoringService;
  createInboxService: (context: ServerCompositionContext, deps: { taskService: TaskService }) => InboxService;
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
    createTaskService: (context, deps) => new TaskService(context.db, {
      templatesDir: context.templatesDir,
      archonUsers: context.config.permissions.archonUsers,
      allowAgents: context.config.permissions.allowAgents,
      craftsmanDispatcher: deps.craftsmanDispatcher,
      isCraftsmanSessionAlive: context.isCraftsmanSessionAlive ?? defaultSessionAliveProbe(deps.tmuxRuntimeService),
    }),
    createArchiveJobNotifier: () => new FileArchiveJobNotifier({
      outboxDir: process.env.AGORA_ARCHIVE_WRITER_OUTBOX_DIR ?? 'archive-outbox',
    }),
    createArchiveJobReceiptIngestor: () => new FileArchiveJobReceiptIngestor({
      receiptDir: process.env.AGORA_ARCHIVE_WRITER_RECEIPT_DIR ?? 'archive-receipts',
    }),
    createDashboardQueryService: (context, deps) => new DashboardQueryService(context.db, {
      templatesDir: context.templatesDir,
      archiveJobNotifier: deps.archiveJobNotifier,
      archiveJobReceiptIngestor: deps.archiveJobReceiptIngestor,
      liveSessions: deps.liveSessionStore,
      agentRegistry: deps.agentRegistry,
      presenceSource: deps.presenceSource,
      tmuxRuntimeService: deps.tmuxRuntimeService,
    }),
    createTemplateAuthoringService: (context) => new TemplateAuthoringService({ templatesDir: context.templatesDir }),
    createInboxService: (context, deps) => new InboxService(context.db, deps.taskService),
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
  const craftsmanDispatcher = factories.createCraftsmanDispatcher(context);
  const tmuxRuntimeService = factories.createTmuxRuntimeService(context);
  const taskService = factories.createTaskService(context, { craftsmanDispatcher, tmuxRuntimeService });
  const archiveJobNotifier = factories.createArchiveJobNotifier(context);
  const archiveJobReceiptIngestor = factories.createArchiveJobReceiptIngestor(context);
  const dashboardQueryService = factories.createDashboardQueryService(context, {
    liveSessionStore,
    agentRegistry,
    presenceSource,
    tmuxRuntimeService,
    archiveJobNotifier,
    archiveJobReceiptIngestor,
  });
  const templateAuthoringService = factories.createTemplateAuthoringService(context);
  const inboxService = factories.createInboxService(context, { taskService });

  return {
    taskService,
    dashboardQueryService,
    templateAuthoringService,
    inboxService,
    liveSessionStore,
    tmuxRuntimeService,
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
