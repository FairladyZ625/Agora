import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgoraDatabase, runMigrations } from '@agora-ts/db';
import { TaskService } from '@agora-ts/core';
import { buildApp } from './app.js';

const tempPaths: string[] = [];
const templatesDir = resolve(process.cwd(), '../agora/templates');

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-server-'));
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

describe('task routes', () => {
  it('creates, lists, and fetches task status from the fastify app', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-200',
    });
    const app = buildApp({ taskService });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        title: '接任务接口到 TS server',
        type: 'coding',
        creator: 'archon',
        description: 'Phase 2 route parity',
        priority: 'high',
      },
    });
    const listResponse = await app.inject({
      method: 'GET',
      url: '/api/tasks',
    });
    const statusResponse = await app.inject({
      method: 'GET',
      url: '/api/tasks/OC-200/status',
    });

    expect(createResponse.statusCode).toBe(200);
    expect(createResponse.json()).toMatchObject({
      id: 'OC-200',
      state: 'active',
      current_stage: 'discuss',
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toHaveLength(1);
    expect(statusResponse.statusCode).toBe(200);
    expect(statusResponse.json()).toMatchObject({
      task: {
        id: 'OC-200',
      },
      flow_log: expect.any(Array),
      progress_log: expect.any(Array),
      subtasks: [],
    });
  });

  it('returns 403 on advance when gate is not satisfied', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-201',
    });
    taskService.createTask({
      title: '测试 gate 拒绝',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });

    const app = buildApp({ taskService });
    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-201/advance',
      payload: {
        caller_id: 'opus',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      message: "Gate check failed for stage 'discuss' (gate type: archon_review)",
    });
  });
});
