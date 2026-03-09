import { existsSync, readFileSync, statSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import {
  craftsmanCallbackRequestSchema,
  craftsmanDispatchRequestSchema,
  craftsmanRuntimeIdentityRequestSchema,
  approveTaskRequestSchema,
  advanceTaskRequestSchema,
  archonApproveTaskRequestSchema,
  archonRejectTaskRequestSchema,
  archiveJobScanRequestSchema,
  archiveJobStatusUpdateRequestSchema,
  cleanupTasksRequestSchema,
  confirmTaskRequestSchema,
  createTodoRequestSchema,
  createInboxRequestSchema,
  createTaskRequestSchema,
  duplicateTemplateRequestSchema,
  type HealthResponse,
  liveSessionSchema,
  liveSessionCleanupResponseSchema,
  promoteTodoRequestSchema,
  promoteInboxRequestSchema,
  rejectTaskRequestSchema,
  saveTemplateRequestSchema,
  subtaskDoneRequestSchema,
  taskNoteRequestSchema,
  unblockTaskRequestSchema,
  templateValidationRequestSchema,
  updateTodoRequestSchema,
  updateInboxRequestSchema,
  updateTemplateWorkflowRequestSchema,
  validateWorkflowRequestSchema,
} from '@agora-ts/contracts';
import {
  NotFoundError,
  PermissionDeniedError,
  type DashboardQueryService,
  type InboxService,
  type LiveSessionStore,
  type TaskService,
  type TmuxRuntimeService,
  type TemplateAuthoringService,
} from '@agora-ts/core';
import { z } from 'zod';

export interface BuildAppOptions {
  taskService?: TaskService;
  dashboardQueryService?: DashboardQueryService;
  inboxService?: InboxService;
  templateAuthoringService?: TemplateAuthoringService;
  liveSessionStore?: LiveSessionStore;
  tmuxRuntimeService?: Pick<TmuxRuntimeService, 'up' | 'status' | 'doctor' | 'send' | 'task' | 'tail' | 'down' | 'recordIdentity'>;
  apiAuth?: {
    enabled: boolean;
    token: string;
  };
  dashboardAuth?: {
    enabled: boolean;
    method: 'basic' | 'session' | 'oauth2';
    allowedUsers: string[];
    password?: string | null;
    sessionTtlHours?: number;
  };
  rateLimit?: {
    enabled: boolean;
    windowMs: number;
    maxRequests: number;
    writeMaxRequests: number;
  };
  observability?: {
    readyPath?: string;
    metricsEnabled?: boolean;
    structuredLogs?: boolean;
  };
  dashboardDir?: string;
}

interface MetricsState {
  requestsByMethodAndStatus: Map<string, number>;
  taskActionsByResult: Map<string, number>;
  craftsmanDispatchByAdapterAndResult: Map<string, number>;
  craftsmanCallbacksByStatus: Map<string, number>;
}

interface RequestTimingState {
  startedAtMs?: number;
}

type DashboardSession = {
  username: string;
  expiresAt: number;
};

function translateError(error: unknown) {
  if (error instanceof PermissionDeniedError) {
    return { statusCode: 403, body: { message: error.message } };
  }
  if (error instanceof NotFoundError) {
    return { statusCode: 404, body: { message: error.message } };
  }
  if (error instanceof Error) {
    return { statusCode: 400, body: { message: error.message } };
  }
  return { statusCode: 500, body: { message: 'Unknown error' } };
}

function parseNumericId(raw: string, fieldName: string) {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${fieldName} must be a non-negative integer`);
  }
  return parsed;
}

function parseBearerToken(authorization?: string) {
  if (!authorization) {
    return null;
  }
  const [scheme, token] = authorization.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }
  return token;
}

function parseBasicCredentials(authorization?: string) {
  if (!authorization) {
    return null;
  }
  const [scheme, encoded] = authorization.split(' ');
  if (scheme?.toLowerCase() !== 'basic' || !encoded) {
    return null;
  }
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  const separatorIndex = decoded.indexOf(':');
  if (separatorIndex < 0) {
    return null;
  }
  return {
    username: decoded.slice(0, separatorIndex),
    password: decoded.slice(separatorIndex + 1),
  };
}

function parseCookies(header?: string) {
  const cookies = new Map<string, string>();
  if (!header) {
    return cookies;
  }
  for (const part of header.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (!rawName || rawValue.length === 0) {
      continue;
    }
    cookies.set(rawName, decodeURIComponent(rawValue.join('=')));
  }
  return cookies;
}

function isReadRequest(method: string) {
  return method === 'GET' || method === 'HEAD';
}

function isDashboardRoute(url: string) {
  return url === '/dashboard' || url === '/dashboard/' || url.startsWith('/dashboard/');
}

function isDashboardSessionRoute(url: string) {
  return url === '/api/dashboard/session'
    || url === '/api/dashboard/session/login'
    || url === '/api/dashboard/session/logout';
}

function isDashboardProtectedApiRoute(method: string, url: string) {
  if (method !== 'GET' && method !== 'HEAD') {
    return false;
  }
  return url.startsWith('/api/tasks')
    || url.startsWith('/api/agents/')
    || url === '/api/agents/status'
    || url.startsWith('/api/archive/')
    || url === '/api/archive/jobs'
    || url.startsWith('/api/todos')
    || url.startsWith('/api/templates')
    || url.startsWith('/api/craftsmen/tmux/')
    || url.startsWith('/api/craftsmen/executions/')
    || url.startsWith('/api/craftsmen/tasks/');
}

const DASHBOARD_SESSION_COOKIE = 'agora_dashboard_session';

function createDashboardLoginPage() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Agora Dashboard Login</title>
  </head>
  <body>
    <main>
      <h1>Agora Dashboard Login</h1>
      <p>Use the dashboard session login endpoint to establish access.</p>
    </main>
  </body>
</html>`;
}

function getDashboardSession(
  request: FastifyRequest,
  sessions: Map<string, DashboardSession>,
) {
  const token = parseCookies(request.headers.cookie).get(DASHBOARD_SESSION_COOKIE);
  if (!token) {
    return null;
  }
  const session = sessions.get(token);
  if (!session) {
    return null;
  }
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }
  return { token, session };
}

function issueDashboardSession(
  username: string,
  dashboardAuth: NonNullable<BuildAppOptions['dashboardAuth']>,
  sessions: Map<string, DashboardSession>,
) {
  const token = randomBytes(24).toString('hex');
  const ttlHours = dashboardAuth.sessionTtlHours ?? 24;
  sessions.set(token, {
    username,
    expiresAt: Date.now() + ttlHours * 60 * 60 * 1000,
  });
  return { token, ttlHours };
}

function clearDashboardSession(
  request: FastifyRequest,
  sessions: Map<string, DashboardSession>,
) {
  const token = parseCookies(request.headers.cookie).get(DASHBOARD_SESSION_COOKIE);
  if (token) {
    sessions.delete(token);
  }
}

function requireDashboardAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  dashboardAuth: BuildAppOptions['dashboardAuth'],
  sessions: Map<string, DashboardSession>,
) {
  if (!dashboardAuth?.enabled || !isDashboardRoute(request.url)) {
    return true;
  }
  if (dashboardAuth.method === 'session') {
    const activeSession = getDashboardSession(request, sessions);
    if (activeSession) {
      return true;
    }
    if (request.url === '/dashboard' || request.url === '/dashboard/') {
      reply
        .type('text/html; charset=utf-8')
        .status(200)
        .send(createDashboardLoginPage());
      return false;
    }
    reply.status(401).send({ message: 'missing dashboard session' });
    return false;
  }
  if (dashboardAuth.method !== 'basic') {
    reply.status(501).send({ message: 'dashboard auth method not implemented' });
    return false;
  }
  if (!dashboardAuth.password) {
    reply.status(500).send({ message: 'dashboard auth enabled but password not configured' });
    return false;
  }
  const credentials = parseBasicCredentials(request.headers.authorization);
  if (!credentials) {
    reply
      .header('WWW-Authenticate', 'Basic realm="Agora Dashboard"')
      .status(401)
      .send({ message: 'missing dashboard credentials' });
    return false;
  }
  const allowed = dashboardAuth.allowedUsers.length === 0 || dashboardAuth.allowedUsers.includes(credentials.username);
  if (!allowed || credentials.password !== dashboardAuth.password) {
    reply
      .header('WWW-Authenticate', 'Basic realm="Agora Dashboard"')
      .status(403)
      .send({ message: 'invalid dashboard credentials' });
    return false;
  }
  return true;
}

function incrementCounter(counter: Map<string, number>, key: string) {
  counter.set(key, (counter.get(key) ?? 0) + 1);
}

function emitStructuredLog(enabled: boolean, event: Record<string, unknown>) {
  if (!enabled) {
    return;
  }
  console.info(JSON.stringify({
    ts: new Date().toISOString(),
    level: 'info',
    ...event,
  }));
}

function recordTaskAction(metrics: MetricsState, action: string, result: string) {
  incrementCounter(metrics.taskActionsByResult, `${action}:${result}`);
}

function recordCraftsmanDispatch(metrics: MetricsState, adapter: string, result: string) {
  incrementCounter(metrics.craftsmanDispatchByAdapterAndResult, `${adapter}:${result}`);
}

function recordCraftsmanCallback(metrics: MetricsState, status: string) {
  incrementCounter(metrics.craftsmanCallbacksByStatus, status);
}

function renderMetrics(options: {
  metrics: MetricsState;
  taskService: TaskService | undefined;
  tmuxRuntimeService: Pick<TmuxRuntimeService, 'up' | 'status' | 'doctor' | 'send' | 'task' | 'tail' | 'down' | 'recordIdentity'> | undefined;
}) {
  const lines: string[] = [
    '# HELP agora_http_requests_total Total HTTP requests served by agora-ts server.',
    '# TYPE agora_http_requests_total counter',
  ];
  for (const [key, value] of options.metrics.requestsByMethodAndStatus.entries()) {
    const [method, status] = key.split(':');
    lines.push(`agora_http_requests_total{method="${method}",status="${status}"} ${value}`);
  }

  const tasks = options.taskService?.listTasks() ?? [];
  const tasksByState = new Map<string, number>();
  for (const task of tasks) {
    incrementCounter(tasksByState, task.state);
  }
  lines.push('# HELP agora_tasks_total Total tasks grouped by state.');
  lines.push('# TYPE agora_tasks_total counter');
  for (const [state, value] of tasksByState.entries()) {
    lines.push(`agora_tasks_total{state="${state}"} ${value}`);
  }
  lines.push('# HELP agora_tasks_active Current active tasks.');
  lines.push('# TYPE agora_tasks_active gauge');
  lines.push(`agora_tasks_active ${tasks.filter((task) => task.state === 'active').length}`);

  lines.push('# HELP agora_task_actions_total Total task actions grouped by action and result.');
  lines.push('# TYPE agora_task_actions_total counter');
  for (const [key, value] of options.metrics.taskActionsByResult.entries()) {
    const [action, result] = key.split(':');
    lines.push(`agora_task_actions_total{action="${action}",result="${result}"} ${value}`);
  }

  lines.push('# HELP agora_craftsman_dispatch_total Total craftsman dispatch requests grouped by adapter and result.');
  lines.push('# TYPE agora_craftsman_dispatch_total counter');
  for (const [key, value] of options.metrics.craftsmanDispatchByAdapterAndResult.entries()) {
    const [adapter, result] = key.split(':');
    lines.push(`agora_craftsman_dispatch_total{adapter="${adapter}",result="${result}"} ${value}`);
  }

  lines.push('# HELP agora_craftsman_callbacks_total Total craftsman callbacks grouped by callback status.');
  lines.push('# TYPE agora_craftsman_callbacks_total counter');
  for (const [status, value] of options.metrics.craftsmanCallbacksByStatus.entries()) {
    lines.push(`agora_craftsman_callbacks_total{status="${status}"} ${value}`);
  }

  const tmuxPanes = options.tmuxRuntimeService?.status().panes.length ?? 0;
  lines.push('# HELP agora_craftsmen_sessions_active Current active tmux panes observed by the server.');
  lines.push('# TYPE agora_craftsmen_sessions_active gauge');
  lines.push(`agora_craftsmen_sessions_active ${tmuxPanes}`);

  return `${lines.join('\n')}\n`;
}

export function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({
    logger: false,
  });
  const taskService = options.taskService;
  const dashboardQueryService = options.dashboardQueryService;
  const inboxService = options.inboxService;
  const templateAuthoringService = options.templateAuthoringService;
  const liveSessionStore = options.liveSessionStore;
  const tmuxRuntimeService = options.tmuxRuntimeService;
  const apiAuth = options.apiAuth;
  const dashboardAuth = options.dashboardAuth;
  const rateLimit = options.rateLimit;
  const dashboardDir = options.dashboardDir;
  const readyPath = options.observability?.readyPath ?? '/ready';
  const metricsEnabled = options.observability?.metricsEnabled ?? false;
  const structuredLogs = options.observability?.structuredLogs ?? false;
  const rateCounters = new Map<string, { count: number; resetAt: number }>();
  const metrics: MetricsState = {
    requestsByMethodAndStatus: new Map(),
    taskActionsByResult: new Map(),
    craftsmanDispatchByAdapterAndResult: new Map(),
    craftsmanCallbacksByStatus: new Map(),
  };
  const dashboardSessions = new Map<string, DashboardSession>();
  const dashboardSessionLoginSchema = z.object({
    username: z.string().min(1),
    password: z.string().min(1),
  });
  const tmuxSendSchema = z.object({
    agent: z.string().min(1),
    command: z.string().min(1),
  });
  const tmuxTaskSchema = z.object({
    agent: z.string().min(1),
    prompt: z.string().min(1),
    workdir: z.string().optional(),
  });

  app.addHook('onRequest', async (request, reply) => {
    if (structuredLogs) {
      (request as typeof request & RequestTimingState).startedAtMs = Date.now();
    }
    if (!request.url.startsWith('/api/') || request.url === '/api/health' || request.url === readyPath) {
      return;
    }
    if (rateLimit?.enabled) {
      const now = Date.now();
      const limit = isReadRequest(request.method) ? rateLimit.maxRequests : rateLimit.writeMaxRequests;
      const scope = isReadRequest(request.method) ? 'read' : 'write';
      const identity = (request.headers['x-caller-id'] as string | undefined)?.trim() || request.ip;
      const key = `${scope}:${identity}`;
      const current = rateCounters.get(key);
      if (!current || now > current.resetAt) {
        rateCounters.set(key, {
          count: 1,
          resetAt: now + rateLimit.windowMs,
        });
      } else if (current.count >= limit) {
        reply.header('Retry-After', Math.ceil((current.resetAt - now) / 1000));
        return reply.status(429).send({ message: 'rate limit exceeded' });
      } else {
        current.count += 1;
      }
    }
    const dashboardSessionEnabled = dashboardAuth?.enabled && dashboardAuth.method === 'session';
    const dashboardSession = dashboardSessionEnabled ? getDashboardSession(request, dashboardSessions) : null;
    if (
      dashboardSessionEnabled
      && isDashboardProtectedApiRoute(request.method, request.url)
      && !dashboardSession
      && !apiAuth?.enabled
    ) {
      return reply.status(401).send({ message: 'missing dashboard session' });
    }
    if (!apiAuth?.enabled) {
      return;
    }
    if (
      dashboardSessionEnabled
      && (
        isDashboardSessionRoute(request.url)
        || (isDashboardProtectedApiRoute(request.method, request.url) && dashboardSession)
      )
    ) {
      return;
    }
    if (!apiAuth.token) {
      return reply.status(500).send({ message: 'api auth enabled but token not configured' });
    }
    const token = parseBearerToken(request.headers.authorization);
    if (!token) {
      return reply.status(401).send({ message: 'missing bearer token' });
    }
    if (token !== apiAuth.token) {
      return reply.status(403).send({ message: 'invalid api token' });
    }
  });

  app.addHook('onResponse', async (request, reply) => {
    incrementCounter(metrics.requestsByMethodAndStatus, `${request.method}:${reply.statusCode}`);
    if (structuredLogs) {
      const startedAtMs = (request as typeof request & RequestTimingState).startedAtMs ?? Date.now();
      emitStructuredLog(true, {
        module: 'http',
        msg: 'request_complete',
        method: request.method,
        path: request.url,
        status_code: reply.statusCode,
        duration_ms: Math.max(0, Date.now() - startedAtMs),
      });
    }
  });

  app.get('/api/health', async (): Promise<HealthResponse> => {
    return { status: 'ok' };
  });

  app.get(readyPath, async () => {
    return { status: 'ready' };
  });

  if (metricsEnabled) {
    app.get('/metrics', async (request, reply) => {
      return reply
        .type('text/plain; version=0.0.4; charset=utf-8')
        .send(renderMetrics({ metrics, taskService, tmuxRuntimeService }));
    });
  }

  app.get('/api/live/openclaw/sessions', async (request, reply) => {
    if (!liveSessionStore) {
      return reply.status(503).send({ message: 'Live session store is not configured' });
    }
    return reply.send(liveSessionStore.listAll());
  });

  app.post('/api/live/openclaw/sessions/cleanup', async (request, reply) => {
    if (!liveSessionStore) {
      return reply.status(503).send({ message: 'Live session store is not configured' });
    }
    try {
      return reply.send(liveSessionCleanupResponseSchema.parse({
        cleaned: liveSessionStore.cleanupStale(),
      }));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/live/openclaw/sessions', async (request, reply) => {
    if (!liveSessionStore) {
      return reply.status(503).send({ message: 'Live session store is not configured' });
    }
    try {
      const payload = liveSessionSchema.parse(request.body);
      return reply.send(liveSessionStore.upsert(payload));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  if (dashboardDir && existsSync(dashboardDir)) {
    app.get('/dashboard', async (request, reply) => {
      if (!requireDashboardAccess(request, reply, dashboardAuth, dashboardSessions)) {
        return reply;
      }
      return sendDashboardShell(reply, dashboardDir);
    });
    app.get('/dashboard/', async (request, reply) => {
      if (!requireDashboardAccess(request, reply, dashboardAuth, dashboardSessions)) {
        return reply;
      }
      return sendDashboardShell(reply, dashboardDir);
    });
    app.get('/dashboard/*', async (request, reply) => {
      if (!requireDashboardAccess(request, reply, dashboardAuth, dashboardSessions)) {
        return reply;
      }
      const wildcard = (request.params as { '*': string })['*'];
      if (wildcard && wildcard.length > 0) {
        const requested = resolve(dashboardDir, wildcard);
        if (
          requested.startsWith(resolve(dashboardDir))
          && existsSync(requested)
          && statSync(requested).isFile()
        ) {
          return reply
            .type(contentTypeForPath(requested))
            .send(readFileSync(requested));
        }
      }
      return sendDashboardShell(reply, dashboardDir);
    });
  }

  app.post('/api/dashboard/session/login', async (request, reply) => {
    if (!dashboardAuth?.enabled || dashboardAuth.method !== 'session') {
      return reply.status(404).send({ message: 'dashboard session auth is not enabled' });
    }
    if (!dashboardAuth.password) {
      return reply.status(500).send({ message: 'dashboard auth enabled but password not configured' });
    }
    try {
      const payload = dashboardSessionLoginSchema.parse(request.body);
      const allowed = dashboardAuth.allowedUsers.length === 0 || dashboardAuth.allowedUsers.includes(payload.username);
      if (!allowed || payload.password !== dashboardAuth.password) {
        return reply.status(403).send({ message: 'invalid dashboard credentials' });
      }
      const session = issueDashboardSession(payload.username, dashboardAuth, dashboardSessions);
      reply.header(
        'Set-Cookie',
        `${DASHBOARD_SESSION_COOKIE}=${session.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${session.ttlHours * 60 * 60}`,
      );
      return reply.send({ ok: true, username: payload.username, method: 'session' });
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/dashboard/session/logout', async (request, reply) => {
    if (!dashboardAuth?.enabled || dashboardAuth.method !== 'session') {
      return reply.status(404).send({ message: 'dashboard session auth is not enabled' });
    }
    clearDashboardSession(request, dashboardSessions);
    reply.header(
      'Set-Cookie',
      `${DASHBOARD_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    );
    return reply.send({ ok: true });
  });

  app.get('/api/dashboard/session', async (request, reply) => {
    if (!dashboardAuth?.enabled || dashboardAuth.method !== 'session') {
      return reply.send({ authenticated: false, method: dashboardAuth?.method ?? null });
    }
    const current = getDashboardSession(request, dashboardSessions);
    if (!current) {
      return reply.send({ authenticated: false, method: 'session' });
    }
    return reply.send({
      authenticated: true,
      method: 'session',
      username: current.session.username,
    });
  });

  app.post('/api/tasks', async (request, reply) => {
    if (!taskService) {
      return reply.status(503).send({ message: 'Task service is not configured' });
    }
    try {
      const payload = createTaskRequestSchema.parse(request.body);
      const created = taskService.createTask(payload);
      recordTaskAction(metrics, 'create', 'success');
      emitStructuredLog(structuredLogs, {
        module: 'task',
        msg: 'task_action',
        action: 'create',
        task_id: created.id,
        state: created.state,
        stage: created.current_stage,
        creator: created.creator,
      });
      return created;
    } catch (error) {
      const translated = translateError(error);
      recordTaskAction(metrics, 'create', 'error');
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.get('/api/tasks', async (request, reply) => {
    if (!taskService) {
      return reply.status(503).send({ message: 'Task service is not configured' });
    }
    const query = request.query as { state?: string };
    return reply.send(taskService.listTasks(query.state));
  });

  app.get('/api/tasks/:taskId', async (request, reply) => {
    if (!taskService) {
      return reply.status(503).send({ message: 'Task service is not configured' });
    }
    const params = request.params as { taskId: string };
    const task = taskService.getTask(params.taskId);
    if (!task) {
      return reply.status(404).send({ message: `Task ${params.taskId} not found` });
    }
    return reply.send(task);
  });

  app.get('/api/tasks/:taskId/status', async (request, reply) => {
    if (!taskService) {
      return reply.status(503).send({ message: 'Task service is not configured' });
    }
    try {
      const params = request.params as { taskId: string };
      return reply.send(taskService.getTaskStatus(params.taskId));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/tasks/:taskId/advance', async (request, reply) => {
    if (!taskService) {
      return reply.status(503).send({ message: 'Task service is not configured' });
    }
    try {
      const params = request.params as { taskId: string };
      const payload = advanceTaskRequestSchema.parse(request.body);
      const task = taskService.advanceTask(params.taskId, {
        callerId: payload.caller_id,
      });
      recordTaskAction(metrics, 'advance', 'success');
      emitStructuredLog(structuredLogs, {
        module: 'task',
        msg: 'task_action',
        action: 'advance',
        task_id: task.id,
        state: task.state,
        stage: task.current_stage,
        actor: payload.caller_id,
      });
      return reply.send(task);
    } catch (error) {
      const translated = translateError(error);
      recordTaskAction(metrics, 'advance', 'error');
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/tasks/:taskId/approve', async (request, reply) => {
    if (!taskService) {
      return reply.status(503).send({ message: 'Task service is not configured' });
    }
    try {
      const params = request.params as { taskId: string };
      const payload = approveTaskRequestSchema.parse(request.body);
      return reply.send(
        taskService.approveTask(params.taskId, {
          approverId: payload.approver_id,
          comment: payload.comment,
        }),
      );
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/tasks/:taskId/reject', async (request, reply) => {
    if (!taskService) {
      return reply.status(503).send({ message: 'Task service is not configured' });
    }
    try {
      const params = request.params as { taskId: string };
      const payload = rejectTaskRequestSchema.parse(request.body);
      return reply.send(
        taskService.rejectTask(params.taskId, {
          rejectorId: payload.rejector_id,
          reason: payload.reason,
        }),
      );
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/tasks/:taskId/archon-approve', async (request, reply) => {
    if (!taskService) {
      return reply.status(503).send({ message: 'Task service is not configured' });
    }
    try {
      const params = request.params as { taskId: string };
      const payload = archonApproveTaskRequestSchema.parse(request.body);
      return reply.send(
        taskService.archonApproveTask(params.taskId, {
          reviewerId: payload.reviewer_id,
          comment: payload.comment,
        }),
      );
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/tasks/:taskId/archon-reject', async (request, reply) => {
    if (!taskService) {
      return reply.status(503).send({ message: 'Task service is not configured' });
    }
    try {
      const params = request.params as { taskId: string };
      const payload = archonRejectTaskRequestSchema.parse(request.body);
      return reply.send(
        taskService.archonRejectTask(params.taskId, {
          reviewerId: payload.reviewer_id,
          reason: payload.reason,
        }),
      );
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/tasks/:taskId/subtask-done', async (request, reply) => {
    if (!taskService) {
      return reply.status(503).send({ message: 'Task service is not configured' });
    }
    try {
      const params = request.params as { taskId: string };
      const payload = subtaskDoneRequestSchema.parse(request.body);
      return reply.send(
        taskService.completeSubtask(params.taskId, {
          subtaskId: payload.subtask_id,
          callerId: payload.caller_id,
          output: payload.output,
        }),
      );
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/tasks/:taskId/force-advance', async (request, reply) => {
    if (!taskService) {
      return reply.status(503).send({ message: 'Task service is not configured' });
    }
    try {
      const params = request.params as { taskId: string };
      const payload = taskNoteRequestSchema.parse(request.body);
      return reply.send(
        taskService.forceAdvanceTask(params.taskId, {
          reason: payload.reason,
        }),
      );
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/tasks/:taskId/confirm', async (request, reply) => {
    if (!taskService) {
      return reply.status(503).send({ message: 'Task service is not configured' });
    }
    try {
      const params = request.params as { taskId: string };
      const payload = confirmTaskRequestSchema.parse(request.body);
      return reply.send(
        taskService.confirmTask(params.taskId, {
          voterId: payload.voter_id,
          vote: payload.vote,
          comment: payload.comment,
        }),
      );
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/tasks/:taskId/pause', async (request, reply) => {
    if (!taskService) {
      return reply.status(503).send({ message: 'Task service is not configured' });
    }
    try {
      const params = request.params as { taskId: string };
      const payload = taskNoteRequestSchema.parse(request.body);
      const task = taskService.pauseTask(params.taskId, { reason: payload.reason });
      recordTaskAction(metrics, 'pause', 'success');
      emitStructuredLog(structuredLogs, {
        module: 'task',
        msg: 'task_action',
        action: 'pause',
        task_id: task.id,
        state: task.state,
        stage: task.current_stage,
        reason: payload.reason,
      });
      return reply.send(task);
    } catch (error) {
      const translated = translateError(error);
      recordTaskAction(metrics, 'pause', 'error');
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/tasks/:taskId/resume', async (request, reply) => {
    if (!taskService) {
      return reply.status(503).send({ message: 'Task service is not configured' });
    }
    try {
      const params = request.params as { taskId: string };
      const task = taskService.resumeTask(params.taskId);
      recordTaskAction(metrics, 'resume', 'success');
      emitStructuredLog(structuredLogs, {
        module: 'task',
        msg: 'task_action',
        action: 'resume',
        task_id: task.id,
        state: task.state,
        stage: task.current_stage,
      });
      return reply.send(task);
    } catch (error) {
      const translated = translateError(error);
      recordTaskAction(metrics, 'resume', 'error');
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/tasks/:taskId/cancel', async (request, reply) => {
    if (!taskService) {
      return reply.status(503).send({ message: 'Task service is not configured' });
    }
    try {
      const params = request.params as { taskId: string };
      const payload = taskNoteRequestSchema.parse(request.body);
      const task = taskService.cancelTask(params.taskId, { reason: payload.reason });
      recordTaskAction(metrics, 'cancel', 'success');
      emitStructuredLog(structuredLogs, {
        module: 'task',
        msg: 'task_action',
        action: 'cancel',
        task_id: task.id,
        state: task.state,
        stage: task.current_stage,
        reason: payload.reason,
      });
      return reply.send(task);
    } catch (error) {
      const translated = translateError(error);
      recordTaskAction(metrics, 'cancel', 'error');
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/tasks/:taskId/unblock', async (request, reply) => {
    if (!taskService) {
      return reply.status(503).send({ message: 'Task service is not configured' });
    }
    try {
      const params = request.params as { taskId: string };
      const payload = unblockTaskRequestSchema.parse(request.body);
      return reply.send(taskService.unblockTask(
        params.taskId,
        payload.action
          ? {
            reason: payload.reason,
            action: payload.action,
            ...(payload.assignee ? { assignee: payload.assignee } : {}),
            ...(payload.craftsman_type ? { craftsman_type: payload.craftsman_type } : {}),
          }
          : { reason: payload.reason },
      ));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/tasks/cleanup', async (request, reply) => {
    if (!taskService) {
      return reply.status(503).send({ message: 'Task service is not configured' });
    }
    try {
      const payload = cleanupTasksRequestSchema.parse(request.body ?? {});
      return reply.send({ cleaned: taskService.cleanupOrphaned(payload.task_id) });
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/craftsmen/dispatch', async (request, reply) => {
    if (!taskService) {
      return reply.status(503).send({ message: 'Task service is not configured' });
    }
    try {
      const payload = craftsmanDispatchRequestSchema.parse(request.body);
      const dispatched = taskService.dispatchCraftsman(payload);
      recordCraftsmanDispatch(metrics, payload.adapter, 'success');
      emitStructuredLog(structuredLogs, {
        module: 'craftsman',
        msg: 'craftsman_dispatch',
        task_id: payload.task_id,
        subtask_id: payload.subtask_id,
        adapter: payload.adapter,
        mode: payload.mode,
        execution_id: dispatched.execution.execution_id,
        status: dispatched.execution.status,
      });
      return reply.send(dispatched);
    } catch (error) {
      const translated = translateError(error);
      try {
        const payload = craftsmanDispatchRequestSchema.parse(request.body);
        recordCraftsmanDispatch(metrics, payload.adapter, 'error');
      } catch {
        recordCraftsmanDispatch(metrics, 'unknown', 'error');
      }
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/craftsmen/callback', async (request, reply) => {
    if (!taskService) {
      return reply.status(503).send({ message: 'Task service is not configured' });
    }
    try {
      const payload = craftsmanCallbackRequestSchema.parse(request.body);
      const result = taskService.handleCraftsmanCallback(payload);
      recordCraftsmanCallback(metrics, payload.status);
      emitStructuredLog(structuredLogs, {
        module: 'craftsman',
        msg: 'craftsman_callback',
        execution_id: payload.execution_id,
        callback_status: payload.status,
        task_id: result.execution.task_id,
        subtask_id: result.execution.subtask_id,
      });
      return reply.send(result);
    } catch (error) {
      const translated = translateError(error);
      try {
        const payload = craftsmanCallbackRequestSchema.parse(request.body);
        recordCraftsmanCallback(metrics, `${payload.status}_error`);
      } catch {
        recordCraftsmanCallback(metrics, 'invalid_error');
      }
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.get('/api/craftsmen/executions/:executionId', async (request, reply) => {
    if (!taskService) {
      return reply.status(503).send({ message: 'Task service is not configured' });
    }
    try {
      const params = request.params as { executionId: string };
      return reply.send(taskService.getCraftsmanExecution(params.executionId));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.get('/api/craftsmen/tasks/:taskId/subtasks/:subtaskId/executions', async (request, reply) => {
    if (!taskService) {
      return reply.status(503).send({ message: 'Task service is not configured' });
    }
    try {
      const params = request.params as { taskId: string; subtaskId: string };
      return reply.send(taskService.listCraftsmanExecutions(params.taskId, params.subtaskId));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/craftsmen/runtime/identity', async (request, reply) => {
    if (!tmuxRuntimeService) {
      return reply.status(503).send({ message: 'Tmux runtime service is not configured' });
    }
    try {
      const payload = craftsmanRuntimeIdentityRequestSchema.parse(request.body);
      return reply.send({
        ok: true,
        identity: tmuxRuntimeService.recordIdentity(payload.agent, {
          sessionReference: payload.session_reference ?? null,
          identitySource: payload.identity_source,
          identityPath: payload.identity_path ?? null,
          sessionObservedAt: payload.session_observed_at ?? null,
          workspaceRoot: payload.workspace_root ?? null,
        }),
      });
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.get('/api/craftsmen/tmux/status', async (request, reply) => {
    if (!tmuxRuntimeService) {
      return reply.status(503).send({ message: 'Tmux runtime service is not configured' });
    }
    return reply.send(tmuxRuntimeService.status());
  });

  app.get('/api/craftsmen/tmux/doctor', async (request, reply) => {
    if (!tmuxRuntimeService) {
      return reply.status(503).send({ message: 'Tmux runtime service is not configured' });
    }
    return reply.send(tmuxRuntimeService.doctor());
  });

  app.post('/api/craftsmen/tmux/send', async (request, reply) => {
    if (!tmuxRuntimeService) {
      return reply.status(503).send({ message: 'Tmux runtime service is not configured' });
    }
    try {
      const payload = tmuxSendSchema.parse(request.body);
      tmuxRuntimeService.send(payload.agent, payload.command);
      return reply.send({ ok: true });
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/craftsmen/tmux/task', async (request, reply) => {
    if (!tmuxRuntimeService) {
      return reply.status(503).send({ message: 'Tmux runtime service is not configured' });
    }
    try {
      const payload = tmuxTaskSchema.parse(request.body);
      return reply.send(tmuxRuntimeService.task(payload.agent, {
        execution_id: `tmux-${Date.now()}`,
        task_id: 'TMUX',
        stage_id: 'dispatch',
        subtask_id: `${payload.agent}-tmux-task`,
        adapter: payload.agent,
        mode: 'task',
        workdir: payload.workdir ?? process.cwd(),
        prompt: payload.prompt,
        brief_path: null,
      }));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.get('/api/craftsmen/tmux/tail/:agent', async (request, reply) => {
    if (!tmuxRuntimeService) {
      return reply.status(503).send({ message: 'Tmux runtime service is not configured' });
    }
    try {
      const params = request.params as { agent: string };
      const query = request.query as { lines?: string };
      const lines = query.lines ? Number(query.lines) : 40;
      if (!Number.isFinite(lines) || lines <= 0) {
        throw new Error('lines must be a positive number');
      }
      return reply.send({ output: tmuxRuntimeService.tail(params.agent, lines) });
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.get('/api/inbox', async (request, reply) => {
    if (!inboxService) {
      return reply.status(503).send({ message: 'Inbox service is not configured' });
    }
    const query = request.query as { status?: string };
    return reply.send(inboxService.listInboxItems(query.status));
  });

  app.post('/api/inbox', async (request, reply) => {
    if (!inboxService) {
      return reply.status(503).send({ message: 'Inbox service is not configured' });
    }
    try {
      const payload = createInboxRequestSchema.parse(request.body);
      return reply.send(inboxService.createInboxItem({
        text: payload.text,
        ...(payload.source !== undefined ? { source: payload.source } : {}),
        ...(payload.notes !== undefined ? { notes: payload.notes } : {}),
        ...(payload.tags !== undefined ? { tags: payload.tags } : {}),
      }));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.patch('/api/inbox/:inboxId', async (request, reply) => {
    if (!inboxService) {
      return reply.status(503).send({ message: 'Inbox service is not configured' });
    }
    try {
      const params = request.params as { inboxId: string };
      const payload = updateInboxRequestSchema.parse(request.body);
      return reply.send(inboxService.updateInboxItem(parseNumericId(params.inboxId, 'inboxId'), payload));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.delete('/api/inbox/:inboxId', async (request, reply) => {
    if (!inboxService) {
      return reply.status(503).send({ message: 'Inbox service is not configured' });
    }
    try {
      const params = request.params as { inboxId: string };
      return reply.send(inboxService.deleteInboxItem(parseNumericId(params.inboxId, 'inboxId')));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/inbox/:inboxId/promote', async (request, reply) => {
    if (!inboxService) {
      return reply.status(503).send({ message: 'Inbox service is not configured' });
    }
    try {
      const params = request.params as { inboxId: string };
      const payload = promoteInboxRequestSchema.parse(request.body);
      return reply.send(inboxService.promoteInboxItem(parseNumericId(params.inboxId, 'inboxId'), payload));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.get('/api/agents/status', async (request, reply) => {
    if (!dashboardQueryService) {
      return reply.status(503).send({ message: 'Dashboard query service is not configured' });
    }
    return reply.send(dashboardQueryService.getAgentsStatus());
  });

  app.get('/api/agents/channels/:channel', async (request, reply) => {
    if (!dashboardQueryService) {
      return reply.status(503).send({ message: 'Dashboard query service is not configured' });
    }
    try {
      const params = request.params as { channel: string };
      return reply.send(dashboardQueryService.getAgentChannelDetail(params.channel));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.get('/api/archive/jobs', async (request, reply) => {
    if (!dashboardQueryService) {
      return reply.status(503).send({ message: 'Dashboard query service is not configured' });
    }
    const query = request.query as { status?: string; task_id?: string };
    const filters: { status?: string; taskId?: string } = {};
    if (query.status !== undefined) {
      filters.status = query.status;
    }
    if (query.task_id !== undefined) {
      filters.taskId = query.task_id;
    }
    return reply.send(
      dashboardQueryService.listArchiveJobs(filters),
    );
  });

  app.get('/api/archive/jobs/:jobId', async (request, reply) => {
    if (!dashboardQueryService) {
      return reply.status(503).send({ message: 'Dashboard query service is not configured' });
    }
    try {
      const params = request.params as { jobId: string };
      return reply.send(dashboardQueryService.getArchiveJob(parseNumericId(params.jobId, 'jobId')));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/archive/jobs/:jobId/retry', async (request, reply) => {
    if (!dashboardQueryService) {
      return reply.status(503).send({ message: 'Dashboard query service is not configured' });
    }
    try {
      const params = request.params as { jobId: string };
      return reply.send(dashboardQueryService.retryArchiveJob(parseNumericId(params.jobId, 'jobId')));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/archive/jobs/:jobId/notify', async (request, reply) => {
    if (!dashboardQueryService) {
      return reply.status(503).send({ message: 'Dashboard query service is not configured' });
    }
    try {
      const params = request.params as { jobId: string };
      return reply.send(dashboardQueryService.notifyArchiveJob(parseNumericId(params.jobId, 'jobId')));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/archive/jobs/:jobId/status', async (request, reply) => {
    if (!dashboardQueryService) {
      return reply.status(503).send({ message: 'Dashboard query service is not configured' });
    }
    try {
      const params = request.params as { jobId: string };
      const payload = archiveJobStatusUpdateRequestSchema.parse(request.body);
      return reply.send(dashboardQueryService.updateArchiveJob(parseNumericId(params.jobId, 'jobId'), payload));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/archive/jobs/scan-stale', async (request, reply) => {
    if (!dashboardQueryService) {
      return reply.status(503).send({ message: 'Dashboard query service is not configured' });
    }
    try {
      const payload = archiveJobScanRequestSchema.parse(request.body ?? {});
      return reply.send(dashboardQueryService.failStaleArchiveJobs({ timeoutMs: payload.timeout_ms }));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/archive/jobs/scan-receipts', async (_request, reply) => {
    if (!dashboardQueryService) {
      return reply.status(503).send({ message: 'Dashboard query service is not configured' });
    }
    try {
      return reply.send(dashboardQueryService.ingestArchiveJobReceipts());
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.get('/api/todos', async (request, reply) => {
    if (!dashboardQueryService) {
      return reply.status(503).send({ message: 'Dashboard query service is not configured' });
    }
    const query = request.query as { status?: string };
    const filters: { status?: string } = {};
    if (query.status !== undefined) {
      filters.status = query.status;
    }
    return reply.send(dashboardQueryService.listTodos(filters));
  });

  app.post('/api/todos', async (request, reply) => {
    if (!dashboardQueryService) {
      return reply.status(503).send({ message: 'Dashboard query service is not configured' });
    }
    try {
      const payload = createTodoRequestSchema.parse(request.body);
      return reply.send(dashboardQueryService.createTodo(payload));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.patch('/api/todos/:todoId', async (request, reply) => {
    if (!dashboardQueryService) {
      return reply.status(503).send({ message: 'Dashboard query service is not configured' });
    }
    try {
      const params = request.params as { todoId: string };
      const payload = updateTodoRequestSchema.parse(request.body);
      return reply.send(dashboardQueryService.updateTodo(parseNumericId(params.todoId, 'todoId'), payload));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.delete('/api/todos/:todoId', async (request, reply) => {
    if (!dashboardQueryService) {
      return reply.status(503).send({ message: 'Dashboard query service is not configured' });
    }
    try {
      const params = request.params as { todoId: string };
      return reply.send(dashboardQueryService.deleteTodo(parseNumericId(params.todoId, 'todoId')));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/todos/:todoId/promote', async (request, reply) => {
    if (!taskService) {
      return reply.status(503).send({ message: 'Task service is not configured' });
    }
    try {
      const params = request.params as { todoId: string };
      const payload = promoteTodoRequestSchema.parse(request.body);
      return reply.send(taskService.promoteTodo(parseNumericId(params.todoId, 'todoId'), payload));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.get('/api/templates', async (request, reply) => {
    if (!dashboardQueryService) {
      return reply.status(503).send({ message: 'Dashboard query service is not configured' });
    }
    return reply.send(dashboardQueryService.listTemplates());
  });

  app.get('/api/templates/:templateId', async (request, reply) => {
    if (!dashboardQueryService) {
      return reply.status(503).send({ message: 'Dashboard query service is not configured' });
    }
    try {
      const params = request.params as { templateId: string };
      return reply.send(dashboardQueryService.getTemplate(params.templateId));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/templates/validate', async (request, reply) => {
    if (!templateAuthoringService) {
      return reply.status(503).send({ message: 'Template authoring service is not configured' });
    }
    try {
      const payload = templateValidationRequestSchema.parse(request.body);
      return reply.send(templateAuthoringService.validateTemplate(payload));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/templates', async (request, reply) => {
    if (!templateAuthoringService) {
      return reply.status(503).send({ message: 'Template authoring service is not configured' });
    }
    try {
      const payload = saveTemplateRequestSchema.parse(request.body);
      return reply.send(templateAuthoringService.saveTemplate(payload.id, payload.template));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.put('/api/templates/:templateId', async (request, reply) => {
    if (!templateAuthoringService) {
      return reply.status(503).send({ message: 'Template authoring service is not configured' });
    }
    try {
      const params = request.params as { templateId: string };
      const payload = templateValidationRequestSchema.parse(request.body);
      return reply.send(templateAuthoringService.saveTemplate(params.templateId, payload));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/templates/:templateId/duplicate', async (request, reply) => {
    if (!templateAuthoringService) {
      return reply.status(503).send({ message: 'Template authoring service is not configured' });
    }
    try {
      const params = request.params as { templateId: string };
      const payload = duplicateTemplateRequestSchema.parse(request.body);
      return reply.send(templateAuthoringService.duplicateTemplate(params.templateId, payload));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.put('/api/templates/:templateId/workflow', async (request, reply) => {
    if (!templateAuthoringService) {
      return reply.status(503).send({ message: 'Template authoring service is not configured' });
    }
    try {
      const params = request.params as { templateId: string };
      const payload = updateTemplateWorkflowRequestSchema.parse(request.body);
      return reply.send(templateAuthoringService.updateTemplateWorkflow(params.templateId, payload));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/workflows/validate', async (request, reply) => {
    if (!templateAuthoringService) {
      return reply.status(503).send({ message: 'Template authoring service is not configured' });
    }
    try {
      const payload = validateWorkflowRequestSchema.parse(request.body);
      return reply.send(templateAuthoringService.validateWorkflow(payload));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  return app;
}

function sendDashboardShell(reply: FastifyReply, dashboardDir: string) {
  const indexPath = resolve(dashboardDir, 'index.html');
  return reply.type('text/html; charset=utf-8').send(readFileSync(indexPath));
}

function contentTypeForPath(path: string) {
  if (path.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (path.endsWith('.css')) return 'text/css; charset=utf-8';
  if (path.endsWith('.svg')) return 'image/svg+xml';
  if (path.endsWith('.json')) return 'application/json; charset=utf-8';
  if (path.endsWith('.html')) return 'text/html; charset=utf-8';
  return 'application/octet-stream';
}
