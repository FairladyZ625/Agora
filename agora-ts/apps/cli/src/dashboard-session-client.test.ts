import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDashboardSessionClient, type DashboardSessionClientFetch } from './dashboard-session-client.js';

const tempDirs: string[] = [];

function makeSessionFilePath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-dashboard-session-'));
  tempDirs.push(dir);
  return join(dir, 'dashboard-session.json');
}

afterEach(() => {
  vi.restoreAllMocks();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('dashboard session client', () => {
  it('logs in, persists the cookie and uses it for status/logout', async () => {
    const sessionFilePath = makeSessionFilePath();
    const fetchImpl = vi.fn<DashboardSessionClientFetch>()
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ ok: true, username: 'lizeyu', method: 'session' }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'set-cookie': 'agora_dashboard_session=session-token; Path=/; HttpOnly',
          },
        },
      ))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ authenticated: true, username: 'lizeyu', method: 'session' }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      ))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ ok: true }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      ));

    const client = createDashboardSessionClient({
      apiBaseUrl: 'http://127.0.0.1:18420',
      sessionFilePath,
      fetchImpl,
    });

    await expect(client.login({ username: 'lizeyu', password: 'secret-pass' })).resolves.toMatchObject({
      ok: true,
      username: 'lizeyu',
      method: 'session',
    });
    expect(JSON.parse(readFileSync(sessionFilePath, 'utf8'))).toMatchObject({
      username: 'lizeyu',
      cookie: 'agora_dashboard_session=session-token',
    });

    await expect(client.status()).resolves.toMatchObject({
      authenticated: true,
      username: 'lizeyu',
      method: 'session',
    });
    await expect(client.logout()).resolves.toMatchObject({ ok: true });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:18420/api/dashboard/session',
      expect.objectContaining({
        headers: expect.objectContaining({
          cookie: 'agora_dashboard_session=session-token',
        }),
      }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      'http://127.0.0.1:18420/api/dashboard/session/logout',
      expect.objectContaining({
        headers: expect.objectContaining({
          cookie: 'agora_dashboard_session=session-token',
        }),
      }),
    );
  });

  it('clears a stale stored session when the server reports unauthenticated', async () => {
    const sessionFilePath = makeSessionFilePath();
    const fetchImpl = vi.fn<DashboardSessionClientFetch>()
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ ok: true, username: 'lizeyu', method: 'session' }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'set-cookie': 'agora_dashboard_session=expired-token; Path=/; HttpOnly',
          },
        },
      ))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ authenticated: false, method: 'session' }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      ));

    const client = createDashboardSessionClient({
      apiBaseUrl: 'http://127.0.0.1:18420',
      sessionFilePath,
      fetchImpl,
    });

    await client.login({ username: 'lizeyu', password: 'secret-pass' });
    await expect(client.status()).resolves.toMatchObject({
      authenticated: false,
      method: 'session',
    });
    expect(() => readFileSync(sessionFilePath, 'utf8')).toThrow();
  });
});
