import { buildApp } from './app.js';

async function start() {
  const app = buildApp();
  const port = Number(process.env.PORT ?? '8420');
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
