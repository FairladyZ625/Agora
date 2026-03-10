import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgoraDatabase, runMigrations } from '@agora-ts/db';
import { HumanAccountService } from '@agora-ts/core';
import { buildApp } from './app.js';

const tempPaths: string[] = [];

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-dashboard-users-'));
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

describe('dashboard user routes', () => {
  it('lets an admin list and create dashboard users via session auth', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const humanAccountService = new HumanAccountService(db);
    humanAccountService.bootstrapAdmin({
      username: 'lizeyu',
      password: 'secret-pass',
    });

    const app = buildApp({
      humanAccountService,
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
      payload: { username: 'lizeyu', password: 'secret-pass' },
    });
    const cookie = login.headers['set-cookie'];
    const headers = {
      cookie: Array.isArray(cookie) ? cookie[0] : String(cookie),
    };

    const create = await app.inject({
      method: 'POST',
      url: '/api/dashboard/users',
      headers,
      payload: {
        username: 'alice',
        password: 'alice-pass',
      },
    });
    const bind = await app.inject({
      method: 'POST',
      url: '/api/dashboard/users/alice/identities',
      headers,
      payload: {
        provider: 'discord',
        external_user_id: 'discord-user-123',
      },
    });
    const list = await app.inject({
      method: 'GET',
      url: '/api/dashboard/users',
      headers,
    });

    expect(create.statusCode).toBe(200);
    expect(bind.statusCode).toBe(200);
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({
      users: expect.arrayContaining([
        expect.objectContaining({
          username: 'alice',
          role: 'member',
          enabled: true,
          identities: expect.arrayContaining([
            expect.objectContaining({
              provider: 'discord',
              external_user_id: 'discord-user-123',
            }),
          ]),
        }),
      ]),
    });
  });

  it('rejects dashboard user management for non-admin sessions', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const humanAccountService = new HumanAccountService(db);
    humanAccountService.bootstrapAdmin({
      username: 'lizeyu',
      password: 'secret-pass',
    });
    humanAccountService.createUser({
      username: 'alice',
      password: 'alice-pass',
      role: 'member',
    });

    const app = buildApp({
      humanAccountService,
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
      payload: { username: 'alice', password: 'alice-pass' },
    });
    const cookie = login.headers['set-cookie'];

    const list = await app.inject({
      method: 'GET',
      url: '/api/dashboard/users',
      headers: {
        cookie: Array.isArray(cookie) ? cookie[0] : String(cookie),
      },
    });

    expect(list.statusCode).toBe(403);
    expect(list.json()).toEqual({ message: 'dashboard admin role required' });
  });
});
