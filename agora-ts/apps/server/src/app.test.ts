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

  it('does not expose a metrics endpoint unless enabled', async () => {
    const app = buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/metrics',
    });

    expect(response.statusCode).toBe(404);
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

  it('serves prometheus-style metrics when observability metrics are enabled', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-777',
    });
    taskService.createTask({
      title: 'metrics task',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'high',
    });
    const app = buildApp({
      taskService,
      observability: {
        readyPath: '/ready',
        metricsEnabled: true,
      },
      tmuxRuntimeService: {
        up: () => ({ session: 'agora-craftsmen', panes: [] }),
        status: () => ({
          session: 'agora-craftsmen',
          panes: [
            {
              id: '%0',
              title: 'codex',
              currentCommand: 'bash',
              active: true,
              continuityBackend: 'codex_session_file',
              resumeCapability: 'native_resume',
              sessionReference: 'codex-session-1',
              identitySource: 'session_file',
              identityPath: '/tmp/codex/session.json',
              sessionObservedAt: '2026-03-09T00:00:00.000Z',
              workspaceRoot: '/tmp/codex',
              lastRecoveryMode: 'resume_exact',
              transportSessionId: 'tmux:agora-craftsmen:codex',
            },
            {
              id: '%1',
              title: 'claude',
              currentCommand: 'bash',
              active: false,
              continuityBackend: 'claude_session_id',
              resumeCapability: 'native_resume',
              sessionReference: 'claude-session-1',
              identitySource: 'manual',
              identityPath: null,
              sessionObservedAt: '2026-03-09T00:00:00.000Z',
              workspaceRoot: '/tmp/claude',
              lastRecoveryMode: 'fresh_start',
              transportSessionId: 'tmux:agora-craftsmen:claude',
            },
          ],
        }),
        doctor: () => ({ session: 'agora-craftsmen', panes: [] }),
        send: () => undefined,
        task: () => ({ status: 'running', session_id: 'tmux:agora-craftsmen:codex', started_at: '2026-03-09T00:00:00.000Z', payload: null }),
        tail: () => 'tail',
        down: () => undefined,
        recordIdentity: () => ({
          continuityBackend: 'codex_session_file',
          resumeCapability: 'native_resume',
          sessionReference: 'codex-session-1',
          identitySource: 'session_file',
          identityPath: '/tmp/codex/session.json',
          sessionObservedAt: '2026-03-09T00:00:00.000Z',
          workspaceRoot: '/tmp/codex',
          lastRecoveryMode: 'resume_exact',
          transportSessionId: 'tmux:agora-craftsmen:codex',
        }),
      },
    });

    await app.inject({
      method: 'GET',
      url: '/api/health',
    });
    const response = await app.inject({
      method: 'GET',
      url: '/metrics',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.body).toContain('agora_http_requests_total{method="GET",status="200"} 1');
    expect(response.body).toContain('agora_tasks_total{state="active"} 1');
    expect(response.body).toContain('agora_tasks_active 1');
    expect(response.body).toContain('agora_craftsmen_sessions_active 2');
  });

  it('limits repeated read requests when rate limiting is enabled', async () => {
    const app = buildApp({
      rateLimit: {
        enabled: true,
        windowMs: 60_000,
        maxRequests: 1,
        writeMaxRequests: 1,
      },
    });

    const first = await app.inject({
      method: 'GET',
      url: '/api/templates',
      headers: {
        'x-caller-id': 'reader-1',
      },
    });
    const second = await app.inject({
      method: 'GET',
      url: '/api/templates',
      headers: {
        'x-caller-id': 'reader-1',
      },
    });

    expect(first.statusCode).toBe(503);
    expect(second.statusCode).toBe(429);
    expect(second.headers['retry-after']).toBeDefined();
  });

  it('limits repeated write requests separately from reads', async () => {
    const app = buildApp({
      rateLimit: {
        enabled: true,
        windowMs: 60_000,
        maxRequests: 10,
        writeMaxRequests: 1,
      },
    });

    const first = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      headers: {
        'x-caller-id': 'writer-1',
      },
      payload: {
        title: 'missing service',
        type: 'coding',
        creator: 'archon',
        description: '',
        priority: 'high',
      },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      headers: {
        'x-caller-id': 'writer-1',
      },
      payload: {
        title: 'missing service',
        type: 'coding',
        creator: 'archon',
        description: '',
        priority: 'high',
      },
    });

    expect(first.statusCode).toBe(503);
    expect(second.statusCode).toBe(429);
    expect(second.headers['retry-after']).toBeDefined();
  });
});
