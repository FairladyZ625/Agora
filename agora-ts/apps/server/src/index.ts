import { buildApp } from './app.js';
import { createServerRuntime } from './runtime.js';

async function start() {
const runtime = createServerRuntime();
const app = buildApp({
  taskService: runtime.taskService,
  dashboardQueryService: runtime.dashboardQueryService,
  inboxService: runtime.inboxService,
  templateAuthoringService: runtime.templateAuthoringService,
  liveSessionStore: runtime.liveSessionStore,
  apiAuth: runtime.apiAuth,
  ...(runtime.dashboardDir ? { dashboardDir: runtime.dashboardDir } : {}),
});
  const port = Number(process.env.PORT ?? process.env.AGORA_BACKEND_PORT ?? '8420');
  const host = process.env.HOST ?? '127.0.0.1';

  try {
    await app.listen({ port, host });
    app.log.info(`agora-ts server listening on http://${host}:${port}`);
  } catch (error) {
    app.log.error(error);
    process.exitCode = 1;
  }
}

void start();
