import { existsSync, readFileSync, statSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve, sep } from 'node:path';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import {
  BUILT_IN_AGORA_NOMOS_PACK,
  DEFAULT_AGORA_NOMOS_ID,
  buildBuiltInAgoraNomosSeededAssets,
  buildBuiltInAgoraNomosProjectProfile,
  diagnoseProjectNomosDrift,
  diffProjectNomos,
  exportNomosShareBundle,
  exportProjectNomosPack,
  activateProjectNomosDraft,
  inspectRegisteredNomosSource,
  importNomosSource,
  importNomosShareBundle,
  inspectPublishedNomosCatalogPack,
  installLocalNomosPackToProject,
  installCatalogNomosPackToProject,
  installNomosFromRegisteredSource,
  installNomosFromSource,
  listPublishedNomosCatalog,
  listRegisteredNomosSources,
  NOMOS_LIFECYCLE_MODULES,
  prepareProjectNomosInstall,
  publishProjectNomosPack,
  registerNomosSource,
  REPO_AGENTS_SHIM_SECTION_ORDER,
  requireSupportedNomosId,
  resolveProjectNomosProvenance,
  resolveProjectNomosState,
  resolveProjectNomosRuntimePaths,
  reviewProjectNomosDraft,
  syncRegisteredNomosSource,
  validateProjectNomos,
} from '@agora-ts/config';
import {
  craftsmanCallbackRequestSchema,
  craftsmanDispatchRequestSchema,
  craftsmanExecutionSendKeysRequestSchema,
  craftsmanExecutionSendTextRequestSchema,
  craftsmanExecutionSubmitChoiceRequestSchema,
  craftsmanExecutionTailResponseSchema,
  craftsmanGovernanceSnapshotSchema,
  observeCraftsmanExecutionsRequestSchema,
  observeCraftsmanExecutionsResponseSchema,
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
  dashboardSessionLoginRequestSchema,
  dashboardSessionLoginResponseSchema,
  dashboardSessionLogoutResponseSchema,
  dashboardSessionStatusResponseSchema,
  dashboardUserBindIdentityRequestSchema,
  dashboardUserCreateRequestSchema,
  dashboardUserListResponseSchema,
  dashboardUserUpdatePasswordRequestSchema,
  createProjectMembershipSchema,
  createInboxRequestSchema,
  createProjectRequestSchema,
  createTaskRequestSchema,
  createSubtasksRequestSchema,
  createTaskContextBindingRequestSchema,
  orchestratorDirectCreateRequestSchema,
  currentImTaskApproveRequestSchema,
  currentImTaskRejectRequestSchema,
  ingestTaskConversationEntryRequestSchema,
  taskConversationMarkReadRequestSchema,
  duplicateTemplateRequestSchema,
  projectContextRetrieveRequestSchema,
  projectContextRetrieveResponseSchema,
  type HealthResponse,
  unifiedHealthSnapshotSchema,
  liveSessionSchema,
  liveSessionCleanupResponseSchema,
  listProjectsResponseSchema,
  promoteTodoRequestSchema,
  probeInactiveTasksRequestSchema,
  promoteInboxRequestSchema,
  rejectTaskRequestSchema,
  runtimeRecoveryActionSchema,
  runtimeDiagnosisResultSchema,
  runtimeRecoveryRequestSchema,
  craftsmanStopExecutionRequestSchema,
  saveTemplateRequestSchema,
  type CreateTaskRequestDto,
  subtaskLifecycleRequestSchema,
  subtaskDoneRequestSchema,
  taskNoteRequestSchema,
  unblockTaskRequestSchema,
  templateValidationRequestSchema,
  updateTodoRequestSchema,
  updateInboxRequestSchema,
  updateTemplateGraphRequestSchema,
  updateTemplateWorkflowRequestSchema,
  validateTemplateGraphRequestSchema,
  validateWorkflowRequestSchema,
  workspaceBootstrapStatusSchema,
} from '@agora-ts/contracts';
import {
  CcConnectInspectionService,
  CcConnectManagementService,
  NotFoundError,
  PermissionDeniedError,
  type DashboardQueryService,
  type HumanAccountService,
  type InboxService,
  type LiveSessionStore,
  type NotificationDispatcher,
  type CitizenService,
  type InteractiveRuntimePort,
  OrchestratorDirectCreateService,
  type ProjectBrainDoctorService as ProjectBrainDoctorServiceContract,
  type ProjectBrainService,
  ProjectBootstrapService,
  type RetrievalService,
  type ProjectService,
  ProjectService as ProjectServiceImpl,
  ProjectMembershipService,
  ProjectAgentRosterService,
  type TaskConversationService,
  type TaskInboundService,
  type TaskParticipationService,
  type TaskContextBindingService,
  type TaskService,
  type TemplateAuthoringService,
  type WorkspaceBootstrapService,
  WorkspaceBootstrapService as WorkspaceBootstrapServiceImpl,
} from '@agora-ts/core';
import {
  NotificationOutboxRepository,
  HumanAccountRepository,
  ProjectMembershipRepository,
  ProjectAgentRosterRepository,
  ProjectRepository,
  TaskRepository,
  type AgoraDatabase,
} from '@agora-ts/db';

export interface BuildAppOptions {
  db?: AgoraDatabase;
  taskService?: TaskService;
  projectService?: ProjectService;
  projectBrainService?: ProjectBrainService;
  contextRetrievalService?: Pick<RetrievalService, 'retrieve'>;
  projectBrainDoctorService?: ProjectBrainDoctorServiceContract;
  workspaceBootstrapService?: WorkspaceBootstrapService;
  citizenService?: CitizenService;
  dashboardQueryService?: DashboardQueryService;
  ccConnectInspectionService?: CcConnectInspectionService;
  ccConnectManagementService?: CcConnectManagementService;
  inboxService?: InboxService;
  templateAuthoringService?: TemplateAuthoringService;
  liveSessionStore?: LiveSessionStore;
  legacyRuntimeService?: Pick<
    InteractiveRuntimePort,
    'up' | 'status' | 'doctor' | 'send' | 'sendText' | 'sendKeys' | 'submitChoice' | 'task' | 'tail' | 'down' | 'recordIdentity'
  >;
  tmuxRuntimeService?: Pick<
    InteractiveRuntimePort,
    'up' | 'status' | 'doctor' | 'send' | 'sendText' | 'sendKeys' | 'submitChoice' | 'task' | 'tail' | 'down' | 'recordIdentity'
  >;
  taskContextBindingService?: TaskContextBindingService;
  taskConversationService?: TaskConversationService;
  taskInboundService?: TaskInboundService;
  taskParticipationService?: TaskParticipationService;
  notificationDispatcher?: NotificationDispatcher;
  humanAccountService?: HumanAccountService;
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
  workspaceBootstrap?: {
    runtimeReady?: boolean;
    runtimeReadinessReason?: string | null;
    creator?: string | null;
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
  account_id: number | null;
  username: string;
  role: 'admin' | 'member';
  expiresAt: number;
};

type HumanActor = {
  account_id: number | null;
  username: string;
  role: 'admin' | 'member';
  source: 'dashboard' | 'im';
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

function parseOptionalInt(value: string | number | undefined) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildCcConnectManagementInput(input: {
  configPath?: string;
  managementBaseUrl?: string;
  managementToken?: string;
  timeoutMs?: string | number;
}) {
  return {
    ...(input.configPath ? { configPath: input.configPath } : {}),
    ...(input.managementBaseUrl ? { managementBaseUrl: input.managementBaseUrl } : {}),
    ...(input.managementToken ? { managementToken: input.managementToken } : {}),
    ...(parseOptionalInt(input.timeoutMs) !== null ? { timeoutMs: parseOptionalInt(input.timeoutMs) as number } : {}),
  };
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
    || url.startsWith('/api/projects')
    || url.startsWith('/api/agents/')
    || url === '/api/agents/status'
    || url.startsWith('/api/archive/')
    || url === '/api/archive/jobs'
    || url.startsWith('/api/todos')
    || url.startsWith('/api/templates')
    || url.startsWith('/api/craftsmen/runtime/')
    || url.startsWith('/api/craftsmen/executions/')
    || url.startsWith('/api/craftsmen/tasks/')
    || url.startsWith('/api/nomos')
    || url === '/api/skills'
    || url.startsWith('/api/inbox')
    || url === '/api/craftsmen/governance';
}

function isDashboardSessionBypassRoute(url: string) {
  // Valid dashboard session bypasses bearer auth for all /api/* routes.
  // /api/dashboard/* is handled separately by isDashboardSessionRoute/isDashboardUserRoute.
  return url.startsWith('/api/') && !url.startsWith('/api/dashboard/');
}

function isDashboardUserRoute(url: string) {
  return url === '/api/dashboard/users'
    || /^\/api\/dashboard\/users\/[^/]+\/disable$/.test(url)
    || /^\/api\/dashboard\/users\/[^/]+\/password$/.test(url)
    || /^\/api\/dashboard\/users\/[^/]+\/identities$/.test(url);
}

const DASHBOARD_SESSION_COOKIE = 'agora_dashboard_session';
const DASHBOARD_BOOTSTRAP_REQUIRED_MESSAGE = 'dashboard session auth has no bootstrap admin account; run `agora init` or `agora dashboard users add`';

function createDashboardLoginPage() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Agora Dashboard Login</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; background: #f4f7f8; color: #13232b; }
      main { max-width: 420px; margin: 10vh auto; padding: 24px; background: white; border: 1px solid #d7e1e4; border-radius: 16px; box-shadow: 0 18px 48px rgba(19, 35, 43, 0.08); }
      h1 { margin-top: 0; font-size: 24px; }
      p { color: #49616b; line-height: 1.5; }
      label { display: block; margin-top: 16px; font-size: 14px; font-weight: 600; }
      input { width: 100%; margin-top: 6px; padding: 10px 12px; border: 1px solid #c6d4d9; border-radius: 10px; box-sizing: border-box; }
      button { margin-top: 18px; width: 100%; padding: 10px 12px; border: 0; border-radius: 10px; background: #0b6478; color: white; font-weight: 700; cursor: pointer; }
      #error { margin-top: 12px; color: #b42318; min-height: 20px; }
    </style>
  </head>
  <body>
    <main>
      <h1>Agora Dashboard Login</h1>
      <p>Sign in with a human review account to access Dashboard approval actions.</p>
      <form id="login-form">
        <label>
          Username
          <input id="username" name="username" autocomplete="username" />
        </label>
        <label>
          Password
          <input id="password" name="password" type="password" autocomplete="current-password" />
        </label>
        <button type="submit">Sign in</button>
        <div id="error"></div>
      </form>
    </main>
    <script>
      const form = document.getElementById('login-form');
      const error = document.getElementById('error');
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        error.textContent = '';
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const response = await fetch('/api/dashboard/session/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({ message: 'login failed' }));
          error.textContent = payload.message || 'login failed';
          return;
        }
        window.location.href = '/dashboard';
      });
    </script>
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
  accountId: number | null,
  username: string,
  role: 'admin' | 'member',
  dashboardAuth: NonNullable<BuildAppOptions['dashboardAuth']>,
  sessions: Map<string, DashboardSession>,
) {
  const token = randomBytes(24).toString('hex');
  const ttlHours = dashboardAuth.sessionTtlHours ?? 24;
  sessions.set(token, {
    account_id: accountId,
    username,
    role,
    expiresAt: Date.now() + ttlHours * 60 * 60 * 1000,
  });
  return { token, ttlHours };
}

function resolveHumanActor(
  request: FastifyRequest,
  sessions: Map<string, DashboardSession>,
  humanAccountService?: HumanAccountService,
): HumanActor | null {
  const dashboardSession = getDashboardSession(request, sessions);
  if (dashboardSession) {
    return {
      account_id: dashboardSession.session.account_id,
      username: dashboardSession.session.username,
      role: dashboardSession.session.role,
      source: 'dashboard',
    };
  }

  if (!humanAccountService) {
    return null;
  }

  const provider = (request.headers['x-agora-human-provider'] as string | undefined)?.trim();
  const externalUserId = (request.headers['x-agora-human-external-id'] as string | undefined)?.trim();
  if (!provider || !externalUserId) {
    return null;
  }

  const account = humanAccountService.resolveIdentity(provider, externalUserId);
  if (!account) {
    return null;
  }

  return {
    account_id: account.id,
    username: account.username,
    role: account.role,
    source: 'im',
  };
}

function shouldRequireHumanActor(options: {
  apiAuth: BuildAppOptions['apiAuth'] | undefined;
  dashboardAuth: BuildAppOptions['dashboardAuth'] | undefined;
  humanAccountService: HumanAccountService | undefined;
}) {
  return Boolean(
    options.apiAuth?.enabled
      || options.dashboardAuth?.enabled
      || options.humanAccountService?.hasAccounts(),
  );
}

function resolveDashboardSessionUsername(
  request: FastifyRequest,
  sessions: Map<string, DashboardSession>,
) {
  return getDashboardSession(request, sessions)?.session.username ?? null;
}

function appendDashboardHumanImParticipantRef(
  payload: CreateTaskRequestDto,
  humanActor: HumanActor | null,
  humanAccountService?: HumanAccountService,
): Parameters<TaskService['createTask']>[0] {
  const enrichedCreator = humanActor
    ? {
        ...payload,
        creator: humanActor.username,
      }
    : payload;
  if (!humanActor?.account_id || !humanAccountService) {
    return enrichedCreator;
  }
  if (enrichedCreator.im_target?.provider && enrichedCreator.im_target.provider !== 'discord') {
    return enrichedCreator;
  }
  if (enrichedCreator.im_target?.visibility !== 'private') {
    return enrichedCreator;
  }
  const discordIdentity = humanAccountService.getIdentity(humanActor.account_id, 'discord');
  if (!discordIdentity) {
    return enrichedCreator;
  }
  const participantRefs = Array.from(new Set([
    ...(enrichedCreator.im_target?.participant_refs ?? []),
    discordIdentity.external_user_id,
  ]));
  return {
    ...enrichedCreator,
    im_target: {
      ...(enrichedCreator.im_target ?? {}),
      provider: enrichedCreator.im_target?.provider ?? 'discord',
      visibility: enrichedCreator.im_target?.visibility ?? 'private',
      participant_refs: participantRefs,
    },
  };
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

function requireDashboardAdminSession(
  request: FastifyRequest,
  reply: FastifyReply,
  sessions: Map<string, DashboardSession>,
) {
  const current = getDashboardSession(request, sessions);
  if (!current) {
    reply.status(401).send({ message: 'missing dashboard session' });
    return null;
  }
  if (current.session.role !== 'admin') {
    reply.status(403).send({ message: 'dashboard admin role required' });
    return null;
  }
  return current.session;
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
  legacyRuntimeService: Pick<InteractiveRuntimePort, 'up' | 'status' | 'doctor' | 'send' | 'sendText' | 'sendKeys' | 'submitChoice' | 'task' | 'tail' | 'down' | 'recordIdentity'> | undefined;
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

  const tmuxPanes = options.legacyRuntimeService?.status().panes.length ?? 0;
  lines.push('# HELP agora_craftsmen_sessions_active Current active legacy/runtime execution slots observed by the server.');
  lines.push('# TYPE agora_craftsmen_sessions_active gauge');
  lines.push(`agora_craftsmen_sessions_active ${tmuxPanes}`);

  return `${lines.join('\n')}\n`;
}

export function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({
    logger: false,
  });
  const taskService = options.taskService;
  const orchestratorDirectCreateService = taskService
    ? new OrchestratorDirectCreateService({ taskService })
    : undefined;
  app.addHook('onClose', async () => {
    await taskService?.drainBackgroundOperations?.();
  });
  const projectService = options.projectService ?? (options.db ? new ProjectServiceImpl({
    projectRepository: new ProjectRepository(options.db),
    taskRepository: new TaskRepository(options.db),
    membershipService: new ProjectMembershipService({
      membershipRepository: new ProjectMembershipRepository(options.db),
      accountRepository: new HumanAccountRepository(options.db),
    }),
    agentRosterService: new ProjectAgentRosterService({
      repository: new ProjectAgentRosterRepository(options.db),
    }),
    transactionManager: { begin: () => options.db!.exec('BEGIN'), commit: () => options.db!.exec('COMMIT'), rollback: () => options.db!.exec('ROLLBACK') },
  }) : undefined);
  const workspaceBootstrapService = options.workspaceBootstrapService ?? (
    options.db && taskService
      ? new WorkspaceBootstrapServiceImpl({
          taskRepository: new TaskRepository(options.db),
          taskService,
          runtimeReady: options.workspaceBootstrap?.runtimeReady ?? false,
          runtimeReadinessReason: options.workspaceBootstrap?.runtimeReadinessReason ?? null,
          creator: options.workspaceBootstrap?.creator ?? 'archon',
        })
      : undefined
  );
  workspaceBootstrapService?.initialize();
  const projectBrainDoctorService = options.projectBrainDoctorService;
  const projectBrainService = options.projectBrainService;
  const contextRetrievalService = options.contextRetrievalService;
  const citizenService = options.citizenService;
  const dashboardQueryService = options.dashboardQueryService;
  const ccConnectInspectionService = options.ccConnectInspectionService ?? new CcConnectInspectionService();
  const ccConnectManagementService = options.ccConnectManagementService ?? new CcConnectManagementService();
  const inboxService = options.inboxService;
  const templateAuthoringService = options.templateAuthoringService;
  const liveSessionStore = options.liveSessionStore;
  const legacyRuntimeService = options.legacyRuntimeService ?? options.tmuxRuntimeService;
  const taskContextBindingService = options.taskContextBindingService;
  const taskParticipationService = options.taskParticipationService;
  const taskConversationService = options.taskConversationService;
  const taskInboundService = options.taskInboundService;
  const notificationDispatcher = options.notificationDispatcher;
  const apiAuth = options.apiAuth;
  const dashboardAuth = options.dashboardAuth;
  const humanAccountService = options.humanAccountService;
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
        || (isDashboardUserRoute(request.url) && dashboardSession)
        || (isDashboardSessionBypassRoute(request.url) && dashboardSession)
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

  app.get('/api/health/snapshot', async (_request, reply) => {
    if (!taskService) {
      return reply.status(503).send({ message: 'Task service is not configured' });
    }
    return reply.send(unifiedHealthSnapshotSchema.parse(taskService.getHealthSnapshot()));
  });

  app.get(readyPath, async () => {
    return { status: 'ready' };
  });

  if (metricsEnabled) {
    app.get('/metrics', async (request, reply) => {
      return reply
        .type('text/plain; version=0.0.4; charset=utf-8')
        .send(renderMetrics({ metrics, taskService, legacyRuntimeService }));
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
      const session = liveSessionStore.upsert(payload);
      const sync = taskParticipationService?.syncLiveSession(payload) ?? null;
      return reply.send(sync ? { ...session, sync } : session);
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.get('/api/external-bridges/cc-connect/detect', async (request, reply) => {
    try {
      const query = request.query as {
        command?: string;
        configPath?: string;
        managementBaseUrl?: string;
        managementToken?: string;
        timeoutMs?: string;
      };
      return reply.send(await ccConnectInspectionService.inspect({
        ...(query.command ? { command: query.command } : {}),
        ...(query.configPath ? { configPath: query.configPath } : {}),
        ...(query.managementBaseUrl ? { managementBaseUrl: query.managementBaseUrl } : {}),
        ...(query.managementToken ? { managementToken: query.managementToken } : {}),
        ...(parseOptionalInt(query.timeoutMs) !== null ? { timeoutMs: parseOptionalInt(query.timeoutMs) as number } : {}),
      }));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.get('/api/external-bridges/cc-connect/status', async (request, reply) => {
    try {
      const query = request.query as {
        configPath?: string;
        managementBaseUrl?: string;
        managementToken?: string;
        timeoutMs?: string;
      };
      return reply.send(await ccConnectManagementService.listProjects(buildCcConnectManagementInput(query)));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.get('/api/external-bridges/cc-connect/projects', async (request, reply) => {
    try {
      const query = request.query as {
        configPath?: string;
        managementBaseUrl?: string;
        managementToken?: string;
        timeoutMs?: string;
      };
      return reply.send(await ccConnectManagementService.listProjects(buildCcConnectManagementInput(query)));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.get('/api/external-bridges/cc-connect/projects/:project', async (request, reply) => {
    try {
      const params = request.params as { project: string };
      const query = request.query as {
        configPath?: string;
        managementBaseUrl?: string;
        managementToken?: string;
        timeoutMs?: string;
      };
      return reply.send(await ccConnectManagementService.getProject({
        ...buildCcConnectManagementInput(query),
        project: params.project,
      }));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.get('/api/external-bridges/cc-connect/projects/:project/sessions', async (request, reply) => {
    try {
      const params = request.params as { project: string };
      const query = request.query as {
        configPath?: string;
        managementBaseUrl?: string;
        managementToken?: string;
        timeoutMs?: string;
      };
      return reply.send(await ccConnectManagementService.listSessions({
        ...buildCcConnectManagementInput(query),
        project: params.project,
      }));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.get('/api/external-bridges/cc-connect/projects/:project/sessions/:sessionId', async (request, reply) => {
    try {
      const params = request.params as { project: string; sessionId: string };
      const query = request.query as {
        configPath?: string;
        managementBaseUrl?: string;
        managementToken?: string;
        timeoutMs?: string;
        historyLimit?: string;
      };
      return reply.send(await ccConnectManagementService.getSession({
        ...buildCcConnectManagementInput(query),
        project: params.project,
        sessionId: params.sessionId,
        ...(parseOptionalInt(query.historyLimit) !== null ? { historyLimit: parseOptionalInt(query.historyLimit) as number } : {}),
      }));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/external-bridges/cc-connect/projects/:project/sessions', async (request, reply) => {
    try {
      const params = request.params as { project: string };
      const body = request.body as {
        configPath?: string;
        managementBaseUrl?: string;
        managementToken?: string;
        timeoutMs?: number;
        session_key: string;
        name?: string;
      };
      return reply.send(await ccConnectManagementService.createSession({
        ...buildCcConnectManagementInput(body),
        project: params.project,
        sessionKey: body.session_key,
        ...(body.name ? { name: body.name } : {}),
      }));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/external-bridges/cc-connect/projects/:project/sessions/switch', async (request, reply) => {
    try {
      const params = request.params as { project: string };
      const body = request.body as {
        configPath?: string;
        managementBaseUrl?: string;
        managementToken?: string;
        timeoutMs?: number;
        session_key: string;
        session_id: string;
      };
      return reply.send(await ccConnectManagementService.switchSession({
        ...buildCcConnectManagementInput(body),
        project: params.project,
        sessionKey: body.session_key,
        sessionId: body.session_id,
      }));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.delete('/api/external-bridges/cc-connect/projects/:project/sessions/:sessionId', async (request, reply) => {
    try {
      const params = request.params as { project: string; sessionId: string };
      const query = request.query as {
        configPath?: string;
        managementBaseUrl?: string;
        managementToken?: string;
        timeoutMs?: string;
      };
      return reply.send(await ccConnectManagementService.deleteSession({
        ...buildCcConnectManagementInput(query),
        project: params.project,
        sessionId: params.sessionId,
      }));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.get('/api/external-bridges/cc-connect/projects/:project/providers', async (request, reply) => {
    try {
      const params = request.params as { project: string };
      const query = request.query as {
        configPath?: string;
        managementBaseUrl?: string;
        managementToken?: string;
        timeoutMs?: string;
      };
      return reply.send(await ccConnectManagementService.listProviders({
        ...buildCcConnectManagementInput(query),
        project: params.project,
      }));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/external-bridges/cc-connect/projects/:project/providers/:provider/activate', async (request, reply) => {
    try {
      const params = request.params as { project: string; provider: string };
      const body = request.body as {
        configPath?: string;
        managementBaseUrl?: string;
        managementToken?: string;
        timeoutMs?: number;
      };
      return reply.send(await ccConnectManagementService.activateProvider({
        ...buildCcConnectManagementInput(body),
        project: params.project,
        provider: params.provider,
      }));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.get('/api/external-bridges/cc-connect/projects/:project/models', async (request, reply) => {
    try {
      const params = request.params as { project: string };
      const query = request.query as {
        configPath?: string;
        managementBaseUrl?: string;
        managementToken?: string;
        timeoutMs?: string;
      };
      return reply.send(await ccConnectManagementService.listModels({
        ...buildCcConnectManagementInput(query),
        project: params.project,
      }));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/external-bridges/cc-connect/projects/:project/model', async (request, reply) => {
    try {
      const params = request.params as { project: string };
      const body = request.body as {
        configPath?: string;
        managementBaseUrl?: string;
        managementToken?: string;
        timeoutMs?: number;
        model: string;
      };
      return reply.send(await ccConnectManagementService.setModel({
        ...buildCcConnectManagementInput(body),
        project: params.project,
        model: body.model,
      }));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.get('/api/external-bridges/cc-connect/projects/:project/heartbeat', async (request, reply) => {
    try {
      const params = request.params as { project: string };
      const query = request.query as {
        configPath?: string;
        managementBaseUrl?: string;
        managementToken?: string;
        timeoutMs?: string;
      };
      return reply.send(await ccConnectManagementService.getHeartbeat({
        ...buildCcConnectManagementInput(query),
        project: params.project,
      }));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/external-bridges/cc-connect/projects/:project/heartbeat/pause', async (request, reply) => {
    try {
      const params = request.params as { project: string };
      const body = request.body as {
        configPath?: string;
        managementBaseUrl?: string;
        managementToken?: string;
        timeoutMs?: number;
      };
      return reply.send(await ccConnectManagementService.pauseHeartbeat({
        ...buildCcConnectManagementInput(body),
        project: params.project,
      }));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/external-bridges/cc-connect/projects/:project/heartbeat/resume', async (request, reply) => {
    try {
      const params = request.params as { project: string };
      const body = request.body as {
        configPath?: string;
        managementBaseUrl?: string;
        managementToken?: string;
        timeoutMs?: number;
      };
      return reply.send(await ccConnectManagementService.resumeHeartbeat({
        ...buildCcConnectManagementInput(body),
        project: params.project,
      }));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/external-bridges/cc-connect/projects/:project/heartbeat/run', async (request, reply) => {
    try {
      const params = request.params as { project: string };
      const body = request.body as {
        configPath?: string;
        managementBaseUrl?: string;
        managementToken?: string;
        timeoutMs?: number;
      };
      return reply.send(await ccConnectManagementService.runHeartbeat({
        ...buildCcConnectManagementInput(body),
        project: params.project,
      }));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/external-bridges/cc-connect/projects/:project/heartbeat/interval', async (request, reply) => {
    try {
      const params = request.params as { project: string };
      const body = request.body as {
        configPath?: string;
        managementBaseUrl?: string;
        managementToken?: string;
        timeoutMs?: number;
        minutes: number;
      };
      return reply.send(await ccConnectManagementService.updateHeartbeatInterval({
        ...buildCcConnectManagementInput(body),
        project: params.project,
        minutes: body.minutes,
      }));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.get('/api/external-bridges/cc-connect/bridges', async (request, reply) => {
    try {
      const query = request.query as {
        configPath?: string;
        managementBaseUrl?: string;
        managementToken?: string;
        timeoutMs?: string;
      };
      return reply.send(await ccConnectManagementService.listBridgeAdapters(buildCcConnectManagementInput(query)));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/external-bridges/cc-connect/projects/:project/send', async (request, reply) => {
    try {
      const params = request.params as { project: string };
      const body = request.body as {
        configPath?: string;
        managementBaseUrl?: string;
        managementToken?: string;
        timeoutMs?: number;
        session_key: string;
        message: string;
      };
      return reply.send(await ccConnectManagementService.sendMessage({
        ...buildCcConnectManagementInput(body),
        project: params.project,
        sessionKey: body.session_key,
        message: body.message,
      }));
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
        const requested = resolvePathWithinDirectory(dashboardDir, wildcard);
        if (requested && existsSync(requested) && statSync(requested).isFile()) {
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
    if (!humanAccountService?.hasAccounts() && !dashboardAuth.password) {
      return reply.status(409).send({ message: DASHBOARD_BOOTSTRAP_REQUIRED_MESSAGE });
    }
    try {
      const payload = dashboardSessionLoginRequestSchema.parse(request.body);
      if (humanAccountService?.hasAccounts()) {
        const account = humanAccountService.authenticate(payload.username, payload.password);
        if (!account) {
          return reply.status(403).send({ message: 'invalid dashboard credentials' });
        }
        const session = issueDashboardSession(account.id, account.username, account.role, dashboardAuth, dashboardSessions);
        reply.header(
          'Set-Cookie',
          `${DASHBOARD_SESSION_COOKIE}=${session.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${session.ttlHours * 60 * 60}`,
        );
        return reply.send(dashboardSessionLoginResponseSchema.parse({
          ok: true,
          username: account.username,
          method: 'session',
        }));
      }
      const allowed = dashboardAuth.allowedUsers.length === 0 || dashboardAuth.allowedUsers.includes(payload.username);
      if (!allowed || payload.password !== dashboardAuth.password) {
        return reply.status(403).send({ message: 'invalid dashboard credentials' });
      }
      const session = issueDashboardSession(null, payload.username, 'admin', dashboardAuth, dashboardSessions);
      reply.header(
        'Set-Cookie',
        `${DASHBOARD_SESSION_COOKIE}=${session.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${session.ttlHours * 60 * 60}`,
      );
      return reply.send(dashboardSessionLoginResponseSchema.parse({
        ok: true,
        username: payload.username,
        method: 'session',
      }));
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
    return reply.send(dashboardSessionLogoutResponseSchema.parse({ ok: true }));
  });

  app.get('/api/dashboard/session', async (request, reply) => {
    if (!dashboardAuth?.enabled || dashboardAuth.method !== 'session') {
      return reply.send(dashboardSessionStatusResponseSchema.parse({
        authenticated: false,
        method: dashboardAuth?.method ?? null,
      }));
    }
    const current = getDashboardSession(request, dashboardSessions);
    if (!current) {
      return reply.send(dashboardSessionStatusResponseSchema.parse({
        authenticated: false,
        method: 'session',
      }));
    }
    return reply.send(dashboardSessionStatusResponseSchema.parse({
      authenticated: true,
      method: 'session',
      account_id: current.session.account_id,
      username: current.session.username,
      role: current.session.role,
    }));
  });

  app.get('/api/dashboard/users', async (request, reply) => {
    if (!humanAccountService) {
      return reply.status(503).send({ message: 'human account service is not configured' });
    }
    const session = requireDashboardAdminSession(request, reply, dashboardSessions);
    if (!session) {
      return reply;
    }
    void session;
    return reply.send(dashboardUserListResponseSchema.parse({
      users: humanAccountService.listUsersWithIdentities(),
    }));
  });

  app.post('/api/dashboard/users', async (request, reply) => {
    if (!humanAccountService) {
      return reply.status(503).send({ message: 'human account service is not configured' });
    }
    const session = requireDashboardAdminSession(request, reply, dashboardSessions);
    if (!session) {
      return reply;
    }
    try {
      const payload = dashboardUserCreateRequestSchema.parse(request.body);
      humanAccountService.createUser({
        username: payload.username,
        password: payload.password,
        role: 'member',
      });
      return reply.send(dashboardUserListResponseSchema.parse({
        users: humanAccountService.listUsersWithIdentities(),
      }));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.patch('/api/dashboard/users/:username/disable', async (request, reply) => {
    if (!humanAccountService) {
      return reply.status(503).send({ message: 'human account service is not configured' });
    }
    const session = requireDashboardAdminSession(request, reply, dashboardSessions);
    if (!session) {
      return reply;
    }
    try {
      const params = request.params as { username: string };
      humanAccountService.disableUser(params.username);
      return reply.send(dashboardUserListResponseSchema.parse({
        users: humanAccountService.listUsersWithIdentities(),
      }));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.patch('/api/dashboard/users/:username/password', async (request, reply) => {
    if (!humanAccountService) {
      return reply.status(503).send({ message: 'human account service is not configured' });
    }
    const session = requireDashboardAdminSession(request, reply, dashboardSessions);
    if (!session) {
      return reply;
    }
    try {
      const params = request.params as { username: string };
      const payload = dashboardUserUpdatePasswordRequestSchema.parse(request.body);
      humanAccountService.setPassword(params.username, payload.password);
      return reply.send(dashboardUserListResponseSchema.parse({
        users: humanAccountService.listUsersWithIdentities(),
      }));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/dashboard/users/:username/identities', async (request, reply) => {
    if (!humanAccountService) {
      return reply.status(503).send({ message: 'human account service is not configured' });
    }
    const session = requireDashboardAdminSession(request, reply, dashboardSessions);
    if (!session) {
      return reply;
    }
    try {
      const params = request.params as { username: string };
      const payload = dashboardUserBindIdentityRequestSchema.parse(request.body);
      humanAccountService.bindIdentity({
        username: params.username,
        provider: payload.provider,
        externalUserId: payload.external_user_id,
      });
      return reply.send(dashboardUserListResponseSchema.parse({
        users: humanAccountService.listUsersWithIdentities(),
      }));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/tasks', async (request, reply) => {
    if (!taskService) {
      return reply.status(503).send({ message: 'Task service is not configured' });
    }
    try {
      const payload = createTaskRequestSchema.parse(request.body);
      const humanActor = resolveHumanActor(request, dashboardSessions, humanAccountService);
      const enriched = appendDashboardHumanImParticipantRef(payload, humanActor, humanAccountService);
      const created = taskService.createTask(enriched);
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

  app.post('/api/orchestrator/direct-create', async (request, reply) => {
    if (!orchestratorDirectCreateService) {
      return reply.status(503).send({ message: 'Task service is not configured' });
    }
    try {
      const payload = orchestratorDirectCreateRequestSchema.parse(request.body);
      const created = orchestratorDirectCreateService.createFromConversationConfirmation(payload);
      recordTaskAction(metrics, 'orchestrator_direct_create', 'success');
      emitStructuredLog(structuredLogs, {
        module: 'task',
        msg: 'task_action',
        action: 'orchestrator_direct_create',
        task_id: created.id,
        state: created.state,
        stage: created.current_stage,
        creator: created.creator,
      });
      return created;
    } catch (error) {
      const translated = translateError(error);
      recordTaskAction(metrics, 'orchestrator_direct_create', 'error');
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/projects', async (request, reply) => {
    if (!projectService) {
      return reply.status(503).send({ message: 'Project service is not configured' });
    }
    try {
      const payload = createProjectRequestSchema.parse(request.body);
      requireSupportedNomosId(payload.nomos_id);
      const project = projectService.createProject({
        ...(payload.id ? { id: payload.id } : {}),
        name: payload.name,
        summary: payload.summary,
        ...(payload.owner ? { owner: payload.owner } : {}),
        ...(payload.admins ? { admins: payload.admins } : {}),
        ...(payload.members ? { members: payload.members } : {}),
        ...(payload.default_agents ? { default_agents: payload.default_agents } : {}),
        ...(payload.metadata ? { metadata: payload.metadata } : {}),
      });
      const preparedNomos = prepareProjectNomosInstall({
        projectId: project.id,
        projectName: project.name,
        projectOwner: project.owner,
        metadata: payload.metadata ?? {},
        repoPath: payload.repo_path,
        initializeRepo: payload.initialize_repo ?? false,
      });
      projectService.updateProjectMetadata(project.id, preparedNomos.persistedMetadata);
      if (taskService) {
        new ProjectBootstrapService({
          projectService,
          taskService,
        }).createHarnessBootstrapTask({
          project_id: project.id,
          project_name: project.name,
          creator: project.owner ?? 'archon',
          repo_path: payload.repo_path,
          project_state_root: preparedNomos.installedNomos.layout.root,
          nomos_id: preparedNomos.nomosState.nomos_id,
          project_nomos_spec_path: preparedNomos.authoringDraft.specPath,
          project_nomos_draft_root: preparedNomos.authoringDraft.draftDir,
          bootstrap_prompt_path: preparedNomos.runtimePaths.bootstrap_interview_prompt_path,
          bootstrap_mode: payload.repo_path
            ? (payload.initialize_repo ? 'new_repo' : 'existing_repo')
            : 'no_repo',
        });
      }
      return reply.send(projectService.requireProject(project.id));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/projects/:projectId/context/retrieve', async (request, reply) => {
    if (!projectService || !contextRetrievalService) {
      return reply.status(503).send({ message: 'Project context retrieval is not configured' });
    }
    try {
      const params = request.params as { projectId: string };
      projectService.requireProject(params.projectId);
      const payload = projectContextRetrieveRequestSchema.parse(request.body);
      const mode = payload.task_id ? (payload.mode ?? 'task_context') : (payload.mode ?? 'lookup');
      const results = await contextRetrievalService.retrieve({
        scope: 'project_context',
        mode,
        query: payload.query,
        ...(payload.limit !== undefined ? { limit: payload.limit } : {}),
        context: {
          project_id: params.projectId,
          ...(payload.task_id ? { task_id: payload.task_id } : {}),
          ...(payload.audience ? { audience: payload.audience } : {}),
        },
        ...(payload.providers && payload.providers.length > 0 ? {
          metadata: {
            providers: payload.providers,
            ...(payload.source_ids && payload.source_ids.length > 0 ? { source_ids: payload.source_ids } : {}),
          },
        } : {}),
        ...(!payload.providers?.length && payload.source_ids?.length ? {
          metadata: {
            source_ids: payload.source_ids,
          },
        } : {}),
      });
      return reply.send(projectContextRetrieveResponseSchema.parse({
        scope: 'project_context',
        mode,
        results,
      }));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.get('/api/workspace/bootstrap', async (_request, reply) => {
    if (!workspaceBootstrapService) {
      return reply.status(503).send({ message: 'workspace bootstrap service is not configured' });
    }
    return reply.send(workspaceBootstrapStatusSchema.parse(workspaceBootstrapService.getStatus()));
  });

  app.get('/api/nomos', async (_request, reply) => {
    return reply.send({
      nomos: [{
        ...BUILT_IN_AGORA_NOMOS_PACK,
        lifecycle_modules: [...NOMOS_LIFECYCLE_MODULES],
        shim_sections: [...REPO_AGENTS_SHIM_SECTION_ORDER],
      }],
    });
  });

  app.get('/api/nomos/*', async (request, reply) => {
    const { '*': nomosId = '' } = request.params as { '*': string };
    if ((nomosId?.trim() || DEFAULT_AGORA_NOMOS_ID) !== DEFAULT_AGORA_NOMOS_ID) {
      return reply.status(404).send({ message: `Nomos ${nomosId} not found` });
    }
    const profile = buildBuiltInAgoraNomosProjectProfile('__preview__');
    return reply.send({
      id: DEFAULT_AGORA_NOMOS_ID,
      pack: profile.pack,
      repository_shim: profile.repository_shim,
      project_state: profile.project_state,
      bootstrap: profile.bootstrap,
      docs: profile.docs,
      lifecycle: profile.lifecycle,
      doctor: profile.doctor,
      seeded_assets: buildBuiltInAgoraNomosSeededAssets(),
    });
  });

  app.get('/api/projects', async (request, reply) => {
    if (!projectService) {
      return reply.status(503).send({ message: 'Project service is not configured' });
    }
    try {
      const query = request.query as { status?: string };
      return reply.send(listProjectsResponseSchema.parse({
        projects: projectService.listProjects(query.status),
      }));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.get('/api/projects/:projectId', async (request, reply) => {
    if (!projectService || !projectBrainService || !citizenService) {
      return reply.status(503).send({ message: 'Project workbench services are not configured' });
    }
    try {
      const params = request.params as { projectId: string };
      const project = projectService.getProject(params.projectId);
      if (!project) {
        return reply.status(404).send({ message: `Project ${params.projectId} not found` });
      }
      const tasks = options.taskService?.listTasks(undefined, params.projectId) ?? [];
      const todos = options.dashboardQueryService?.listTodos({ project_id: params.projectId }) ?? [];
      const recapEntries = projectService.listProjectRecaps(params.projectId);
      const knowledgeEntries = projectService.listKnowledgeEntries(params.projectId);
      const citizens = citizenService.listCitizens(params.projectId);
      const nomosState = resolveProjectNomosState(project.id, project.metadata ?? null);
      const activeTaskStates = new Set(['active', 'in_progress', 'gate_waiting', 'paused', 'blocked']);
      return reply.send({
        project,
        overview: {
          status: project.status,
          owner: project.owner,
          updated_at: project.updated_at,
          counts: {
            knowledge: knowledgeEntries.length,
            citizens: citizens.length,
            recaps: recapEntries.length,
            tasks_total: tasks.length,
            active_tasks: tasks.filter((task) => activeTaskStates.has(task.state)).length,
            review_tasks: tasks.filter((task) => task.state === 'gate_waiting').length,
            todos_total: todos.length,
            pending_todos: todos.filter((todo) => todo.status === 'pending').length,
          },
        },
        surfaces: {
          index: projectBrainService.getDocument(params.projectId, 'index'),
          timeline: projectBrainService.getDocument(params.projectId, 'timeline'),
        },
        work: {
          tasks,
          todos,
          recaps: recapEntries,
          knowledge: knowledgeEntries,
        },
        operator: {
          nomos_id: nomosState.nomos_id,
          repo_path: nomosState.repo_path,
          citizens,
        },
      });
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.get('/api/projects/:projectId/members', async (request, reply) => {
    if (!projectService) {
      return reply.status(503).send({ message: 'Project service is not configured' });
    }
    try {
      const params = request.params as { projectId: string };
      return reply.send({
        memberships: projectService.listProjectMemberships(params.projectId),
      });
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/projects/:projectId/members', async (request, reply) => {
    if (!projectService) {
      return reply.status(503).send({ message: 'Project service is not configured' });
    }
    try {
      const params = request.params as { projectId: string };
      const payload = createProjectMembershipSchema.parse(request.body);
      const humanActor = resolveHumanActor(request, dashboardSessions, humanAccountService);
      const membership = projectService.addProjectMembership({
        projectId: params.projectId,
        account_id: payload.account_id,
        role: payload.role,
        added_by_account_id: humanActor?.account_id ?? null,
      });
      return reply.send({ membership });
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.delete('/api/projects/:projectId/members/:accountId', async (request, reply) => {
    if (!projectService) {
      return reply.status(503).send({ message: 'Project service is not configured' });
    }
    try {
      const params = request.params as { projectId: string; accountId: string };
      const membership = projectService.removeProjectMembership(params.projectId, Number(params.accountId));
      return reply.send({ membership });
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.get('/api/projects/:projectId/nomos', async (request, reply) => {
    if (!projectService) {
      return reply.status(503).send({ message: 'Project service is not configured' });
    }
    try {
      const { projectId } = request.params as { projectId: string };
      const project = projectService.requireProject(projectId);
      return reply.send({
        ...resolveProjectNomosState(project.id, project.metadata ?? null),
        project_name: project.name,
      });
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.get('/api/projects/:projectId/nomos/review', async (request, reply) => {
    if (!projectService) {
      return reply.status(503).send({ message: 'Project service is not configured' });
    }
    try {
      const { projectId } = request.params as { projectId: string };
      const project = projectService.requireProject(projectId);
      return reply.send(reviewProjectNomosDraft(project.id, project.metadata ?? null));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/projects/:projectId/nomos/activate', async (request, reply) => {
    if (!projectService) {
      return reply.status(503).send({ message: 'Project service is not configured' });
    }
    try {
      const { projectId } = request.params as { projectId: string };
      const payload = (request.body as { actor?: string } | undefined) ?? {};
      if (!payload.actor?.trim()) {
        throw new Error('actor is required');
      }
      const humanActor = resolveHumanActor(request, dashboardSessions, humanAccountService);
      const project = projectService.requireProject(projectId);
      const activation = activateProjectNomosDraft(project.id, {
        metadata: project.metadata ?? null,
        actor: humanActor?.username ?? payload.actor,
        allowReviewRequired: humanActor?.source === 'dashboard',
      });
      projectService.updateProjectMetadata(project.id, activation.metadata);
      return reply.send({
        project_id: activation.project_id,
        nomos_id: activation.nomos_id,
        activation_status: activation.activation_status,
        active_root: activation.active_root,
        active_profile_path: activation.active_profile_path,
        activated_at: activation.activated_at,
        activated_by: activation.activated_by,
      });
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/projects/:projectId/nomos/install', async (request, reply) => {
    if (!projectService) {
      return reply.status(503).send({ message: 'Project service is not configured' });
    }
    try {
      const { projectId } = request.params as { projectId: string };
      const payload = (request.body as {
        repo_path?: string;
        initialize_repo?: boolean;
        force_write_repo_shim?: boolean;
        skip_bootstrap_task?: boolean;
        creator?: string;
      } | undefined) ?? {};
      const project = projectService.requireProject(projectId);
      const metadata = project.metadata ?? null;
      const effectiveRepoPath = payload.repo_path
        ?? (typeof metadata?.repo_path === 'string' ? metadata.repo_path : undefined);
      const preparedNomos = prepareProjectNomosInstall({
        projectId: project.id,
        projectName: project.name,
        projectOwner: project.owner,
        metadata: project.metadata ?? {},
        repoPath: effectiveRepoPath,
        initializeRepo: payload.initialize_repo ?? false,
        forceWriteRepoShim: payload.force_write_repo_shim ?? false,
      });
      projectService.updateProjectMetadata(project.id, preparedNomos.persistedMetadata);
      let bootstrapTaskId: string | null = null;
      if (!payload.skip_bootstrap_task && taskService) {
        const bootstrapTask = new ProjectBootstrapService({
          projectService,
          taskService,
        }).createHarnessBootstrapTask({
          project_id: project.id,
          project_name: project.name,
          creator: payload.creator ?? project.owner ?? 'archon',
          repo_path: effectiveRepoPath,
          project_state_root: preparedNomos.installedNomos.layout.root,
          nomos_id: preparedNomos.effectiveNomosState.nomos_id,
          project_nomos_spec_path: preparedNomos.authoringDraft.specPath,
          project_nomos_draft_root: preparedNomos.authoringDraft.draftDir,
          bootstrap_prompt_path: preparedNomos.effectiveRuntimePaths.bootstrap_interview_prompt_path,
          bootstrap_mode: preparedNomos.bootstrapMode,
        });
        bootstrapTaskId = bootstrapTask.id;
      }
      return reply.send({
        project_id: project.id,
        nomos: preparedNomos.installedNomos.profile.pack,
        project_state_root: preparedNomos.installedNomos.layout.root,
        repo_shim_path: preparedNomos.installedNomos.repoShimPath,
        repo_git_initialized: preparedNomos.installedNomos.repoGitInitialized,
        project_state_git_initialized: preparedNomos.installedNomos.projectStateGitInitialized,
        project_nomos_spec_path: preparedNomos.authoringDraft.specPath,
        project_nomos_draft_root: preparedNomos.authoringDraft.draftDir,
        bootstrap_task_id: bootstrapTaskId,
      });
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/projects/:projectId/nomos/export', async (request, reply) => {
    if (!projectService) {
      return reply.status(503).send({ message: 'Project service is not configured' });
    }
    try {
      const { projectId } = request.params as { projectId: string };
      const payload = (request.body as {
        output_dir: string;
        target?: 'draft' | 'active';
      } | undefined) ?? { output_dir: '' };
      const project = projectService.requireProject(projectId);
      return reply.send(exportProjectNomosPack(project.id, project.metadata ?? null, {
        outputDir: payload.output_dir,
        target: payload.target === 'active' ? 'active' : 'draft',
      }));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/nomos/bundles/export', async (request, reply) => {
    try {
      const payload = (request.body as {
        pack_id: string;
        output_dir: string;
      } | undefined) ?? { pack_id: '', output_dir: '' };
      return reply.send(exportNomosShareBundle({
        packId: payload.pack_id,
        outputDir: payload.output_dir,
      }));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/nomos/bundles/import', async (request, reply) => {
    try {
      const payload = (request.body as {
        source_dir: string;
        replace_existing?: boolean;
      } | undefined) ?? { source_dir: '' };
      return reply.send(importNomosShareBundle({
        sourceDir: payload.source_dir,
        ...(payload.replace_existing !== undefined ? { replaceExisting: payload.replace_existing } : {}),
      }));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/nomos/sources/import', async (request, reply) => {
    try {
      const payload = (request.body as {
        source_dir: string;
        replace_existing?: boolean;
      } | undefined) ?? { source_dir: '' };
      return reply.send(importNomosSource({
        sourceDir: payload.source_dir,
        ...(payload.replace_existing !== undefined ? { replaceExisting: payload.replace_existing } : {}),
      }));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/nomos/sources/register', async (request, reply) => {
    try {
      const payload = (request.body as {
        source_id: string;
        source_dir: string;
      } | undefined) ?? { source_id: '', source_dir: '' };
      return reply.send(registerNomosSource({
        sourceId: payload.source_id,
        sourceDir: payload.source_dir,
      }));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.get('/api/nomos/sources', async (_request, reply) => {
    try {
      return reply.send(listRegisteredNomosSources());
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.get('/api/nomos/sources/*', async (request, reply) => {
    try {
      const { '*': sourceId = '' } = request.params as { '*': string };
      return reply.send(inspectRegisteredNomosSource(sourceId));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/nomos/sources/sync', async (request, reply) => {
    try {
      const payload = (request.body as {
        source_id: string;
      } | undefined) ?? { source_id: '' };
      return reply.send(syncRegisteredNomosSource({
        sourceId: payload.source_id,
      }));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/projects/:projectId/nomos/publish', async (request, reply) => {
    if (!projectService) {
      return reply.status(503).send({ message: 'Project service is not configured' });
    }
    try {
      const { projectId } = request.params as { projectId: string };
      const payload = (request.body as {
        target?: 'draft' | 'active';
        published_by?: string;
        published_note?: string;
      } | undefined) ?? {};
      const project = projectService.requireProject(projectId);
      return reply.send(publishProjectNomosPack(project.id, project.metadata ?? null, {
        target: payload.target === 'active' ? 'active' : 'draft',
        ...(payload.published_by ? { publishedBy: payload.published_by } : {}),
        ...(payload.published_note ? { publishedNote: payload.published_note } : {}),
      }));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/projects/:projectId/nomos/install-pack', async (request, reply) => {
    if (!projectService) {
      return reply.status(503).send({ message: 'Project service is not configured' });
    }
    try {
      const { projectId } = request.params as { projectId: string };
      const payload = (request.body as {
        pack_dir: string;
      } | undefined) ?? { pack_dir: '' };
      const project = projectService.requireProject(projectId);
      const installed = installLocalNomosPackToProject(project.id, project.metadata ?? null, {
        packDir: payload.pack_dir,
      });
      projectService.updateProjectMetadata(project.id, installed.metadata);
      return reply.send(installed);
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/projects/:projectId/nomos/install-catalog-pack', async (request, reply) => {
    if (!projectService) {
      return reply.status(503).send({ message: 'Project service is not configured' });
    }
    try {
      const { projectId } = request.params as { projectId: string };
      const payload = (request.body as {
        pack_id: string;
      } | undefined) ?? { pack_id: '' };
      const project = projectService.requireProject(projectId);
      const installed = installCatalogNomosPackToProject(project.id, project.metadata ?? null, {
        packId: payload.pack_id,
      });
      projectService.updateProjectMetadata(project.id, installed.metadata);
      return reply.send(installed);
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/projects/:projectId/nomos/install-from-source', async (request, reply) => {
    if (!projectService) {
      return reply.status(503).send({ message: 'Project service is not configured' });
    }
    try {
      const { projectId } = request.params as { projectId: string };
      const payload = (request.body as {
        source_dir: string;
      } | undefined) ?? { source_dir: '' };
      const project = projectService.requireProject(projectId);
      const installed = installNomosFromSource(project.id, project.metadata ?? null, {
        sourceDir: payload.source_dir,
      });
      projectService.updateProjectMetadata(project.id, installed.metadata);
      return reply.send(installed);
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/projects/:projectId/nomos/install-registered-source', async (request, reply) => {
    if (!projectService) {
      return reply.status(503).send({ message: 'Project service is not configured' });
    }
    try {
      const { projectId } = request.params as { projectId: string };
      const payload = (request.body as {
        source_id: string;
      } | undefined) ?? { source_id: '' };
      const project = projectService.requireProject(projectId);
      const installed = installNomosFromRegisteredSource(project.id, project.metadata ?? null, {
        sourceId: payload.source_id,
      });
      projectService.updateProjectMetadata(project.id, installed.metadata);
      return reply.send(installed);
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.get('/api/nomos/catalog', async (_request, reply) => {
    try {
      return reply.send(listPublishedNomosCatalog());
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.get('/api/nomos/catalog/*', async (request, reply) => {
    try {
      const { '*': packId = '' } = request.params as { '*': string };
      return reply.send(inspectPublishedNomosCatalogPack(packId));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.get('/api/projects/:projectId/nomos/validate', async (request, reply) => {
    if (!projectService) {
      return reply.status(503).send({ message: 'Project service is not configured' });
    }
    try {
      const { projectId } = request.params as { projectId: string };
      const query = (request.query as { target?: 'draft' | 'active' } | undefined) ?? {};
      const project = projectService.requireProject(projectId);
      return reply.send(validateProjectNomos(project.id, project.metadata ?? null, {
        target: query.target === 'active' ? 'active' : 'draft',
      }));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.get('/api/projects/:projectId/nomos/diff', async (request, reply) => {
    if (!projectService) {
      return reply.status(503).send({ message: 'Project service is not configured' });
    }
    try {
      const { projectId } = request.params as { projectId: string };
      const query = (request.query as {
        base?: 'builtin' | 'active';
        candidate?: 'draft' | 'active';
      } | undefined) ?? {};
      const project = projectService.requireProject(projectId);
      return reply.send(diffProjectNomos(project.id, project.metadata ?? null, {
        base: query.base === 'builtin' ? 'builtin' : 'active',
        candidate: query.candidate === 'active' ? 'active' : 'draft',
      }));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.get('/api/projects/:projectId/nomos/doctor', async (request, reply) => {
    if (!projectBrainDoctorService) {
      return reply.status(503).send({ message: 'Project brain doctor service is not configured' });
    }
    try {
      const { projectId } = request.params as { projectId: string };
      const report = await projectBrainDoctorService.diagnoseProject(projectId);
      if (!projectService) {
        return reply.send(report);
      }
      const project = projectService.requireProject(projectId);
      const state = resolveProjectNomosState(projectId, project.metadata ?? null);
      const runtimePaths = resolveProjectNomosRuntimePaths(projectId, project.metadata ?? null);
      return reply.send({
        ...report,
        nomos_runtime: {
          nomos_id: state.nomos_id,
          activation_status: state.activation_status,
          bootstrap_interview_prompt_path: runtimePaths.bootstrap_interview_prompt_path,
          closeout_review_prompt_path: runtimePaths.closeout_review_prompt_path,
          doctor_project_prompt_path: runtimePaths.doctor_project_prompt_path,
        },
        nomos_provenance: {
          draft: resolveProjectNomosProvenance(projectId, project.metadata ?? null, { target: 'draft' }),
          active: resolveProjectNomosProvenance(projectId, project.metadata ?? null, { target: 'active' }),
        },
        nomos_validation: {
          draft: validateProjectNomos(projectId, project.metadata ?? null, { target: 'draft' }),
          active: validateProjectNomos(projectId, project.metadata ?? null, { target: 'active' }),
        },
        nomos_diff: diffProjectNomos(projectId, project.metadata ?? null, {
          base: state.activation_status === 'active_project' ? 'active' : 'builtin',
          candidate: 'draft',
        }),
        nomos_drift: diagnoseProjectNomosDrift(projectId, project.metadata ?? null),
      });
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/projects/:projectId/archive', async (request, reply) => {
    if (!projectService) {
      return reply.status(503).send({ message: 'Project service is not configured' });
    }
    try {
      const { projectId } = request.params as { projectId: string };
      return reply.send(projectService.archiveProject(projectId));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.delete('/api/projects/:projectId', async (request, reply) => {
    if (!projectService) {
      return reply.status(503).send({ message: 'Project service is not configured' });
    }
    try {
      const { projectId } = request.params as { projectId: string };
      projectService.deleteProject(projectId);
      return reply.send({ ok: true, project_id: projectId });
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.get('/api/tasks', async (request, reply) => {
    if (!taskService) {
      return reply.status(503).send({ message: 'Task service is not configured' });
    }
    const query = request.query as { state?: string; project_id?: string };
    return reply.send(taskService.listTasks(query.state, query.project_id));
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
      const callerId = resolveDashboardSessionUsername(request, dashboardSessions) ?? payload.caller_id;
      const task = taskService.advanceTask(params.taskId, {
        callerId,
        ...(payload.next_stage_id ? { nextStageId: payload.next_stage_id } : {}),
      });
      recordTaskAction(metrics, 'advance', 'success');
      emitStructuredLog(structuredLogs, {
        module: 'task',
        msg: 'task_action',
        action: 'advance',
        task_id: task.id,
        state: task.state,
        stage: task.current_stage,
        actor: callerId,
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
      const humanActor = resolveHumanActor(request, dashboardSessions, humanAccountService);
      if (shouldRequireHumanActor({ apiAuth, dashboardAuth, humanAccountService }) && !humanActor) {
        return reply.status(403).send({ message: 'missing authenticated human actor' });
      }
      const approverId = humanActor?.username ?? payload.approver_id;
      return reply.send(
        taskService.approveTask(params.taskId, {
          approverId,
          approverAccountId: humanActor?.account_id ?? null,
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
      const humanActor = resolveHumanActor(request, dashboardSessions, humanAccountService);
      if (shouldRequireHumanActor({ apiAuth, dashboardAuth, humanAccountService }) && !humanActor) {
        return reply.status(403).send({ message: 'missing authenticated human actor' });
      }
      const rejectorId = humanActor?.username ?? payload.rejector_id;
      return reply.send(
        taskService.rejectTask(params.taskId, {
          rejectorId,
          rejectorAccountId: humanActor?.account_id ?? null,
          reason: payload.reason,
        }),
      );
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/im/tasks/current/approve', async (request, reply) => {
    if (!taskService || !taskContextBindingService) {
      return reply.status(503).send({ message: 'Task service is not configured' });
    }
    try {
      const payload = currentImTaskApproveRequestSchema.parse(request.body);
      const binding = taskContextBindingService.findLatestBindingByRefs({
        provider: payload.provider,
        thread_ref: payload.thread_ref ?? null,
        conversation_ref: payload.conversation_ref ?? null,
      });
      if (!binding) {
        return reply.status(404).send({ message: 'task context binding not found for current IM context' });
      }
      const task = taskService.getTask(binding.task_id);
      if (!task?.current_stage) {
        return reply.status(400).send({ message: 'task has no active stage for approval' });
      }
      const stage = (task.workflow.stages ?? []).find((item) => item.id === task.current_stage);
      if (!stage?.gate?.type || (stage.gate.type !== 'approval' && stage.gate.type !== 'archon_review')) {
        return reply.status(400).send({ message: 'current stage does not accept human approval' });
      }
      const humanActor = resolveHumanActor(request, dashboardSessions, humanAccountService);
      if (shouldRequireHumanActor({ apiAuth, dashboardAuth, humanAccountService }) && !humanActor) {
        return reply.status(403).send({ message: 'missing authenticated human actor' });
      }
      const actorId = humanActor?.username ?? payload.actor_id;
      if (!actorId) {
        return reply.status(400).send({ message: 'missing actor identity for current IM approval' });
      }
      return reply.send(
        stage.gate.type === 'archon_review'
          ? taskService.archonApproveTask(binding.task_id, {
              reviewerId: actorId,
              comment: payload.comment,
            })
          : taskService.approveTask(binding.task_id, {
              approverId: actorId,
              comment: payload.comment,
            }),
      );
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/im/tasks/current/reject', async (request, reply) => {
    if (!taskService || !taskContextBindingService) {
      return reply.status(503).send({ message: 'Task service is not configured' });
    }
    try {
      const payload = currentImTaskRejectRequestSchema.parse(request.body);
      const binding = taskContextBindingService.findLatestBindingByRefs({
        provider: payload.provider,
        thread_ref: payload.thread_ref ?? null,
        conversation_ref: payload.conversation_ref ?? null,
      });
      if (!binding) {
        return reply.status(404).send({ message: 'task context binding not found for current IM context' });
      }
      const task = taskService.getTask(binding.task_id);
      if (!task?.current_stage) {
        return reply.status(400).send({ message: 'task has no active stage for rejection' });
      }
      const stage = (task.workflow.stages ?? []).find((item) => item.id === task.current_stage);
      if (!stage?.gate?.type || (stage.gate.type !== 'approval' && stage.gate.type !== 'archon_review')) {
        return reply.status(400).send({ message: 'current stage does not accept human rejection' });
      }
      const humanActor = resolveHumanActor(request, dashboardSessions, humanAccountService);
      if (shouldRequireHumanActor({ apiAuth, dashboardAuth, humanAccountService }) && !humanActor) {
        return reply.status(403).send({ message: 'missing authenticated human actor' });
      }
      const actorId = humanActor?.username ?? payload.actor_id;
      if (!actorId) {
        return reply.status(400).send({ message: 'missing actor identity for current IM rejection' });
      }
      return reply.send(
        stage.gate.type === 'archon_review'
          ? taskService.archonRejectTask(binding.task_id, {
              reviewerId: actorId,
              reason: payload.reason,
            })
          : taskService.rejectTask(binding.task_id, {
              rejectorId: actorId,
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
      const humanActor = resolveHumanActor(request, dashboardSessions, humanAccountService);
      if (shouldRequireHumanActor({ apiAuth, dashboardAuth, humanAccountService }) && !humanActor) {
        return reply.status(403).send({ message: 'missing authenticated human actor' });
      }
      const reviewerId = humanActor?.username ?? payload.reviewer_id;
      return reply.send(
        taskService.archonApproveTask(params.taskId, {
          reviewerId,
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
      const humanActor = resolveHumanActor(request, dashboardSessions, humanAccountService);
      if (shouldRequireHumanActor({ apiAuth, dashboardAuth, humanAccountService }) && !humanActor) {
        return reply.status(403).send({ message: 'missing authenticated human actor' });
      }
      const reviewerId = humanActor?.username ?? payload.reviewer_id;
      return reply.send(
        taskService.archonRejectTask(params.taskId, {
          reviewerId,
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
      const callerId = resolveDashboardSessionUsername(request, dashboardSessions) ?? payload.caller_id;
      return reply.send(
        taskService.completeSubtask(params.taskId, {
          subtaskId: payload.subtask_id,
          callerId,
          output: payload.output,
        }),
      );
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/tasks/:taskId/subtasks/:subtaskId/close', async (request, reply) => {
    if (!taskService) {
      return reply.status(503).send({ message: 'Task service is not configured' });
    }
    try {
      const params = request.params as { taskId: string; subtaskId: string };
      const payload = subtaskLifecycleRequestSchema.parse(request.body);
      const callerId = resolveDashboardSessionUsername(request, dashboardSessions) ?? payload.caller_id;
      return reply.send(
        taskService.completeSubtask(params.taskId, {
          subtaskId: params.subtaskId,
          callerId,
          output: payload.note,
        }),
      );
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/tasks/:taskId/subtasks/:subtaskId/archive', async (request, reply) => {
    if (!taskService) {
      return reply.status(503).send({ message: 'Task service is not configured' });
    }
    try {
      const params = request.params as { taskId: string; subtaskId: string };
      const payload = subtaskLifecycleRequestSchema.parse(request.body);
      const callerId = resolveDashboardSessionUsername(request, dashboardSessions) ?? payload.caller_id;
      return reply.send(
        taskService.archiveSubtask(params.taskId, {
          subtaskId: params.subtaskId,
          callerId,
          note: payload.note,
        }),
      );
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/tasks/:taskId/subtasks/:subtaskId/cancel', async (request, reply) => {
    if (!taskService) {
      return reply.status(503).send({ message: 'Task service is not configured' });
    }
    try {
      const params = request.params as { taskId: string; subtaskId: string };
      const payload = subtaskLifecycleRequestSchema.parse(request.body);
      const callerId = resolveDashboardSessionUsername(request, dashboardSessions) ?? payload.caller_id;
      return reply.send(
        taskService.cancelSubtask(params.taskId, {
          subtaskId: params.subtaskId,
          callerId,
          note: payload.note,
        }),
      );
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.get('/api/tasks/:taskId/subtasks', async (request, reply) => {
    if (!taskService) {
      return reply.status(503).send({ message: 'Task service is not configured' });
    }
    try {
      const params = request.params as { taskId: string };
      return reply.send({ subtasks: taskService.listSubtasks(params.taskId) });
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/tasks/:taskId/subtasks', async (request, reply) => {
    if (!taskService) {
      return reply.status(503).send({ message: 'Task service is not configured' });
    }
    try {
      const params = request.params as { taskId: string };
      const payload = createSubtasksRequestSchema.parse(request.body);
      return reply.send(taskService.createSubtasks(params.taskId, payload));
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

  app.post('/api/tasks/probe-stuck', async (request, reply) => {
    if (!taskService) {
      return reply.status(503).send({ message: 'Task service is not configured' });
    }
    try {
      const payload = probeInactiveTasksRequestSchema.parse(request.body);
      return reply.send(taskService.probeInactiveTasks({
        controllerAfterMs: payload.controller_after_ms,
        rosterAfterMs: payload.roster_after_ms,
        inboxAfterMs: payload.inbox_after_ms,
      }));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/runtime/diagnose', async (request, reply) => {
    if (!taskService) {
      return reply.status(503).send({ message: 'Task service is not configured' });
    }
    try {
      const payload = runtimeRecoveryRequestSchema.parse(request.body ?? {});
      const callerId = resolveDashboardSessionUsername(request, dashboardSessions) ?? payload.caller_id;
      return reply.send(runtimeDiagnosisResultSchema.parse(taskService.requestRuntimeDiagnosis(payload.task_id, {
        ...payload,
        caller_id: callerId,
      })));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/runtime/restart', async (request, reply) => {
    if (!taskService) {
      return reply.status(503).send({ message: 'Task service is not configured' });
    }
    try {
      const payload = runtimeRecoveryRequestSchema.parse(request.body ?? {});
      const callerId = resolveDashboardSessionUsername(request, dashboardSessions) ?? payload.caller_id;
      return reply.send(runtimeRecoveryActionSchema.parse(taskService.restartCitizenRuntime(payload.task_id, {
        ...payload,
        caller_id: callerId,
      })));
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
      const callerId = resolveDashboardSessionUsername(request, dashboardSessions) ?? payload.caller_id;
      const dispatchPayload = {
        ...payload,
        caller_id: callerId,
      };
      const dispatched = taskService.dispatchCraftsman(dispatchPayload);
      recordCraftsmanDispatch(metrics, dispatchPayload.adapter, 'success');
      emitStructuredLog(structuredLogs, {
        module: 'craftsman',
        msg: 'craftsman_dispatch',
        task_id: dispatchPayload.task_id,
        subtask_id: dispatchPayload.subtask_id,
        caller_id: dispatchPayload.caller_id,
        adapter: dispatchPayload.adapter,
        mode: dispatchPayload.mode,
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

  app.get('/api/craftsmen/executions/:executionId/tail', async (request, reply) => {
    if (!taskService) {
      return reply.status(503).send({ message: 'Task service is not configured' });
    }
    try {
      const params = request.params as { executionId: string };
      const query = request.query as { lines?: string };
      const lines = query.lines ? Number(query.lines) : 120;
      return reply.send(craftsmanExecutionTailResponseSchema.parse(taskService.getCraftsmanExecutionTail(params.executionId, lines)));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.get('/api/craftsmen/governance', async (_request, reply) => {
    if (!taskService) {
      return reply.status(503).send({ message: 'Task service is not configured' });
    }
    try {
      return reply.send(craftsmanGovernanceSnapshotSchema.parse(taskService.getCraftsmanGovernanceSnapshot()));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/craftsmen/observe', async (request, reply) => {
    if (!taskService) {
      return reply.status(503).send({ message: 'Task service is not configured' });
    }
    try {
      const payload = observeCraftsmanExecutionsRequestSchema.parse(request.body ?? {});
      return reply.send(
        observeCraftsmanExecutionsResponseSchema.parse(
          taskService.observeCraftsmanExecutions({
            runningAfterMs: payload.running_after_ms,
            waitingAfterMs: payload.waiting_after_ms,
          }),
        ),
      );
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/craftsmen/executions/:executionId/probe', async (request, reply) => {
    if (!taskService) {
      return reply.status(503).send({ message: 'Task service is not configured' });
    }
    try {
      const params = request.params as { executionId: string };
      const result = taskService.probeCraftsmanExecution(params.executionId);
      return reply.send({
        ok: true,
        execution_id: result.execution.execution_id,
        status: result.execution.status,
        probed: result.probed,
      });
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/craftsmen/executions/:executionId/stop', async (request, reply) => {
    if (!taskService) {
      return reply.status(503).send({ message: 'Task service is not configured' });
    }
    try {
      const params = request.params as { executionId: string };
      const payload = craftsmanStopExecutionRequestSchema.parse(request.body ?? {});
      const callerId = resolveDashboardSessionUsername(request, dashboardSessions) ?? payload.caller_id;
      return reply.send(runtimeRecoveryActionSchema.parse(taskService.stopCraftsmanExecution(params.executionId, {
        ...payload,
        caller_id: callerId,
      })));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/craftsmen/executions/:executionId/input-text', async (request, reply) => {
    if (!taskService) {
      return reply.status(503).send({ message: 'Task service is not configured' });
    }
    try {
      const params = request.params as { executionId: string };
      const payload = craftsmanExecutionSendTextRequestSchema.parse({
        execution_id: params.executionId,
        ...((request.body ?? {}) as Record<string, unknown>),
      });
      const execution = taskService.sendCraftsmanInputText(payload.execution_id, payload.text, payload.submit);
      return reply.send({ ok: true, execution_id: execution.executionId });
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/craftsmen/executions/:executionId/input-keys', async (request, reply) => {
    if (!taskService) {
      return reply.status(503).send({ message: 'Task service is not configured' });
    }
    try {
      const params = request.params as { executionId: string };
      const payload = craftsmanExecutionSendKeysRequestSchema.parse({
        execution_id: params.executionId,
        ...((request.body ?? {}) as Record<string, unknown>),
      });
      const execution = taskService.sendCraftsmanInputKeys(payload.execution_id, payload.keys);
      return reply.send({ ok: true, execution_id: execution.executionId });
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/craftsmen/executions/:executionId/submit-choice', async (request, reply) => {
    if (!taskService) {
      return reply.status(503).send({ message: 'Task service is not configured' });
    }
    try {
      const params = request.params as { executionId: string };
      const payload = craftsmanExecutionSubmitChoiceRequestSchema.parse({
        execution_id: params.executionId,
        ...((request.body ?? {}) as Record<string, unknown>),
      });
      const execution = taskService.submitCraftsmanChoice(payload.execution_id, payload.keys);
      return reply.send({ ok: true, execution_id: execution.executionId });
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
    if (!legacyRuntimeService) {
      return reply.status(503).send({ message: 'Legacy runtime transport is not configured' });
    }
    try {
      const payload = craftsmanRuntimeIdentityRequestSchema.parse(request.body);
      return reply.send({
        ok: true,
        identity: legacyRuntimeService.recordIdentity(payload.agent, {
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

  const getLegacyRuntimeStatus = async (_request: FastifyRequest, reply: FastifyReply) => {
    if (!legacyRuntimeService) {
      return reply.status(503).send({ message: 'Legacy runtime transport is not configured' });
    }
    return reply.send(legacyRuntimeService.status());
  };

  const getLegacyRuntimeDoctor = async (_request: FastifyRequest, reply: FastifyReply) => {
    if (!legacyRuntimeService) {
      return reply.status(503).send({ message: 'Legacy runtime transport is not configured' });
    }
    return reply.send(legacyRuntimeService.doctor());
  };

  app.get('/api/craftsmen/runtime/status', async (request, reply) => {
    return getLegacyRuntimeStatus(request, reply);
  });

  app.get('/api/craftsmen/runtime/doctor', async (request, reply) => {
    return getLegacyRuntimeDoctor(request, reply);
  });

  const getLegacyRuntimeTail = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!legacyRuntimeService) {
      return reply.status(503).send({ message: 'Legacy runtime transport is not configured' });
    }
    try {
      const params = request.params as { agent: string };
      const query = request.query as { lines?: string };
      const lines = query.lines ? Number(query.lines) : 40;
      if (!Number.isFinite(lines) || lines <= 0) {
        throw new Error('lines must be a positive number');
      }
      return reply.send({ output: legacyRuntimeService.tail(params.agent, lines) });
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  };

  app.get('/api/craftsmen/runtime/tail/:agent', async (request, reply) => {
    return getLegacyRuntimeTail(request, reply);
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

  app.get('/api/skills', async (_request, reply) => {
    if (!dashboardQueryService) {
      return reply.status(503).send({ message: 'Dashboard query service is not configured' });
    }
    return reply.send({
      skills: dashboardQueryService.listSkills(),
    });
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
      const job = dashboardQueryService.updateArchiveJob(parseNumericId(params.jobId, 'jobId'), payload);
      await dashboardQueryService.drainBackgroundOperations();
      return reply.send(job);
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
      const result = dashboardQueryService.ingestArchiveJobReceipts();
      await dashboardQueryService.drainBackgroundOperations();
      return reply.send(result);
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.get('/api/todos', async (request, reply) => {
    if (!dashboardQueryService) {
      return reply.status(503).send({ message: 'Dashboard query service is not configured' });
    }
    const query = request.query as { status?: string; project_id?: string };
    const filters: { status?: string; project_id?: string } = {};
    if (query.status !== undefined) {
      filters.status = query.status;
    }
    if (query.project_id !== undefined) {
      filters.project_id = query.project_id;
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

  app.get('/api/templates/:templateId/graph', async (request, reply) => {
    if (!templateAuthoringService) {
      return reply.status(503).send({ message: 'Template authoring service is not configured' });
    }
    try {
      const params = request.params as { templateId: string };
      return reply.send(templateAuthoringService.getTemplateGraph(params.templateId));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.put('/api/templates/:templateId/graph', async (request, reply) => {
    if (!templateAuthoringService) {
      return reply.status(503).send({ message: 'Template authoring service is not configured' });
    }
    try {
      const params = request.params as { templateId: string };
      const payload = updateTemplateGraphRequestSchema.parse(request.body);
      return reply.send(templateAuthoringService.updateTemplateGraph(params.templateId, payload));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/templates/:templateId/graph/validate', async (request, reply) => {
    if (!templateAuthoringService) {
      return reply.status(503).send({ message: 'Template authoring service is not configured' });
    }
    try {
      const payload = validateTemplateGraphRequestSchema.parse(request.body);
      return reply.send(templateAuthoringService.validateGraph(payload));
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

  // --- Context Binding & Notification routes ---

  app.post('/api/tasks/:id/context-binding', async (request, reply) => {
    if (!taskContextBindingService) {
      return reply.status(503).send({ message: 'Task context binding service is not configured' });
    }
    try {
      const { id } = request.params as { id: string };
      const body = createTaskContextBindingRequestSchema.parse(request.body);
      const binding = taskContextBindingService.createBinding({
        task_id: id,
        im_provider: body.im_provider,
        ...(body.conversation_ref ? { conversation_ref: body.conversation_ref } : {}),
        ...(body.thread_ref ? { thread_ref: body.thread_ref } : {}),
        ...(body.message_root_ref ? { message_root_ref: body.message_root_ref } : {}),
      });
      return reply.status(201).send(binding);
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.get('/api/tasks/:id/context-bindings', async (request, reply) => {
    if (!taskContextBindingService) {
      return reply.status(503).send({ message: 'Task context binding service is not configured' });
    }
    try {
      const { id } = request.params as { id: string };
      return reply.send(taskContextBindingService.listBindings(id));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.get('/api/tasks/:id/participant-bindings', async (request, reply) => {
    if (!taskParticipationService) {
      return reply.status(503).send({ message: 'Task participation service is not configured' });
    }
    try {
      const { id } = request.params as { id: string };
      return reply.send(taskParticipationService.listParticipants(id));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.get('/api/tasks/:id/runtime-session-bindings', async (request, reply) => {
    if (!taskParticipationService) {
      return reply.status(503).send({ message: 'Task participation service is not configured' });
    }
    try {
      const { id } = request.params as { id: string };
      return reply.send(taskParticipationService.listRuntimeSessions(id));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.get('/api/tasks/:id/notifications', async (request, reply) => {
    if (!options.db) {
      return reply.status(503).send({ message: 'Database is not configured' });
    }
    try {
      const { id } = request.params as { id: string };
      const outbox = new NotificationOutboxRepository(options.db);
      return reply.send(outbox.listByTask(id));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/conversations/ingest', async (request, reply) => {
    if (!taskConversationService) {
      return reply.status(503).send({ message: 'Task conversation service is not configured' });
    }
    try {
      const body = ingestTaskConversationEntryRequestSchema.parse(request.body);
      const result = taskInboundService
        ? taskInboundService.ingest(body)
        : { entry: taskConversationService.ingest(body), task_action_result: null };
      if (!result.entry) {
        return reply.status(202).send({ accepted: false });
      }
      return reply.status(201).send({
        ...result.entry,
        ...(result.task_action_result ? { task_action_result: result.task_action_result } : {}),
      });
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.get('/api/tasks/:id/conversation', async (request, reply) => {
    if (!taskConversationService) {
      return reply.status(503).send({ message: 'Task conversation service is not configured' });
    }
    try {
      const { id } = request.params as { id: string };
      return reply.send({ entries: taskConversationService.listByTask(id) });
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.get('/api/tasks/:id/conversation/summary', async (request, reply) => {
    if (!taskConversationService) {
      return reply.status(503).send({ message: 'Task conversation service is not configured' });
    }
    try {
      const { id } = request.params as { id: string };
      const humanActor = resolveHumanActor(request, dashboardSessions, humanAccountService);
      return reply.send(taskConversationService.getSummaryByTask(id, humanActor?.account_id ?? null));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/tasks/:id/conversation/read', async (request, reply) => {
    if (!taskConversationService) {
      return reply.status(503).send({ message: 'Task conversation service is not configured' });
    }
    try {
      const humanActor = resolveHumanActor(request, dashboardSessions, humanAccountService);
      if (!humanActor?.account_id) {
        return reply.status(401).send({ message: 'human account session is required for conversation read cursor' });
      }
      const { id } = request.params as { id: string };
      const body = taskConversationMarkReadRequestSchema.parse(request.body ?? {});
      return reply.send(taskConversationService.markRead(id, humanActor.account_id, body));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/notifications/scan', async (_request, reply) => {
    if (!notificationDispatcher) {
      return reply.status(503).send({ message: 'Notification dispatcher is not configured' });
    }
    try {
      const result = await notificationDispatcher.scan();
      return reply.send(result);
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

function resolvePathWithinDirectory(baseDir: string, relativePath: string) {
  const normalizedBaseDir = resolve(baseDir);
  const resolvedPath = resolve(normalizedBaseDir, relativePath);
  if (resolvedPath === normalizedBaseDir || resolvedPath.startsWith(`${normalizedBaseDir}${sep}`)) {
    return resolvedPath;
  }
  return null;
}
