import { buildApp } from './app.js';
import { createServerRuntime } from './runtime.js';
import { resolveAgoraRuntimeEnvironmentFromConfigPackage } from '@agora-ts/config';

export function createAppFromRuntime(runtime: ReturnType<typeof createServerRuntime>) {
  return buildApp({
    db: runtime.db,
    taskService: runtime.taskService,
    dashboardQueryService: runtime.dashboardQueryService,
    inboxService: runtime.inboxService,
    templateAuthoringService: runtime.templateAuthoringService,
    liveSessionStore: runtime.liveSessionStore,
    tmuxRuntimeService: runtime.tmuxRuntimeService,
    taskContextBindingService: runtime.taskContextBindingService,
    taskConversationService: runtime.taskConversationService,
    taskParticipationService: runtime.taskParticipationService,
    humanAccountService: runtime.humanAccountService,
    notificationDispatcher: runtime.notificationDispatcher,
    apiAuth: runtime.apiAuth,
    dashboardAuth: runtime.dashboardAuth,
    rateLimit: runtime.rateLimit,
    observability: {
      readyPath: runtime.observability.ready_path,
      metricsEnabled: runtime.observability.metrics_enabled,
      structuredLogs: runtime.observability.structured_logs,
    },
    ...(runtime.dashboardDir ? { dashboardDir: runtime.dashboardDir } : {}),
  });
}

async function start() {
  const runtime = createServerRuntime();
  const environment = resolveAgoraRuntimeEnvironmentFromConfigPackage();
  const app = createAppFromRuntime(runtime);
  const port = Number(process.env.PORT ?? environment.backendPort);
  const host = process.env.HOST ?? process.env.AGORA_SERVER_HOST ?? environment.host;

  try {
    await app.listen({ port, host });
    app.log.info(`agora-ts server listening on http://${host}:${port}`);
  } catch (error) {
    app.log.error(error);
    process.exitCode = 1;
  }
}

void start();
