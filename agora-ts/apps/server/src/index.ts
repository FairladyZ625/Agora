import { buildApp } from './app.js';
import { createServerRuntime } from './runtime.js';
import { resolveAgoraRuntimeEnvironmentFromConfigPackage } from '@agora-ts/config';

async function start() {
  const runtime = createServerRuntime();
  const environment = resolveAgoraRuntimeEnvironmentFromConfigPackage();
  const app = buildApp({
    taskService: runtime.taskService,
    dashboardQueryService: runtime.dashboardQueryService,
    inboxService: runtime.inboxService,
    templateAuthoringService: runtime.templateAuthoringService,
    liveSessionStore: runtime.liveSessionStore,
    tmuxRuntimeService: runtime.tmuxRuntimeService,
    apiAuth: runtime.apiAuth,
    ...(runtime.dashboardDir ? { dashboardDir: runtime.dashboardDir } : {}),
  });
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
