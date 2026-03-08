import { createAgoraDatabase, runMigrations } from '@agora-ts/db';
import { DashboardQueryService, InboxService, LiveSessionStore, OpenClawAgentRegistry, OpenClawLogPresenceSource, TaskService, TemplateAuthoringService } from '@agora-ts/core';
import { loadAgoraConfig, type AgoraConfig } from '@agora-ts/config';
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
  const db = createAgoraDatabase({ dbPath: config.db_path });
  runMigrations(db);
  const templatesDir = new URL('../../../../agora/templates', import.meta.url).pathname;
  const liveSessionStore = new LiveSessionStore();
  const agentRegistry = new OpenClawAgentRegistry(
    process.env.AGORA_OPENCLAW_CONFIG_PATH
      ? { configPath: process.env.AGORA_OPENCLAW_CONFIG_PATH }
      : {},
  );
  const presenceSource = new OpenClawLogPresenceSource(
    process.env.AGORA_OPENCLAW_GATEWAY_LOG_PATH
      ? { logPath: process.env.AGORA_OPENCLAW_GATEWAY_LOG_PATH }
      : {},
  );
  const taskService = new TaskService(db, {
    templatesDir,
    archonUsers: config.permissions.archonUsers,
    allowAgents: config.permissions.allowAgents,
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
