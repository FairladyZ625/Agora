import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgoraDatabase, runMigrations, SubtaskRepository, TaskRepository } from '@agora-ts/db';
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

  it('serves task action routes for archon approve, subtask done, force advance, and approve', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-202',
    });
    const subtasks = new SubtaskRepository(db);

    taskService.createTask({
      title: '补 task action routes',
      type: 'document',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });

    const app = buildApp({ taskService });

    const archonApprove = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-202/archon-approve',
      payload: {
        reviewer_id: 'lizeyu',
        comment: 'outline ok',
      },
    });
    const forceAdvance = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-202/force-advance',
      payload: {
        reason: 'move to write',
      },
    });

    subtasks.insertSubtask({
      id: 'write-202',
      task_id: 'OC-202',
      stage_id: 'write',
      title: '写正文',
      assignee: 'glm5',
    });

    const subtaskDone = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-202/subtask-done',
      payload: {
        subtask_id: 'write-202',
        caller_id: 'glm5',
        output: 'done',
      },
    });
    const advance = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-202/advance',
      payload: {
        caller_id: 'archon',
      },
    });
    const approve = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-202/approve',
      payload: {
        approver_id: 'gpt52',
        comment: 'looks good',
      },
    });

    expect(archonApprove.statusCode).toBe(200);
    expect(forceAdvance.statusCode).toBe(200);
    expect(subtaskDone.statusCode).toBe(200);
    expect(advance.statusCode).toBe(200);
    expect(approve.statusCode).toBe(200);
    expect(approve.json()).toMatchObject({
      id: 'OC-202',
      current_stage: 'review',
    });
  });

  it('serves confirm and state transition routes', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-203',
    });
    const tasks = new TaskRepository(db);

    tasks.insertTask({
      id: 'OC-203',
      title: '确认与状态切换',
      description: '',
      type: 'custom',
      priority: 'normal',
      creator: 'archon',
      team: {
        members: [
          { role: 'architect', agentId: 'opus', model_preference: 'reasoning' },
          { role: 'reviewer', agentId: 'gpt52', model_preference: 'review' },
        ],
      },
      workflow: {
        type: 'vote',
        stages: [{ id: 'vote', gate: { type: 'quorum', required: 2 } }],
      },
    });
    tasks.updateTask('OC-203', 1, { state: 'created' });
    tasks.updateTask('OC-203', 2, { state: 'active', current_stage: 'vote' });
    db.prepare('INSERT INTO stage_history (task_id, stage_id) VALUES (?, ?)').run('OC-203', 'vote');

    const app = buildApp({ taskService });

    const confirmOne = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-203/confirm',
      payload: {
        voter_id: 'opus',
        vote: 'approve',
        comment: 'one',
      },
    });
    const confirmTwo = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-203/confirm',
      payload: {
        voter_id: 'gpt52',
        vote: 'approve',
        comment: 'two',
      },
    });
    const pause = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-203/pause',
      payload: {
        reason: 'hold',
      },
    });
    const resume = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-203/resume',
    });
    const cancel = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-203/cancel',
      payload: {
        reason: 'closed',
      },
    });

    expect(confirmOne.statusCode).toBe(200);
    expect(confirmOne.json().quorum).toMatchObject({ approved: 1, total: 1 });
    expect(confirmTwo.statusCode).toBe(200);
    expect(confirmTwo.json().quorum).toMatchObject({ approved: 2, total: 2 });
    expect(pause.statusCode).toBe(200);
    expect(pause.json()).toMatchObject({ state: 'paused' });
    expect(resume.statusCode).toBe(200);
    expect(resume.json()).toMatchObject({ state: 'active' });
    expect(cancel.statusCode).toBe(200);
    expect(cancel.json()).toMatchObject({ state: 'cancelled' });
  });
});
