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

export interface ObservationSchedulerTickResult {
  observed_at: string;
  craftsman: {
    scanned: number;
    probed: number;
    progressed: number;
  };
  tasks: {
    scanned_tasks: number;
    controller_pings: number;
    roster_pings: number;
    inbox_items: number;
  };
}

export interface ObservationSchedulerController {
  enabled: boolean;
  interval_ms: number | null;
  tick: () => ObservationSchedulerTickResult;
  stop: () => void;
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

function createObservationScheduler(runtime: {
  config: AgoraConfig;
  taskService: {
    observeCraftsmanExecutions: (input: { runningAfterMs: number; waitingAfterMs: number }) => {
      scanned: number;
      probed: number;
      progressed: number;
    };
    probeInactiveTasks: (input: { controllerAfterMs: number; rosterAfterMs: number; inboxAfterMs: number }) => {
      scanned_tasks: number;
      controller_pings: number;
      roster_pings: number;
      inbox_items: number;
    };
  };
}): ObservationSchedulerController {
  const { scheduler } = runtime.config;
  const intervalMs = scheduler.enabled ? scheduler.scan_interval_sec * 1000 : null;
  const tick = (): ObservationSchedulerTickResult => ({
    observed_at: new Date().toISOString(),
    craftsman: runtime.taskService.observeCraftsmanExecutions({
      runningAfterMs: scheduler.craftsman_running_after_sec * 1000,
      waitingAfterMs: scheduler.craftsman_waiting_after_sec * 1000,
    }),
    tasks: runtime.taskService.probeInactiveTasks({
      controllerAfterMs: scheduler.task_probe_controller_after_sec * 1000,
      rosterAfterMs: scheduler.task_probe_roster_after_sec * 1000,
      inboxAfterMs: scheduler.task_probe_inbox_after_sec * 1000,
    }),
  });

  let timer: NodeJS.Timeout | null = null;
  if (intervalMs !== null) {
    timer = setInterval(() => {
      try {
        tick();
      } catch (error) {
        console.error('[agora] observation scheduler tick failed', error);
      }
    }, intervalMs);
    timer.unref?.();
  }

  return {
    enabled: scheduler.enabled,
    interval_ms: intervalMs,
    tick,
    stop: () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}

export function createServerRuntime(options: CreateServerRuntimeOptions = {}) {
  const config = loadAgoraConfig(options.configPath ?? process.env.AGORA_CONFIG_PATH ?? '');
  const runtimeEnv = resolveAgoraRuntimeEnvironmentFromConfigPackage();
  ensureBundledAgoraAssetsInstalled({
    projectRoot: runtimeEnv.projectRoot ?? new URL('../../../../', import.meta.url).pathname,
  });
  const db = createAgoraDatabase({ dbPath: config.db_path, busyTimeoutMs: config.db_busy_timeout_ms });
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
  composition.discordPresenceService?.start();
  if (config.scheduler.startup_recovery_on_boot) {
    taskService.startupRecoveryScan();
  }
  const observationScheduler = createObservationScheduler({
    config,
    taskService,
  });
  const dispose = () => {
    composition.discordPresenceService?.stop();
    observationScheduler.stop();
  };

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
    observationScheduler,
    discordPresenceService: composition.discordPresenceService,
    dispose,
  };
}
