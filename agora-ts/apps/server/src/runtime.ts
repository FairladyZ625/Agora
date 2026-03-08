import { createAgoraDatabase, runMigrations } from '@agora-ts/db';
import { createDefaultCraftsmanAdapters, CraftsmanDispatcher, DashboardQueryService, InboxService, LiveSessionStore, OpenClawAgentRegistry, OpenClawLogPresenceSource, TaskService, TemplateAuthoringService } from '@agora-ts/core';
import { loadAgoraConfig, resolveAgoraRuntimeEnvironmentFromConfigPackage, type AgoraConfig } from '@agora-ts/config';
import { existsSync } from 'node:fs';

export interface CreateServerRuntimeOptions {
  configPath?: string;
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
  const adapterMode = resolveCraftsmanAdapterMode();
  const craftsmanDispatcher = new CraftsmanDispatcher(db, {
    adapters: createDefaultCraftsmanAdapters({
      mode: adapterMode,
      callbackUrl: `${runtimeEnv.apiBaseUrl}/api/craftsmen/callback`,
      apiToken: config.api_auth.enabled ? config.api_auth.token : null,
    }),
  });
  const taskService = new TaskService(db, {
    templatesDir,
    archonUsers: config.permissions.archonUsers,
    allowAgents: config.permissions.allowAgents,
    craftsmanDispatcher,
  });
  const dashboardQueryService = new DashboardQueryService(db, {
    templatesDir,
    liveSessions: liveSessionStore,
    agentRegistry,
    presenceSource,
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
    apiAuth: config.api_auth,
    dashboardDir: resolveDashboardDir(),
  };
}

function resolveCraftsmanAdapterMode(): 'stub' | 'real' | 'watched' | 'tmux' {
  const mode = process.env.AGORA_CRAFTSMAN_ADAPTER_MODE;
  if (mode === 'real' || mode === 'watched' || mode === 'tmux') {
    return mode;
  }
  return 'stub';
}
