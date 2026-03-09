import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach } from 'vitest';
import { createAgoraDatabase, runMigrations } from '@agora-ts/db';
import { TaskService } from '@agora-ts/core';
import { buildApp } from './app.js';

const tempPaths: string[] = [];
const templatesDir = resolve(process.cwd(), '../agora/templates');

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-app-test-'));
  tempPaths.push(dir);
  return join(dir, 'tasks.db');
}

afterEach(() => {
  while (tempPaths.length > 0) {
    const dir = tempPaths.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('agora-ts server bootstrap', () => {
  it('serves the health endpoint from the new Fastify app', async () => {
    const app = buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('serves a readiness endpoint from the configured ready path', async () => {
    const app = buildApp({
      observability: {
        readyPath: '/readyz',
      },
    });

    const ready = await app.inject({
      method: 'GET',
      url: '/readyz',
    });

    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({ status: 'ready' });
  });

  it('returns 503 when task service routes are unconfigured', async () => {
    const app = buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        title: 'missing service',
        type: 'coding',
        creator: 'archon',
        description: '',
        priority: 'high',
      },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ message: 'Task service is not configured' });
  });

  it('returns 404 for missing tasks and 400 for malformed task payloads', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-999',
    });
    const app = buildApp({ taskService });

    const missingTask = await app.inject({
      method: 'GET',
      url: '/api/tasks/OC-404',
    });
    const malformedCreate = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        title: '',
        type: 'coding',
        creator: 'archon',
        description: '',
        priority: 'high',
      },
    });

    expect(missingTask.statusCode).toBe(404);
    expect(malformedCreate.statusCode).toBe(400);
  });

  it('enforces bearer auth on api routes when enabled but leaves health and ready open', async () => {
    const app = buildApp({
      apiAuth: {
        enabled: true,
        token: 'secret-token',
      },
      observability: {
        readyPath: '/ready',
      },
    });

    const health = await app.inject({
      method: 'GET',
      url: '/api/health',
    });
    const ready = await app.inject({
      method: 'GET',
      url: '/ready',
    });
    const missingAuth = await app.inject({
      method: 'GET',
      url: '/api/templates',
    });
    const invalidAuth = await app.inject({
      method: 'GET',
      url: '/api/templates',
      headers: {
        authorization: 'Bearer wrong-token',
      },
    });

    expect(health.statusCode).toBe(200);
    expect(ready.statusCode).toBe(200);
    expect(missingAuth.statusCode).toBe(401);
    expect(invalidAuth.statusCode).toBe(403);
  });
});
