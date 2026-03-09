import { createAgoraDatabase, runMigrations } from '@agora-ts/db';
import { ClaudeCraftsmanAdapter, CodexCraftsmanAdapter, createDefaultCraftsmanAdapters, CraftsmanDispatcher, DashboardQueryService, FileArchiveJobNotifier, FileArchiveJobReceiptIngestor, GeminiCraftsmanAdapter, GitWorktreeWorkdirIsolator, InboxService, LiveSessionStore, OpenClawAgentRegistry, OpenClawLogPresenceSource, resolveCraftsmanRuntimeMode, TaskService, TemplateAuthoringService, TmuxRuntimeService } from '@agora-ts/core';
import { loadAgoraConfig, resolveAgoraRuntimeEnvironmentFromConfigPackage, type AgoraConfig } from '@agora-ts/config';
import { existsSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

export interface CreateServerRuntimeOptions {
  configPath?: string;
  isCraftsmanSessionAlive?: (sessionId: string) => boolean;
}

function resolveDashboardDir() {
  const explicit = process.env.AGORA_DASHBOARD_DIR;
  if (explicit && existsSync(explicit)) {
    return explicit;
  }
  const distDir = new URL('../../../../dashboard/dist', import.meta.url).pathname;
  if (existsSync(distDir)) {
    return distDir;
  }
  const dashboardRoot = new URL('../../../../dashboard', import.meta.url).pathname;
  if (existsSync(dashboardRoot)) {
    return dashboardRoot;
  }
  return undefined;
}

export function createServerRuntime(options: CreateServerRuntimeOptions = {}) {
  const config = loadAgoraConfig(options.configPath ?? process.env.AGORA_CONFIG_PATH ?? '');
  const runtimeEnv = resolveAgoraRuntimeEnvironmentFromConfigPackage();
  const db = createAgoraDatabase({ dbPath: config.db_path });
  runMigrations(db);
  const templatesDir = new URL('../../../../agora/templates', import.meta.url).pathname;
  const liveSessionStore = new LiveSessionStore({
    staleAfterMs: Number(process.env.AGORA_LIVE_SESSION_TTL_MS ?? 15 * 60 * 1000),
  });
  const agentRegistry = new OpenClawAgentRegistry(
    process.env.AGORA_OPENCLAW_CONFIG_PATH
      ? { configPath: process.env.AGORA_OPENCLAW_CONFIG_PATH }
      : {},
  );
  const presenceSource = new OpenClawLogPresenceSource(
    process.env.AGORA_OPENCLAW_GATEWAY_LOG_PATH
      ? {
          logPath: process.env.AGORA_OPENCLAW_GATEWAY_LOG_PATH,
          staleAfterMs: Number(process.env.AGORA_PROVIDER_STALE_AFTER_MS ?? 10 * 60 * 1000),
        }
      : {
          staleAfterMs: Number(process.env.AGORA_PROVIDER_STALE_AFTER_MS ?? 10 * 60 * 1000),
        },
  );
  const adapterMode = resolveCraftsmanRuntimeMode('server');
  const dispatcherOptions: ConstructorParameters<typeof CraftsmanDispatcher>[1] = {
    maxConcurrentRunning: config.craftsmen.max_concurrent_running,
    adapters: createDefaultCraftsmanAdapters({
      mode: adapterMode,
      callbackUrl: `${runtimeEnv.apiBaseUrl}/api/craftsmen/callback`,
      apiToken: config.api_auth.enabled ? config.api_auth.token : null,
    }),
  };
  if (config.craftsmen.isolate_git_worktrees) {
    dispatcherOptions.workdirIsolator = new GitWorktreeWorkdirIsolator({
      rootDir: resolvePath(config.craftsmen.isolated_root),
    });
  }
  const craftsmanDispatcher = new CraftsmanDispatcher(db, dispatcherOptions);
  const tmuxRuntimeService = new TmuxRuntimeService({
    adapters: {
      codex: new CodexCraftsmanAdapter(),
      claude: new ClaudeCraftsmanAdapter(),
      gemini: new GeminiCraftsmanAdapter(),
    },
  });
  const isCraftsmanSessionAlive = options.isCraftsmanSessionAlive ?? ((sessionId: string) => {
    if (!sessionId.startsWith('tmux:')) {
      return true;
    }
    try {
      return tmuxRuntimeService.status().panes.some((pane) => pane.transportSessionId === sessionId);
    } catch {
      return true;
    }
  });
  const taskService = new TaskService(db, {
    templatesDir,
    archonUsers: config.permissions.archonUsers,
    allowAgents: config.permissions.allowAgents,
    craftsmanDispatcher,
    isCraftsmanSessionAlive,
  });
  if (config.scheduler.startup_recovery_on_boot) {
    taskService.startupRecoveryScan();
  }
  const dashboardQueryService = new DashboardQueryService(db, {
    templatesDir,
    archiveJobNotifier: new FileArchiveJobNotifier({
      outboxDir: process.env.AGORA_ARCHIVE_WRITER_OUTBOX_DIR ?? 'archive-outbox',
    }),
    archiveJobReceiptIngestor: new FileArchiveJobReceiptIngestor({
      receiptDir: process.env.AGORA_ARCHIVE_WRITER_RECEIPT_DIR ?? 'archive-receipts',
    }),
    liveSessions: liveSessionStore,
    agentRegistry,
    presenceSource,
    tmuxRuntimeService,
  });
  const templateAuthoringService = new TemplateAuthoringService({ templatesDir });
  const inboxService = new InboxService(db, taskService);

  return {
    config: config as AgoraConfig,
    db,
    taskService,
    dashboardQueryService,
    templateAuthoringService,
    inboxService,
    liveSessionStore,
    tmuxRuntimeService,
    apiAuth: config.api_auth,
    dashboardAuth: {
      enabled: config.dashboard_auth.enabled,
      method: config.dashboard_auth.method,
      allowedUsers: config.dashboard_auth.allowed_users,
      password: process.env.AGORA_DASHBOARD_BASIC_PASSWORD ?? null,
    },
    rateLimit: {
      enabled: config.rate_limit.enabled,
      windowMs: config.rate_limit.window_ms,
      maxRequests: config.rate_limit.max_requests,
      writeMaxRequests: config.rate_limit.write_max_requests,
    },
    observability: config.observability,
    dashboardDir: resolveDashboardDir(),
  };
}
