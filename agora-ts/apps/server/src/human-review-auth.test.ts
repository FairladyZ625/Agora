import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgoraDatabase, runMigrations } from '@agora-ts/db';
import { HumanAccountService, TaskService } from '@agora-ts/core';
import { buildApp } from './app.js';

const tempPaths: string[] = [];
const templatesDir = resolve(process.cwd(), 'templates');

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-human-review-auth-'));
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

describe('human review auth', () => {
  it('allows approve and reject from a dashboard session without trusting payload actor fields', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const humanAccounts = new HumanAccountService(db);
    humanAccounts.bootstrapAdmin({
      username: 'lizeyu',
      password: 'secret-pass',
    });
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-HUMAN-SESSION',
      archonUsers: ['lizeyu'],
    });
    taskService.createTask({
      title: 'dashboard session approve',
      type: 'document',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    taskService.archonApproveTask('OC-HUMAN-SESSION', {
      reviewerId: 'lizeyu',
      comment: 'outline ok',
    });
    db.prepare('UPDATE tasks SET state = ?, current_stage = ? WHERE id = ?').run('active', 'review', 'OC-HUMAN-SESSION');
    db.prepare('INSERT INTO stage_history (task_id, stage_id) VALUES (?, ?)').run('OC-HUMAN-SESSION', 'review');
    const app = buildApp({
      taskService,
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
        username: 'lizeyu',
        password: 'secret-pass',
      },
    });
    const cookie = login.headers['set-cookie'];
    const headers = {
      cookie: Array.isArray(cookie) ? cookie[0] : String(cookie),
    };

    const approve = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-HUMAN-SESSION/approve',
      headers,
      payload: {
        approver_id: 'spoofed-approver',
        comment: 'approved by session user',
      },
    });
    const reject = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-HUMAN-SESSION/reject',
      headers,
      payload: {
        rejector_id: 'spoofed-rejector',
        reason: 'rejected by session user',
      },
    });
    expect(login.statusCode).toBe(200);
    expect(approve.statusCode).toBe(200);
    expect(reject.statusCode).toBe(200);

    const reviewStatus = taskService.getTaskStatus('OC-HUMAN-SESSION');
    expect(reviewStatus.flow_log).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: 'gate_passed', actor: 'lizeyu' }),
        expect.objectContaining({ event: 'rejected', actor: 'lizeyu' }),
      ]),
    );
  });

  it('allows archon approval from a dashboard session without trusting reviewer_id in the payload', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const humanAccounts = new HumanAccountService(db);
    humanAccounts.bootstrapAdmin({
      username: 'lizeyu',
      password: 'secret-pass',
    });
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-HUMAN-1',
      archonUsers: ['lizeyu'],
    });
    taskService.createTask({
      title: 'human review auth session',
      type: 'document',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });

    const app = buildApp({
      taskService,
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
        username: 'lizeyu',
        password: 'secret-pass',
      },
    });
    const cookie = login.headers['set-cookie'];
    const approve = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-HUMAN-1/archon-approve',
      headers: {
        cookie: Array.isArray(cookie) ? cookie[0] : String(cookie),
      },
      payload: {
        reviewer_id: 'spoofed-reviewer',
        comment: 'approved by session user',
      },
    });

    expect(login.statusCode).toBe(200);
    expect(approve.statusCode).toBe(200);
    expect(approve.json()).toMatchObject({
      id: 'OC-HUMAN-1',
      current_stage: 'write',
    });
    const status = taskService.getTaskStatus('OC-HUMAN-1');
    expect(status.flow_log).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'archon_approved',
          actor: 'lizeyu',
        }),
      ]),
    );
  });

  it('allows archon approval from a bound discord sender identity when bearer auth is present', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const humanAccounts = new HumanAccountService(db);
    humanAccounts.bootstrapAdmin({
      username: 'discord-admin',
      password: 'secret-pass',
    });
    humanAccounts.bindIdentity({
      username: 'discord-admin',
      provider: 'discord',
      externalUserId: 'discord-user-42',
    });
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-HUMAN-2',
      archonUsers: ['discord-admin'],
    });
    taskService.createTask({
      title: 'human review auth discord',
      type: 'document',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });

    const app = buildApp({
      taskService,
      humanAccountService: humanAccounts,
      apiAuth: {
        enabled: true,
        token: 'test-token',
      },
    });

    const approve = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-HUMAN-2/archon-approve',
      headers: {
        authorization: 'Bearer test-token',
        'x-agora-human-provider': 'discord',
        'x-agora-human-external-id': 'discord-user-42',
      },
      payload: {
        reviewer_id: 'spoofed-reviewer',
        comment: 'approved from discord',
      },
    });

    expect(approve.statusCode).toBe(200);
    const status = taskService.getTaskStatus('OC-HUMAN-2');
    expect(status.flow_log).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'archon_approved',
          actor: 'discord-admin',
        }),
      ]),
    );
  });

  it('rejects bare bearer-token calls for human-only approve and reject routes', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const humanAccounts = new HumanAccountService(db);
    humanAccounts.bootstrapAdmin({
      username: 'lizeyu',
      password: 'secret-pass',
    });
    const taskService = new TaskService(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-HUMAN-BEARER',
      archonUsers: ['lizeyu'],
    });
    taskService.createTask({
      title: 'bearer approve reject auth',
      type: 'document',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    taskService.archonApproveTask('OC-HUMAN-BEARER', {
      reviewerId: 'lizeyu',
      comment: 'outline ok',
    });
    db.prepare('UPDATE tasks SET state = ?, current_stage = ? WHERE id = ?').run('active', 'review', 'OC-HUMAN-BEARER');
    db.prepare('INSERT INTO stage_history (task_id, stage_id) VALUES (?, ?)').run('OC-HUMAN-BEARER', 'review');
    const app = buildApp({
      taskService,
      humanAccountService: humanAccounts,
      apiAuth: {
        enabled: true,
        token: 'test-token',
      },
    });

    const approve = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-HUMAN-BEARER/approve',
      headers: {
        authorization: 'Bearer test-token',
      },
      payload: {
        approver_id: 'spoofed-approver',
        comment: 'approved from bearer',
      },
    });
    const reject = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-HUMAN-BEARER/reject',
      headers: {
        authorization: 'Bearer test-token',
      },
      payload: {
        rejector_id: 'spoofed-rejector',
        reason: 'rejected from bearer',
      },
    });
    expect(approve.statusCode).toBe(403);
    expect(approve.json()).toEqual({ message: 'missing authenticated human actor' });
    expect(reject.statusCode).toBe(403);
    expect(reject.json()).toEqual({ message: 'missing authenticated human actor' });
  });
});
