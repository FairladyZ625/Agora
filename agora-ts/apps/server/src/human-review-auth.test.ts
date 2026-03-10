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
      current_stage: 'outline',
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
});
