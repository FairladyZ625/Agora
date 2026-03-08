import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import Fastify, { type FastifyReply } from 'fastify';
import {
  approveTaskRequestSchema,
  advanceTaskRequestSchema,
  archonApproveTaskRequestSchema,
  archonRejectTaskRequestSchema,
  cleanupTasksRequestSchema,
  confirmTaskRequestSchema,
  createTodoRequestSchema,
  createInboxRequestSchema,
  createTaskRequestSchema,
  duplicateTemplateRequestSchema,
  type HealthResponse,
  liveSessionSchema,
  promoteTodoRequestSchema,
  promoteInboxRequestSchema,
  rejectTaskRequestSchema,
  saveTemplateRequestSchema,
  subtaskDoneRequestSchema,
  taskNoteRequestSchema,
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
  type TemplateAuthoringService,
} from '@agora-ts/core';

export interface BuildAppOptions {
  taskService?: TaskService;
  dashboardQueryService?: DashboardQueryService;
  inboxService?: InboxService;
  templateAuthoringService?: TemplateAuthoringService;
  liveSessionStore?: LiveSessionStore;
  apiAuth?: {
    enabled: boolean;
    token: string;
  };
  dashboardDir?: string;
}

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

export function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({
    logger: false,
  });
  const taskService = options.taskService;
  const dashboardQueryService = options.dashboardQueryService;
  const inboxService = options.inboxService;
  const templateAuthoringService = options.templateAuthoringService;
  const liveSessionStore = options.liveSessionStore;
  const apiAuth = options.apiAuth;
  const dashboardDir = options.dashboardDir;

  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/') || request.url === '/api/health') {
      return;
    }
    if (!apiAuth?.enabled) {
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

  app.get('/api/health', async (): Promise<HealthResponse> => {
    return { status: 'ok' };
  });

  app.get('/api/live/openclaw/sessions', async (request, reply) => {
    if (!liveSessionStore) {
      return reply.status(503).send({ message: 'Live session store is not configured' });
    }
    return reply.send(liveSessionStore.listAll());
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
      return sendDashboardShell(reply, dashboardDir);
    });
    app.get('/dashboard/', async (request, reply) => {
      return sendDashboardShell(reply, dashboardDir);
    });
    app.get('/dashboard/*', async (request, reply) => {
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

  app.post('/api/tasks', async (request, reply) => {
    if (!taskService) {
      return reply.status(503).send({ message: 'Task service is not configured' });
    }
    try {
      const payload = createTaskRequestSchema.parse(request.body);
      return taskService.createTask(payload);
    } catch (error) {
      const translated = translateError(error);
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
      return reply.send(
        taskService.advanceTask(params.taskId, {
          callerId: payload.caller_id,
        }),
      );
    } catch (error) {
      const translated = translateError(error);
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
      return reply.send(taskService.pauseTask(params.taskId, { reason: payload.reason }));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/tasks/:taskId/resume', async (request, reply) => {
    if (!taskService) {
      return reply.status(503).send({ message: 'Task service is not configured' });
    }
    try {
      const params = request.params as { taskId: string };
      return reply.send(taskService.resumeTask(params.taskId));
    } catch (error) {
      const translated = translateError(error);
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
      return reply.send(taskService.cancelTask(params.taskId, { reason: payload.reason }));
    } catch (error) {
      const translated = translateError(error);
      return reply.status(translated.statusCode).send(translated.body);
    }
  });

  app.post('/api/tasks/:taskId/unblock', async (request, reply) => {
    if (!taskService) {
      return reply.status(503).send({ message: 'Task service is not configured' });
    }
    try {
      const params = request.params as { taskId: string };
      const payload = taskNoteRequestSchema.parse(request.body);
      return reply.send(taskService.unblockTask(params.taskId, { reason: payload.reason }));
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
