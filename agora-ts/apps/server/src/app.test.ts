import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach } from 'vitest';
import { createAgoraDatabase, runMigrations } from '@agora-ts/db';
import { TaskService } from '@agora-ts/core';
import { buildApp } from './app.js';

const tempPaths: string[] = [];
const templatesDir = resolve(process.cwd(), 'templates');

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-app-test-'));
  tempPaths.push(dir);
  return join(dir, 'tasks.db');
}

function makeDashboardDir() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-dashboard-test-'));
  tempPaths.push(dir);
  writeFileSync(join(dir, 'index.html'), '<!doctype html><html><body>dashboard</body></html>');
  writeFileSync(join(dir, 'app.js'), 'console.log("dashboard");');
  return dir;
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

  it('serves the unified health snapshot endpoint', async () => {
    const app = buildApp({
      taskService: {
        getHealthSnapshot: () => ({
          generated_at: '2026-03-14T04:30:00.000Z',
          tasks: {
            status: 'healthy',
            total_tasks: 1,
            active_tasks: 1,
            paused_tasks: 0,
            blocked_tasks: 0,
            done_tasks: 0,
          },
          im: {
            status: 'healthy',
            active_bindings: 1,
            active_threads: 1,
            bindings_by_provider: [{ label: 'discord', count: 1 }],
          },
          runtime: {
            status: 'unavailable',
            available: false,
            stale_after_ms: null,
            active_sessions: 0,
            idle_sessions: 0,
            closed_sessions: 0,
            agents: [],
          },
          craftsman: {
            status: 'healthy',
            active_executions: 0,
            queued_executions: 0,
            running_executions: 0,
            waiting_input_executions: 0,
            awaiting_choice_executions: 0,
            active_by_assignee: [],
          },
          host: {
            status: 'unavailable',
            snapshot: null,
          },
          escalation: {
            status: 'healthy',
            policy: {
              controller_after_ms: 300000,
              roster_after_ms: 900000,
              inbox_after_ms: 1800000,
            },
            controller_pinged_tasks: 0,
            roster_pinged_tasks: 0,
            inbox_escalated_tasks: 0,
            unhealthy_runtime_agents: 0,
            runtime_unhealthy: false,
          },
        }),
      } as unknown as TaskService,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/health/snapshot',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      tasks: {
        total_tasks: 1,
      },
      im: {
        active_bindings: 1,
      },
      escalation: {
        controller_pinged_tasks: 0,
      },
    });
  });

  it('serves runtime diagnosis and restart routes', async () => {
    const app = buildApp({
      taskService: {
        requestRuntimeDiagnosis: () => ({
          operation: 'request_runtime_diagnosis',
          task_id: 'OC-RUNTIME',
          agent_ref: 'opus',
          status: 'accepted',
          health: 'healthy',
          runtime_provider: 'openclaw',
          runtime_actor_ref: 'runtime-opus',
          summary: 'runtime healthy',
          detail: null,
        }),
        restartCitizenRuntime: () => ({
          operation: 'restart_citizen_runtime',
          status: 'unsupported',
          task_id: 'OC-RUNTIME',
          agent_ref: 'opus',
          execution_id: null,
          summary: 'restart unsupported',
          detail: null,
        }),
      } as unknown as TaskService,
    });

    const diagnosis = await app.inject({
      method: 'POST',
      url: '/api/runtime/diagnose',
      payload: {
        task_id: 'OC-RUNTIME',
        agent_ref: 'opus',
        caller_id: 'opus',
      },
    });
    const restart = await app.inject({
      method: 'POST',
      url: '/api/runtime/restart',
      payload: {
        task_id: 'OC-RUNTIME',
        agent_ref: 'opus',
        caller_id: 'opus',
      },
    });

    expect(diagnosis.statusCode).toBe(200);
    expect(diagnosis.json()).toMatchObject({
      operation: 'request_runtime_diagnosis',
      status: 'accepted',
    });
    expect(restart.statusCode).toBe(200);
    expect(restart.json()).toMatchObject({
      operation: 'restart_citizen_runtime',
      status: 'unsupported',
    });
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

  it('protects dashboard shell and assets with basic auth when enabled', async () => {
    const dashboardDir = makeDashboardDir();
    const app = buildApp({
      dashboardDir,
      dashboardAuth: {
        enabled: true,
        method: 'basic',
        allowedUsers: ['lizeyu'],
        password: 'secret-pass',
      },
    });

    const shellDenied = await app.inject({
      method: 'GET',
      url: '/dashboard',
    });
    const assetDenied = await app.inject({
      method: 'GET',
      url: '/dashboard/app.js',
    });
    const shellAllowed = await app.inject({
      method: 'GET',
      url: '/dashboard',
      headers: {
        authorization: `Basic ${Buffer.from('lizeyu:secret-pass').toString('base64')}`,
      },
    });

    expect(shellDenied.statusCode).toBe(401);
    expect(shellDenied.headers['www-authenticate']).toContain('Basic');
    expect(assetDenied.statusCode).toBe(401);
    expect(shellAllowed.statusCode).toBe(200);
    expect(shellAllowed.body).toContain('dashboard');
  });

  it('supports dashboard session login and cookie-based shell access', async () => {
    const dashboardDir = makeDashboardDir();
    const app = buildApp({
      dashboardDir,
      dashboardAuth: {
        enabled: true,
        method: 'session',
        allowedUsers: ['lizeyu'],
        password: 'secret-pass',
        sessionTtlHours: 24,
      },
    });

    const loginPage = await app.inject({
      method: 'GET',
      url: '/dashboard',
    });
    const login = await app.inject({
      method: 'POST',
      url: '/api/dashboard/session/login',
      payload: {
        username: 'lizeyu',
        password: 'secret-pass',
      },
    });
    const cookie = login.headers['set-cookie'];
    const session = await app.inject({
      method: 'GET',
      url: '/api/dashboard/session',
      headers: {
        cookie: Array.isArray(cookie) ? cookie[0] : String(cookie),
      },
    });
    const dashboard = await app.inject({
      method: 'GET',
      url: '/dashboard',
      headers: {
        cookie: Array.isArray(cookie) ? cookie[0] : String(cookie),
      },
    });

    expect(loginPage.statusCode).toBe(200);
    expect(loginPage.body).toContain('Agora Dashboard Login');
    expect(login.statusCode).toBe(200);
    expect(cookie).toBeDefined();
    expect(session.statusCode).toBe(200);
    expect(session.json()).toMatchObject({
      authenticated: true,
      username: 'lizeyu',
      method: 'session',
    });
    expect(dashboard.statusCode).toBe(200);
    expect(dashboard.body).toContain('dashboard');
  });

  it('returns a bootstrap-required message when session auth is enabled without users or legacy password', async () => {
    const app = buildApp({
      dashboardAuth: {
        enabled: true,
        method: 'session',
        allowedUsers: [],
        sessionTtlHours: 24,
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/dashboard/session/login',
      payload: {
        username: 'admin',
        password: 'secret-pass',
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      message: 'dashboard session auth has no bootstrap admin account; run `agora init` or `agora dashboard users add`',
    });
  });

  it('requires a dashboard session for dashboard read APIs when session auth is enabled', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-SESSION-API',
    });
    taskService.createTask({
      title: 'session guarded api task',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'high',
    });
    const app = buildApp({
      taskService,
      dashboardAuth: {
        enabled: true,
        method: 'session',
        allowedUsers: ['lizeyu'],
        password: 'secret-pass',
        sessionTtlHours: 24,
      },
    });

    const denied = await app.inject({
      method: 'GET',
      url: '/api/tasks/OC-SESSION-API/status',
    });
    const login = await app.inject({
      method: 'POST',
      url: '/api/dashboard/session/login',
      payload: {
        username: 'lizeyu',
        password: 'secret-pass',
      },
    });
    const cookie = login.headers['set-cookie'];
    const allowed = await app.inject({
      method: 'GET',
      url: '/api/tasks/OC-SESSION-API/status',
      headers: {
        cookie: Array.isArray(cookie) ? cookie[0] : String(cookie),
      },
    });

    expect(denied.statusCode).toBe(401);
    expect(denied.json()).toEqual({ message: 'missing dashboard session' });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json()).toMatchObject({
      task: { id: 'OC-SESSION-API' },
    });
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
        sendText: () => undefined,
        sendKeys: () => undefined,
        submitChoice: () => undefined,
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
    await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-777/pause',
      payload: {
        reason: 'metrics pause',
      },
    });
    const response = await app.inject({
      method: 'GET',
      url: '/metrics',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.body).toContain('agora_http_requests_total{method="GET",status="200"} 1');
    expect(response.body).toContain('agora_tasks_total{state="paused"} 1');
    expect(response.body).toContain('agora_tasks_active 0');
    expect(response.body).toContain('agora_craftsmen_sessions_active 2');
    expect(response.body).toContain('agora_task_actions_total{action="pause",result="success"} 1');
  });

  it('does not emit structured request logs unless enabled', async () => {
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const app = buildApp();

    await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('emits structured request logs when enabled', async () => {
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-LOG',
    });
    taskService.createTask({
      title: 'structured logs task',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'high',
    });
    const app = buildApp({
      taskService,
      observability: {
        readyPath: '/ready',
        structuredLogs: true,
      },
    });

    await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-LOG/pause',
      payload: {
        reason: 'pause for log',
      },
    });

    expect(logSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    const parsedLogs = logSpy.mock.calls.map((call) => JSON.parse(String(call[0])));
    expect(parsedLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: 'info',
          module: 'task',
          msg: 'task_action',
          action: 'pause',
          task_id: 'OC-LOG',
          state: 'paused',
        }),
        expect.objectContaining({
          level: 'info',
          module: 'http',
          msg: 'request_complete',
          method: 'POST',
          path: '/api/tasks/OC-LOG/pause',
          status_code: 200,
        }),
      ]),
    );
    logSpy.mockRestore();
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
