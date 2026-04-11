import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAgoraDatabase, runMigrations, HumanAccountRepository, HumanIdentityBindingRepository } from '@agora-ts/db';
import { HumanAccountService } from '@agora-ts/core';
import { buildApp } from './app.js';

const tempPaths: string[] = [];

function createHumanAccountServiceFromDb(db: ReturnType<typeof createAgoraDatabase>) {
  return new HumanAccountService({
    accountRepository: new HumanAccountRepository(db),
    identityBindingRepository: new HumanIdentityBindingRepository(db),
  });
}

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
    const humanAccountService = createHumanAccountServiceFromDb(db);
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
    const humanAccountService = createHumanAccountServiceFromDb(db);
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

  it('records dashboard human-management metrics and structured logs', async () => {
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const humanAccountService = createHumanAccountServiceFromDb(db);
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
      observability: {
        metricsEnabled: true,
        structuredLogs: true,
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
    const setPassword = await app.inject({
      method: 'PATCH',
      url: '/api/dashboard/users/alice/password',
      headers,
      payload: {
        password: 'alice-pass-2',
      },
    });
    const disable = await app.inject({
      method: 'PATCH',
      url: '/api/dashboard/users/alice/disable',
      headers,
    });
    const logout = await app.inject({
      method: 'POST',
      url: '/api/dashboard/session/logout',
      headers,
    });
    const metrics = await app.inject({
      method: 'GET',
      url: '/metrics',
    });

    expect(create.statusCode).toBe(200);
    expect(bind.statusCode).toBe(200);
    expect(setPassword.statusCode).toBe(200);
    expect(disable.statusCode).toBe(200);
    expect(logout.statusCode).toBe(200);
    expect(metrics.statusCode).toBe(200);
    expect(metrics.body).toContain('agora_dashboard_human_actions_total{action="dashboard-session-login",result="success"} 1');
    expect(metrics.body).toContain('agora_dashboard_human_actions_total{action="dashboard-user-create",result="success"} 1');
    expect(metrics.body).toContain('agora_dashboard_human_actions_total{action="dashboard-user-bind-identity",result="success"} 1');
    expect(metrics.body).toContain('agora_dashboard_human_actions_total{action="dashboard-user-password",result="success"} 1');
    expect(metrics.body).toContain('agora_dashboard_human_actions_total{action="dashboard-user-disable",result="success"} 1');
    expect(metrics.body).toContain('agora_dashboard_human_actions_total{action="dashboard-session-logout",result="success"} 1');

    const parsedLogs = logSpy.mock.calls.map((call: unknown[]) => JSON.parse(String(call[0])));
    expect(parsedLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          module: 'dashboard_auth',
          msg: 'human_action',
          action: 'dashboard-session-login',
          result: 'success',
          actor: 'lizeyu',
        }),
        expect.objectContaining({
          module: 'dashboard_auth',
          msg: 'human_action',
          action: 'dashboard-user-create',
          result: 'success',
          actor: 'lizeyu',
          target_username: 'alice',
        }),
        expect.objectContaining({
          module: 'dashboard_auth',
          msg: 'human_action',
          action: 'dashboard-user-bind-identity',
          result: 'success',
          actor: 'lizeyu',
          target_username: 'alice',
          provider: 'discord',
        }),
        expect.objectContaining({
          module: 'dashboard_auth',
          msg: 'human_action',
          action: 'dashboard-user-password',
          result: 'success',
          actor: 'lizeyu',
          target_username: 'alice',
        }),
        expect.objectContaining({
          module: 'dashboard_auth',
          msg: 'human_action',
          action: 'dashboard-user-disable',
          result: 'success',
          actor: 'lizeyu',
          target_username: 'alice',
        }),
        expect.objectContaining({
          module: 'dashboard_auth',
          msg: 'human_action',
          action: 'dashboard-session-logout',
          result: 'success',
          actor: 'lizeyu',
        }),
      ]),
    );
    logSpy.mockRestore();
  });
});
