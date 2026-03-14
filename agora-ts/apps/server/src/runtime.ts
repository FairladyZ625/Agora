import { createAgoraDatabase, runMigrations } from '@agora-ts/db';
import type { ServerCompositionFactories, ServerCompositionOptions } from './composition.js';
import { buildServerComposition } from './composition.js';
import {
  ensureBundledAgoraAssetsInstalled,
  loadAgoraConfig,
  resolveAgoraRuntimeEnvironmentFromConfigPackage,
  type AgoraConfig,
} from '@agora-ts/config';
import { existsSync } from 'node:fs';

export interface CreateServerRuntimeOptions extends ServerCompositionOptions {
  configPath?: string;
  factories?: Partial<ServerCompositionFactories>;
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
  return undefined;
}

export function createServerRuntime(options: CreateServerRuntimeOptions = {}) {
  const config = loadAgoraConfig(options.configPath ?? process.env.AGORA_CONFIG_PATH ?? '');
  const runtimeEnv = resolveAgoraRuntimeEnvironmentFromConfigPackage();
  ensureBundledAgoraAssetsInstalled({
    projectRoot: runtimeEnv.projectRoot ?? new URL('../../../../', import.meta.url).pathname,
  });
  const db = createAgoraDatabase({ dbPath: config.db_path });
  runMigrations(db);
  const templatesDir = new URL('../../../templates', import.meta.url).pathname;
  const composition = buildServerComposition({
    config,
    runtimeEnv,
    db,
    templatesDir,
    ...(options.isCraftsmanSessionAlive ? { isCraftsmanSessionAlive: options.isCraftsmanSessionAlive } : {}),
  }, options.factories);
  const { taskService } = composition;
  if (config.scheduler.startup_recovery_on_boot) {
    taskService.startupRecoveryScan();
  }

  return {
    config: config as AgoraConfig,
    db,
    ...composition,
    apiAuth: config.api_auth,
    dashboardAuth: {
      enabled: config.dashboard_auth.enabled,
      method: config.dashboard_auth.method,
      allowedUsers: config.dashboard_auth.allowed_users,
      password: process.env.AGORA_DASHBOARD_BASIC_PASSWORD ?? null,
      sessionTtlHours: config.dashboard_auth.session_ttl_hours,
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
