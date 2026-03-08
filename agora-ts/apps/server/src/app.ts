import Fastify from 'fastify';
import {
  advanceTaskRequestSchema,
  createTaskRequestSchema,
  type HealthResponse,
} from '@agora-ts/contracts';
import { NotFoundError, PermissionDeniedError, type TaskService } from '@agora-ts/core';

export interface BuildAppOptions {
  taskService?: TaskService;
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

export function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({
    logger: false,
  });
  const taskService = options.taskService;

  app.get('/api/health', async (): Promise<HealthResponse> => {
    return { status: 'ok' };
  });

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

  return app;
}
