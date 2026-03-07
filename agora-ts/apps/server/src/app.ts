import Fastify from 'fastify';
import type { HealthResponse } from '@agora-ts/contracts';

export function buildApp() {
  const app = Fastify({
    logger: false,
  });

  app.get('/api/health', async (): Promise<HealthResponse> => {
    return { status: 'ok' };
  });

  return app;
}
