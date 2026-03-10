import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('dashboard session and user api client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    globalThis.fetch = vi.fn(async (input) => ({
      ok: true,
      json: async () => {
        const url = String(input);
        if (url.endsWith('/api/dashboard/session')) {
          return {
            authenticated: true,
            method: 'session',
            username: 'lizeyu',
            role: 'admin',
          };
        }
        if (url.endsWith('/api/dashboard/session/login')) {
          return {
            ok: true,
            username: 'lizeyu',
            method: 'session',
          };
        }
        if (url.endsWith('/api/dashboard/session/logout')) {
          return { ok: true };
        }
        return {
          users: [{
            username: 'alice',
            role: 'member',
            enabled: true,
            identities: [{
              provider: 'discord',
              external_user_id: 'discord-user-123',
            }],
          }],
        };
      },
    })) as unknown as typeof fetch;
  });

  it('calls dashboard session and users endpoints', async () => {
    const api = await import('@/lib/api');

    await api.getDashboardSessionStatus();
    await api.loginDashboardSession('lizeyu', 'secret-pass');
    await api.logoutDashboardSession();
    await api.listDashboardUsers();
    await api.createDashboardUser({ username: 'alice', password: 'alice-pass' });
    await api.bindDashboardUserIdentity('alice', { provider: 'discord', external_user_id: 'discord-user-123' });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/dashboard/session',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/dashboard/session/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ username: 'lizeyu', password: 'secret-pass' }),
      }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/dashboard/users',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/dashboard/users',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ username: 'alice', password: 'alice-pass' }),
      }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/dashboard/users/alice/identities',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ provider: 'discord', external_user_id: 'discord-user-123' }),
      }),
    );
  });
});
