import { describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach } from 'vitest';
import { createAgoraDatabase, runMigrations } from '@agora-ts/db';
import type { DashboardQueryService, TaskService } from '@agora-ts/core';
import { HumanAccountService } from '@agora-ts/core';
import { HumanAccountRepository, HumanIdentityBindingRepository } from '@agora-ts/db';
import { createDashboardQueryServiceFromDb, createProjectServiceFromDb, createTaskServiceFromDb } from '@agora-ts/testing';
import { buildApp } from './app.js';

const tempPaths: string[] = [];
const templatesDir = resolve(process.cwd(), 'templates');

function createHumanAccountServiceFromDb(db: ReturnType<typeof createAgoraDatabase>) {
  return new HumanAccountService({
    accountRepository: new HumanAccountRepository(db),
    identityBindingRepository: new HumanIdentityBindingRepository(db),
  });
}

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

  it('serves the shared skill catalog endpoint', async () => {
    const app = buildApp({
      dashboardQueryService: {
        listSkills: () => [
          {
            skill_ref: 'planning-with-files',
            relative_path: 'planning-with-files',
            resolved_path: '/tmp/skills/planning-with-files/SKILL.md',
            source_root: '/tmp/skills',
            source_label: 'agora',
            precedence: 0,
            mtime: '2026-03-19T12:00:00.000Z',
            shadowed_paths: [],
          },
        ],
      } as unknown as DashboardQueryService,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/skills',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      skills: [
        expect.objectContaining({
          skill_ref: 'planning-with-files',
          source_label: 'agora',
        }),
      ],
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

  it('initializes and serves workspace bootstrap status when a bootstrap service is configured', async () => {
    const initialize = vi.fn(() => null);
    const getStatus = vi.fn(() => ({
      runtime_ready: true,
      runtime_readiness_reason: null,
      bootstrap_task_id: 'OC-WORKSPACE-BOOTSTRAP',
      bootstrap_task_title: 'Workspace Bootstrap Interview',
      bootstrap_task_state: 'active',
      bootstrap_completed: false,
    }));
    const app = buildApp({
      workspaceBootstrapService: {
        initialize,
        getStatus,
      } as never,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/workspace/bootstrap',
    });

    expect(initialize).toHaveBeenCalledTimes(1);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      runtime_ready: true,
      bootstrap_task_id: 'OC-WORKSPACE-BOOTSTRAP',
      bootstrap_completed: false,
    });
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
    const taskService = createTaskServiceFromDb(db, {
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

  it('allows project read APIs from a dashboard session even when bearer auth is enabled', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const projectService = createProjectServiceFromDb(db);
    projectService.createProject({
      id: 'proj-session-api',
      name: 'Session API Project',
      owner: 'archon',
      summary: 'project route should honor dashboard session',
      metadata: {},
    });
    const app = buildApp({
      db,
      projectService,
      apiAuth: {
        enabled: true,
        token: 'test-token',
      },
      dashboardAuth: {
        enabled: true,
        method: 'session',
        allowedUsers: ['lizeyu'],
        password: 'secret-pass',
        sessionTtlHours: 24,
      },
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
    const response = await app.inject({
      method: 'GET',
      url: '/api/projects',
      headers: {
        cookie: Array.isArray(cookie) ? cookie[0] : String(cookie),
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      projects: [
        expect.objectContaining({
          id: 'proj-session-api',
          name: 'Session API Project',
        }),
      ],
    });
  });

  it('accepts project admins and members on POST /api/projects and exposes project membership routes', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const humanAccounts = createHumanAccountServiceFromDb(db);
    humanAccounts.bootstrapAdmin({
      username: 'workspace-admin',
      password: 'secret-pass',
    });
    humanAccounts.createUser({
      username: 'alice',
      password: 'secret-pass',
      role: 'member',
    });
    humanAccounts.createUser({
      username: 'bob',
      password: 'secret-pass',
      role: 'member',
    });
    const projectService = createProjectServiceFromDb(db);
    const app = buildApp({
      db,
      projectService,
      humanAccountService: humanAccounts,
      dashboardAuth: {
        enabled: true,
        method: 'session',
        allowedUsers: [],
        sessionTtlHours: 24,
      },
    });

    const login = await app.inject({
      method: 'POST',
      url: '/api/dashboard/session/login',
      payload: {
        username: 'workspace-admin',
        password: 'secret-pass',
      },
    });
    const cookie = login.headers['set-cookie'];
    const sessionCookie = Array.isArray(cookie) ? cookie[0] : String(cookie);

    const create = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: {
        cookie: sessionCookie,
      },
      payload: {
        id: 'proj-members-rest',
        name: 'Project Members REST',
        admins: [{ account_id: 1 }],
        members: [{ account_id: 2, role: 'member' }],
        default_agents: [{ agent_ref: 'workspace-orchestrator', kind: 'orchestrator' }],
      },
    });

    const listMembers = await app.inject({
      method: 'GET',
      url: '/api/projects/proj-members-rest/members',
      headers: {
        cookie: sessionCookie,
      },
    });

    const addMember = await app.inject({
      method: 'POST',
      url: '/api/projects/proj-members-rest/members',
      headers: {
        cookie: sessionCookie,
      },
      payload: {
        account_id: 3,
        role: 'member',
      },
    });

    const removeMember = await app.inject({
      method: 'DELETE',
      url: '/api/projects/proj-members-rest/members/3',
      headers: {
        cookie: sessionCookie,
      },
    });

    expect(create.statusCode).toBe(200);
    expect(listMembers.statusCode).toBe(200);
    expect(listMembers.json()).toMatchObject({
      memberships: [
        expect.objectContaining({ account_id: 1, role: 'admin', status: 'active' }),
        expect.objectContaining({ account_id: 2, role: 'member', status: 'active' }),
      ],
    });
    expect(addMember.statusCode).toBe(200);
    expect(addMember.json()).toMatchObject({
      membership: expect.objectContaining({ account_id: 3, role: 'member', status: 'active' }),
    });
    expect(removeMember.statusCode).toBe(200);
    expect(removeMember.json()).toMatchObject({
      membership: expect.objectContaining({ account_id: 3, status: 'removed' }),
    });
  });

  it('allows POST operations from a dashboard session when bearer auth is enabled', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = createTaskServiceFromDb(db, { templatesDir });
    const dashboardQueryService = createDashboardQueryServiceFromDb(db, { templatesDir });
    const app = buildApp({
      db,
      taskService,
      dashboardQueryService,
      apiAuth: {
        enabled: true,
        token: 'test-token',
      },
      dashboardAuth: {
        enabled: true,
        method: 'session',
        allowedUsers: ['lizeyu'],
        password: 'secret-pass',
        sessionTtlHours: 24,
      },
    });

    const login = await app.inject({
      method: 'POST',
      url: '/api/dashboard/session/login',
      payload: { username: 'lizeyu', password: 'secret-pass' },
    });
    const cookie = login.headers['set-cookie'];
    const sessionCookie = Array.isArray(cookie) ? cookie[0] : String(cookie);

    // POST /api/todos should succeed with session (was 401 before blanket bypass)
    const createTodo = await app.inject({
      method: 'POST',
      url: '/api/todos',
      headers: { cookie: sessionCookie },
      payload: { text: 'session todo' },
    });
    expect(createTodo.statusCode).toBe(200);

    // POST without session should still 401
    const noSession = await app.inject({
      method: 'POST',
      url: '/api/todos',
      payload: { text: 'no session' },
    });
    expect(noSession.statusCode).toBe(401);
  });

  it('waits for task service background operations when the app closes', async () => {
    let releaseDrain: (() => void) | null = null;
    let drainStarted = false;
    const app = buildApp({
      taskService: {
        async drainBackgroundOperations() {
          drainStarted = true;
          await new Promise<void>((resolve) => {
            releaseDrain = resolve;
          });
        },
      } as unknown as TaskService,
    });

    let closed = false;
    const closePromise = app.close().then(() => {
      closed = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(drainStarted).toBe(true);
    expect(closed).toBe(false);

    const drainRelease = releaseDrain ?? (() => {
      throw new Error('expected releaseDrain to be set before closing the app');
    });
    drainRelease();
    await closePromise;

    expect(closed).toBe(true);
  });

  it('uses the dashboard session username instead of a spoofed caller_id for task advance', async () => {
    let capturedCallerId: string | null = null;
    const app = buildApp({
      taskService: {
        advanceTask: (_taskId: string, options: { callerId: string }) => {
          capturedCallerId = options.callerId;
          return {
            id: 'OC-ADVANCE',
            state: 'active',
            current_stage: 'write',
          };
        },
      } as unknown as TaskService,
      dashboardAuth: {
        enabled: true,
        method: 'session',
        allowedUsers: ['lizeyu'],
        password: 'secret-pass',
        sessionTtlHours: 24,
      },
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
    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-ADVANCE/advance',
      headers: {
        cookie: Array.isArray(cookie) ? cookie[0] : String(cookie),
      },
      payload: {
        caller_id: 'spoofed-archon',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(capturedCallerId).toBe('lizeyu');
  });

  it('uses the dashboard session username instead of a spoofed caller_id for runtime recovery routes', async () => {
    const captured: Array<{ route: 'diagnose' | 'restart'; callerId: string }> = [];
    const app = buildApp({
      taskService: {
        requestRuntimeDiagnosis: (_taskId: string, payload: { caller_id: string }) => {
          captured.push({ route: 'diagnose', callerId: payload.caller_id });
          return {
            operation: 'request_runtime_diagnosis',
            task_id: 'OC-RUNTIME',
            agent_ref: 'opus',
            status: 'accepted',
            health: 'healthy',
            runtime_provider: 'openclaw',
            runtime_actor_ref: 'runtime-opus',
            summary: 'runtime healthy',
            detail: null,
          };
        },
        restartCitizenRuntime: (_taskId: string, payload: { caller_id: string }) => {
          captured.push({ route: 'restart', callerId: payload.caller_id });
          return {
            operation: 'restart_citizen_runtime',
            status: 'unsupported',
            task_id: 'OC-RUNTIME',
            agent_ref: 'opus',
            execution_id: null,
            summary: 'restart unsupported',
            detail: null,
          };
        },
      } as unknown as TaskService,
      dashboardAuth: {
        enabled: true,
        method: 'session',
        allowedUsers: ['lizeyu'],
        password: 'secret-pass',
        sessionTtlHours: 24,
      },
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
    const headers = {
      cookie: Array.isArray(cookie) ? cookie[0] : String(cookie),
    };

    const diagnose = await app.inject({
      method: 'POST',
      url: '/api/runtime/diagnose',
      headers,
      payload: {
        task_id: 'OC-RUNTIME',
        agent_ref: 'opus',
        caller_id: 'spoofed-archon',
      },
    });
    const restart = await app.inject({
      method: 'POST',
      url: '/api/runtime/restart',
      headers,
      payload: {
        task_id: 'OC-RUNTIME',
        agent_ref: 'opus',
        caller_id: 'spoofed-archon',
      },
    });

    expect(diagnose.statusCode).toBe(200);
    expect(restart.statusCode).toBe(200);
    expect(captured).toEqual([
      { route: 'diagnose', callerId: 'lizeyu' },
      { route: 'restart', callerId: 'lizeyu' },
    ]);
  });

  it('creates an unbound project with a git-managed canonical project state root', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const agoraHomeDir = mkdtempSync(join(tmpdir(), 'agora-ts-server-project-root-'));
    tempPaths.push(agoraHomeDir);
    process.env.AGORA_HOME_DIR = agoraHomeDir;
    const projectService = createProjectServiceFromDb(db);
    const taskService = createTaskServiceFromDb(db, { templatesDir, projectService });
    const app = buildApp({
      db,
      projectService,
      taskService,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: {
        id: 'proj-canonical-root',
        name: 'Canonical Root Project',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: 'proj-canonical-root',
      metadata: {
        agora: {
          nomos: {
            project_state_root: join(agoraHomeDir, 'projects', 'proj-canonical-root'),
          },
        },
      },
    });
    expect(existsSync(join(agoraHomeDir, 'projects', 'proj-canonical-root', '.git'))).toBe(true);
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
    const taskService = createTaskServiceFromDb(db, {
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

  it('creates tasks through the orchestrator direct-create route', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-DIRECT-ROUTE',
    });
    const app = buildApp({ taskService });

    const response = await app.inject({
      method: 'POST',
      url: '/api/orchestrator/direct-create',
      payload: {
        orchestrator_ref: 'agora-executive-controller',
        confirmation: {
          kind: 'conversation_confirmation',
          confirmation_mode: 'oral',
          confirmed_by: 'lizeyu',
          confirmed_at: '2026-04-10T09:00:00.000Z',
          source: 'conversation',
          source_ref: 'discord:thread-1',
        },
        create: {
          title: 'Route direct create',
          type: 'coding',
          creator: 'agora-executive-controller',
          description: '',
          priority: 'high',
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: 'OC-DIRECT-ROUTE',
      title: 'Route direct create',
      control: {
        orchestrator_intake: {
          kind: 'direct_create',
          confirmation_mode: 'oral',
          confirmed_by: 'lizeyu',
          source_ref: 'discord:thread-1',
        },
      },
    });
  });

  it('routes project context retrieval through the unified retrieval surface', async () => {
    const contextRetrievalService = {
      retrieve: vi.fn().mockResolvedValue([
        {
          scope: 'project_context',
          provider: 'project_brain',
          reference_key: 'decision:runtime-boundary',
          project_id: 'proj-ctx',
          title: 'Runtime Boundary',
          path: '/brain/decision/runtime-boundary.md',
          preview: 'Keep runtime-specific logic out of core.',
          score: 9,
          metadata: {
            kind: 'decision',
            slug: 'runtime-boundary',
          },
        },
      ]),
    };
    const app = buildApp({
      projectService: {
        requireProject: () => ({ id: 'proj-ctx' }),
      } as never,
      contextRetrievalService: contextRetrievalService as never,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/projects/proj-ctx/context/retrieve',
      payload: {
        mode: 'lookup',
        query: {
          text: 'runtime boundary',
        },
        limit: 5,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(contextRetrievalService.retrieve).toHaveBeenCalledWith({
      scope: 'project_context',
      mode: 'lookup',
      query: {
        text: 'runtime boundary',
      },
      limit: 5,
      context: {
        project_id: 'proj-ctx',
      },
    });
    expect(response.json()).toEqual({
      scope: 'project_context',
      mode: 'lookup',
      results: [
        expect.objectContaining({
          provider: 'project_brain',
          reference_key: 'decision:runtime-boundary',
          project_id: 'proj-ctx',
        }),
      ],
    });
  });

  it('passes provider filters and task-aware fields through the project context route', async () => {
    const contextRetrievalService = {
      retrieve: vi.fn().mockResolvedValue([]),
    };
    const app = buildApp({
      projectService: {
        requireProject: () => ({ id: 'proj-ctx' }),
      } as never,
      contextRetrievalService: contextRetrievalService as never,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/projects/proj-ctx/context/retrieve',
      payload: {
        query: {
          text: 'runtime boundary',
        },
        task_id: 'OC-200',
        audience: 'craftsman',
        providers: ['project_brain'],
        source_ids: ['docs-main'],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(contextRetrievalService.retrieve).toHaveBeenCalledWith({
      scope: 'project_context',
      mode: 'task_context',
      query: {
        text: 'runtime boundary',
      },
      context: {
        project_id: 'proj-ctx',
        task_id: 'OC-200',
        audience: 'craftsman',
      },
      metadata: {
        providers: ['project_brain'],
        source_ids: ['docs-main'],
      },
    });
  });

  it('routes project context health through the unified retrieval surface', async () => {
    const contextRetrievalService = {
      checkHealth: vi.fn().mockResolvedValue([
        {
          scope: 'project_context',
          provider: 'filesystem_context_source',
          status: 'ready',
          message: 'filesystem context sources reachable',
          metadata: {
            source_ids: ['docs-main'],
          },
        },
      ]),
    };
    const app = buildApp({
      projectService: {
        requireProject: () => ({ id: 'proj-ctx' }),
      } as never,
      contextRetrievalService: contextRetrievalService as never,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/projects/proj-ctx/context/health',
      payload: {
        task_id: 'OC-200',
        audience: 'craftsman',
        providers: ['filesystem_context_source'],
        source_ids: ['docs-main'],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(contextRetrievalService.checkHealth).toHaveBeenCalledWith({
      scope: 'project_context',
      mode: 'task_context',
      query: {
        text: 'health',
      },
      context: {
        project_id: 'proj-ctx',
        task_id: 'OC-200',
        audience: 'craftsman',
      },
      metadata: {
        providers: ['filesystem_context_source'],
        source_ids: ['docs-main'],
      },
    });
    expect(response.json()).toEqual({
      scope: 'project_context',
      mode: 'task_context',
      health: [
        expect.objectContaining({
          provider: 'filesystem_context_source',
          status: 'ready',
        }),
      ],
    });
  });

  it('builds a project context reference bundle through the unified route surface', async () => {
    const app = buildApp({
      projectService: {
        requireProject: () => ({ id: 'proj-ctx' }),
      } as never,
      projectBrainService: {
        listDocuments: () => [
          {
            project_id: 'proj-ctx',
            kind: 'index',
            slug: 'index',
            title: 'Project Index',
            path: '/brain/index.md',
            content: '# Index',
            created_at: '2026-04-11T00:00:00.000Z',
            updated_at: '2026-04-11T00:00:00.000Z',
            source_task_ids: [],
          },
          {
            project_id: 'proj-ctx',
            kind: 'timeline',
            slug: 'timeline',
            title: 'Timeline',
            path: '/brain/timeline.md',
            content: '# Timeline',
            created_at: '2026-04-11T00:00:00.000Z',
            updated_at: '2026-04-11T00:00:00.000Z',
            source_task_ids: [],
          },
          {
            project_id: 'proj-ctx',
            kind: 'decision',
            slug: 'runtime-boundary',
            title: 'Runtime Boundary',
            path: '/brain/decision/runtime-boundary.md',
            content: '# Runtime Boundary',
            created_at: '2026-04-11T00:00:00.000Z',
            updated_at: '2026-04-11T00:00:00.000Z',
            source_task_ids: [],
          },
        ],
      } as never,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/projects/proj-ctx/context/reference-bundle',
      payload: {
        mode: 'bootstrap',
        audience: 'controller',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      scope: 'project_context',
      bundle: expect.objectContaining({
        project_id: 'proj-ctx',
        mode: 'bootstrap',
        project_map: expect.objectContaining({
          index_reference_key: 'index:index',
          timeline_reference_key: 'timeline:timeline',
        }),
        references: expect.arrayContaining([
          expect.objectContaining({ reference_key: 'index:index' }),
          expect.objectContaining({ reference_key: 'decision:runtime-boundary' }),
        ]),
      }),
    });
  });

  it('builds a project context attention routing plan through the unified route surface', async () => {
    const contextRetrievalService = {
      retrieve: vi.fn().mockResolvedValue([
        {
          scope: 'project_context',
          provider: 'project_brain',
          reference_key: 'decision:runtime-boundary',
          project_id: 'proj-ctx',
          title: 'Runtime Boundary',
          path: '/brain/decision/runtime-boundary.md',
          preview: 'Keep runtime-specific logic out of core.',
          score: 7,
          metadata: {
            kind: 'decision',
            slug: 'runtime-boundary',
          },
        },
      ]),
    };
    const app = buildApp({
      taskService: {
        getTask: () => ({
          id: 'OC-200',
          title: 'Implement hybrid retrieval',
          description: 'Need vector recall and lexical rerank.',
        }),
      } as never,
      projectService: {
        requireProject: () => ({ id: 'proj-ctx' }),
      } as never,
      projectBrainService: {
        listDocuments: () => [
          {
            project_id: 'proj-ctx',
            kind: 'index',
            slug: 'index',
            title: 'Project Index',
            path: '/brain/index.md',
            content: '# Index',
            created_at: '2026-04-11T00:00:00.000Z',
            updated_at: '2026-04-11T00:00:00.000Z',
            source_task_ids: [],
          },
          {
            project_id: 'proj-ctx',
            kind: 'timeline',
            slug: 'timeline',
            title: 'Timeline',
            path: '/brain/timeline.md',
            content: '# Timeline',
            created_at: '2026-04-11T00:00:00.000Z',
            updated_at: '2026-04-11T00:00:00.000Z',
            source_task_ids: [],
          },
          {
            project_id: 'proj-ctx',
            kind: 'decision',
            slug: 'runtime-boundary',
            title: 'Runtime Boundary',
            path: '/brain/decision/runtime-boundary.md',
            content: '# Runtime Boundary',
            created_at: '2026-04-11T00:00:00.000Z',
            updated_at: '2026-04-11T00:00:00.000Z',
            source_task_ids: [],
          },
        ],
      } as never,
      contextRetrievalService: contextRetrievalService as never,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/projects/proj-ctx/context/attention-routing',
      payload: {
        mode: 'bootstrap',
        audience: 'craftsman',
        task_id: 'OC-200',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(contextRetrievalService.retrieve).toHaveBeenCalledWith({
      scope: 'project_brain',
      mode: 'task_context',
      query: {
        text: 'Implement hybrid retrieval\n\nNeed vector recall and lexical rerank.',
      },
      limit: 6,
      context: {
        task_id: 'OC-200',
        project_id: 'proj-ctx',
        audience: 'craftsman',
      },
    });
    expect(response.json()).toEqual({
      scope: 'project_context',
      bundle: expect.objectContaining({
        project_id: 'proj-ctx',
      }),
      plan: expect.objectContaining({
        project_id: 'proj-ctx',
        audience: 'craftsman',
        routes: expect.arrayContaining([
          expect.objectContaining({ reference_key: 'index:index', kind: 'project_map' }),
          expect.objectContaining({ reference_key: 'decision:runtime-boundary', kind: 'focus' }),
        ]),
      }),
    });
  });

  it('builds a project context briefing through the unified route surface', async () => {
    const contextMaterializationService = {
      materialize: vi.fn().mockResolvedValue({
        target: 'project_context_briefing',
        artifact: {
        project_id: 'proj-ctx',
        audience: 'craftsman',
        markdown: '# Project Brain Bootstrap Context',
        reference_bundle: {
          scope: 'project_brain',
          mode: 'bootstrap',
          project_id: 'proj-ctx',
          task_id: 'OC-200',
          project_map: {
            index_reference_key: 'index:index',
            timeline_reference_key: 'timeline:timeline',
            inventory_count: 2,
          },
          inventory: {
            scope: 'project_brain',
            project_id: 'proj-ctx',
            generated_at: '2026-04-11T00:00:00.000Z',
            entries: [],
          },
          references: [],
        },
        attention_routing_plan: {
          scope: 'project_brain',
          mode: 'bootstrap',
          project_id: 'proj-ctx',
          task_id: 'OC-200',
          audience: 'craftsman',
          summary: 'Start from the project map.',
          routes: [],
        },
        source_documents: [],
        },
      }),
    };
    const app = buildApp({
      taskService: {
        getTask: () => ({
          id: 'OC-200',
          title: 'Implement hybrid retrieval',
          description: 'Need vector recall and lexical rerank.',
          project_id: 'proj-ctx',
          team: { members: [] },
        }),
      } as never,
      projectService: {
        requireProject: () => ({ id: 'proj-ctx' }),
      } as never,
      contextMaterializationService: contextMaterializationService as never,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/projects/proj-ctx/context/briefing',
      payload: {
        audience: 'craftsman',
        task_id: 'OC-200',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(contextMaterializationService.materialize).toHaveBeenCalledWith({
      target: 'project_context_briefing',
      project_id: 'proj-ctx',
      audience: 'craftsman',
      task_id: 'OC-200',
      task_title: 'Implement hybrid retrieval',
      task_description: 'Need vector recall and lexical rerank.',
    });
    expect(response.json()).toEqual({
      scope: 'project_context',
      briefing: expect.objectContaining({
        project_id: 'proj-ctx',
        audience: 'craftsman',
        markdown: '# Project Brain Bootstrap Context',
      }),
    });
  });

  it('prefers context materialization service for project context briefing when configured', async () => {
    const contextMaterializationService = {
      materialize: vi.fn().mockResolvedValue({
        target: 'project_context_briefing',
        artifact: {
          project_id: 'proj-ctx',
          audience: 'craftsman',
          markdown: '# Materialized Briefing',
          source_documents: [],
        },
      }),
    };
    const app = buildApp({
      taskService: {
        getTask: () => ({
          id: 'OC-200',
          title: 'Implement hybrid retrieval',
          description: 'Need vector recall and lexical rerank.',
          project_id: 'proj-ctx',
          team: { members: [] },
        }),
      } as never,
      projectService: {
        requireProject: () => ({ id: 'proj-ctx' }),
      } as never,
      contextMaterializationService: contextMaterializationService as never,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/projects/proj-ctx/context/briefing',
      payload: {
        audience: 'craftsman',
        task_id: 'OC-200',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(contextMaterializationService.materialize).toHaveBeenCalledWith({
      target: 'project_context_briefing',
      project_id: 'proj-ctx',
      audience: 'craftsman',
      task_id: 'OC-200',
      task_title: 'Implement hybrid retrieval',
      task_description: 'Need vector recall and lexical rerank.',
    });
    expect(response.json()).toEqual({
      scope: 'project_context',
      briefing: expect.objectContaining({
        project_id: 'proj-ctx',
        audience: 'craftsman',
        markdown: '# Materialized Briefing',
      }),
    });
  });

  it('returns 503 for project context briefing when materialization is not configured', async () => {
    const app = buildApp({
      projectService: {
        requireProject: () => ({ id: 'proj-ctx' }),
      } as never,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/projects/proj-ctx/context/briefing',
      payload: {
        audience: 'craftsman',
      },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      message: 'Project context briefing is not configured',
    });
  });

  it('materializes a codex-facing repo shim through the project context surface', async () => {
    const contextMaterializationService = {
      materialize: vi.fn().mockResolvedValue({
        target: 'codex_repo_shim',
        artifact: {
          project_id: 'proj-ctx',
          runtime: 'codex',
          filename: 'AGENTS.md',
          media_type: 'text/markdown',
          content: '# AGENTS.md\n',
        },
      }),
    };
    const app = buildApp({
      projectService: {
        requireProject: () => ({ id: 'proj-ctx' }),
      } as never,
      contextMaterializationService: contextMaterializationService as never,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/projects/proj-ctx/context/materialize',
      payload: {
        target: 'codex_repo_shim',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(contextMaterializationService.materialize).toHaveBeenCalledWith({
      target: 'codex_repo_shim',
      project_id: 'proj-ctx',
    });
    expect(response.json()).toEqual({
      scope: 'project_context',
      materialization: {
        target: 'codex_repo_shim',
        artifact: {
          project_id: 'proj-ctx',
          runtime: 'codex',
          filename: 'AGENTS.md',
          media_type: 'text/markdown',
          content: '# AGENTS.md\n',
        },
      },
    });
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
    const taskService = createTaskServiceFromDb(db, {
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
      legacyRuntimeService: {
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
    const taskService = createTaskServiceFromDb(db, {
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
