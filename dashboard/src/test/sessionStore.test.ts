import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/lib/api';
import { useSessionStore } from '@/stores/sessionStore';

function resetSessionStore() {
  useSessionStore.setState({
    status: 'idle',
    authenticated: false,
    accountId: null,
    username: null,
    role: null,
    method: null,
    error: null,
  });
}

function authenticatedSession(overrides: Record<string, unknown> = {}) {
  return {
    authenticated: true,
    account_id: 42,
    username: 'alice',
    role: 'admin' as const,
    method: 'password',
    ...overrides,
  };
}

function unauthenticatedSession() {
  return {
    authenticated: false,
    account_id: null,
    username: null,
    role: null,
    method: null,
  };
}

describe('sessionStore', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetSessionStore();
  });

  // ── refresh ──────────────────────────────────────────────────────────

  describe('refresh', () => {
    it('transitions idle -> loading -> ready on authenticated session', async () => {
      vi.spyOn(api, 'getDashboardSessionStatus').mockResolvedValue(
        authenticatedSession(),
      );

      const promise = useSessionStore.getState().refresh();

      // loading state is set synchronously before the await
      expect(useSessionStore.getState().status).toBe('loading');

      await promise;

      const s = useSessionStore.getState();
      expect(s.status).toBe('ready');
      expect(s.authenticated).toBe(true);
      expect(s.accountId).toBe(42);
      expect(s.username).toBe('alice');
      expect(s.role).toBe('admin');
      expect(s.method).toBe('password');
      expect(s.error).toBeNull();
    });

    it('maps a member role correctly', async () => {
      vi.spyOn(api, 'getDashboardSessionStatus').mockResolvedValue(
        authenticatedSession({ role: 'member', username: 'bob', account_id: 7 }),
      );

      await useSessionStore.getState().refresh();

      const s = useSessionStore.getState();
      expect(s.role).toBe('member');
      expect(s.username).toBe('bob');
      expect(s.accountId).toBe(7);
    });

    it('maps unauthenticated session to anonymous state', async () => {
      useSessionStore.setState({ status: 'ready', authenticated: true, accountId: 1 });

      vi.spyOn(api, 'getDashboardSessionStatus').mockResolvedValue(
        unauthenticatedSession(),
      );

      await useSessionStore.getState().refresh();

      const s = useSessionStore.getState();
      expect(s.status).toBe('ready');
      expect(s.authenticated).toBe(false);
      expect(s.accountId).toBeNull();
      expect(s.username).toBeNull();
      expect(s.role).toBeNull();
      expect(s.method).toBeNull();
    });

    it('skips when status is already loading', async () => {
      useSessionStore.setState({ status: 'loading' });
      const spy = vi.spyOn(api, 'getDashboardSessionStatus');

      await useSessionStore.getState().refresh();

      expect(spy).not.toHaveBeenCalled();
    });

    it('sets error status and anonymous state on API failure', async () => {
      vi.spyOn(api, 'getDashboardSessionStatus').mockRejectedValue(
        new Error('network down'),
      );

      await useSessionStore.getState().refresh();

      const s = useSessionStore.getState();
      expect(s.status).toBe('error');
      expect(s.authenticated).toBe(false);
      expect(s.accountId).toBeNull();
      expect(s.username).toBeNull();
      expect(s.role).toBeNull();
      expect(s.method).toBeNull();
      expect(s.error).toBe('network down');
    });

    it('handles non-Error thrown values via String()', async () => {
      vi.spyOn(api, 'getDashboardSessionStatus').mockRejectedValue('raw string');

      await useSessionStore.getState().refresh();

      expect(useSessionStore.getState().status).toBe('error');
      expect(useSessionStore.getState().error).toBe('raw string');
    });

    it('clears previous error when starting a new refresh', async () => {
      useSessionStore.setState({ status: 'error', error: 'old' });
      vi.spyOn(api, 'getDashboardSessionStatus').mockResolvedValue(
        authenticatedSession(),
      );

      await useSessionStore.getState().refresh();

      expect(useSessionStore.getState().error).toBeNull();
    });

    it('coerces undefined fields to null', async () => {
      vi.spyOn(api, 'getDashboardSessionStatus').mockResolvedValue({
        authenticated: true,
        // account_id, username, role, method intentionally omitted
      });

      await useSessionStore.getState().refresh();

      const s = useSessionStore.getState();
      expect(s.accountId).toBeNull();
      expect(s.username).toBeNull();
      expect(s.role).toBeNull();
      expect(s.method).toBeNull();
    });
  });

  // ── login ────────────────────────────────────────────────────────────

  describe('login', () => {
    it('sets all fields on successful login', async () => {
      vi.spyOn(api, 'loginDashboardSession').mockResolvedValue(undefined);
      vi.spyOn(api, 'getDashboardSessionStatus').mockResolvedValue(
        authenticatedSession({ role: 'admin', account_id: 99, username: 'charlie' }),
      );

      await useSessionStore.getState().login('charlie', 's3cret');

      expect(api.loginDashboardSession).toHaveBeenCalledWith('charlie', 's3cret');
      const s = useSessionStore.getState();
      expect(s.status).toBe('ready');
      expect(s.authenticated).toBe(true);
      expect(s.accountId).toBe(99);
      expect(s.username).toBe('charlie');
      expect(s.role).toBe('admin');
      expect(s.error).toBeNull();
    });

    it('sets member role on login', async () => {
      vi.spyOn(api, 'loginDashboardSession').mockResolvedValue(undefined);
      vi.spyOn(api, 'getDashboardSessionStatus').mockResolvedValue(
        authenticatedSession({ role: 'member', account_id: 5, username: 'dave' }),
      );

      await useSessionStore.getState().login('dave', 'pw');

      expect(useSessionStore.getState().role).toBe('member');
    });

    it('sets loading status before awaiting', () => {
      let resolved = false;
      vi.spyOn(api, 'loginDashboardSession').mockImplementation(async () => {
        expect(useSessionStore.getState().status).toBe('loading');
        resolved = true;
      });
      vi.spyOn(api, 'getDashboardSessionStatus').mockResolvedValue(
        authenticatedSession(),
      );

      const promise = useSessionStore.getState().login('x', 'y');
      // The sync assertion inside the spy has already run by now
      return promise.then(() => {
        expect(resolved).toBe(true);
      });
    });

    it('sets error status and rethrows on login API failure', async () => {
      vi.spyOn(api, 'loginDashboardSession').mockRejectedValue(
        new Error('invalid credentials'),
      );

      await expect(
        useSessionStore.getState().login('bad', 'creds'),
      ).rejects.toThrow('invalid credentials');

      const s = useSessionStore.getState();
      expect(s.status).toBe('error');
      expect(s.authenticated).toBe(false);
      expect(s.error).toBe('invalid credentials');
    });

    it('sets error status and rethrows when session fetch fails after login', async () => {
      vi.spyOn(api, 'loginDashboardSession').mockResolvedValue(undefined);
      vi.spyOn(api, 'getDashboardSessionStatus').mockRejectedValue(
        new Error('session lookup failed'),
      );

      await expect(
        useSessionStore.getState().login('x', 'y'),
      ).rejects.toThrow('session lookup failed');

      const s = useSessionStore.getState();
      expect(s.status).toBe('error');
      expect(s.authenticated).toBe(false);
      expect(s.error).toBe('session lookup failed');
    });

    it('handles non-Error thrown value on login failure', async () => {
      vi.spyOn(api, 'loginDashboardSession').mockRejectedValue(503);

      await expect(
        useSessionStore.getState().login('x', 'y'),
      ).rejects.toBe(503);

      expect(useSessionStore.getState().status).toBe('error');
      expect(useSessionStore.getState().error).toBe('503');
    });

    it('clears previous error when starting login', async () => {
      useSessionStore.setState({ status: 'error', error: 'stale' });
      vi.spyOn(api, 'loginDashboardSession').mockResolvedValue(undefined);
      vi.spyOn(api, 'getDashboardSessionStatus').mockResolvedValue(
        authenticatedSession(),
      );

      await useSessionStore.getState().login('a', 'b');

      expect(useSessionStore.getState().error).toBeNull();
    });
  });

  // ── logout ───────────────────────────────────────────────────────────

  describe('logout', () => {
    it('resets to anonymous state on successful logout', async () => {
      useSessionStore.setState({
        status: 'ready',
        authenticated: true,
        accountId: 10,
        username: 'alice',
        role: 'admin',
        method: 'password',
        error: 'some error',
      });
      vi.spyOn(api, 'logoutDashboardSession').mockResolvedValue(undefined);

      await useSessionStore.getState().logout();

      expect(api.logoutDashboardSession).toHaveBeenCalled();
      const s = useSessionStore.getState();
      expect(s.status).toBe('ready');
      expect(s.authenticated).toBe(false);
      expect(s.accountId).toBeNull();
      expect(s.username).toBeNull();
      expect(s.role).toBeNull();
      expect(s.method).toBeNull();
      expect(s.error).toBeNull();
    });

    it('still resets state when logout API fails', async () => {
      useSessionStore.setState({
        status: 'ready',
        authenticated: true,
        accountId: 1,
        username: 'alice',
        role: 'admin',
        method: 'password',
      });
      vi.spyOn(api, 'logoutDashboardSession').mockRejectedValue(
        new Error('server unreachable'),
      );

      // logout re-throws but still resets state via finally
      await expect(
        useSessionStore.getState().logout(),
      ).rejects.toThrow('server unreachable');

      const s = useSessionStore.getState();
      expect(s.status).toBe('ready');
      expect(s.authenticated).toBe(false);
      expect(s.accountId).toBeNull();
      expect(s.username).toBeNull();
      expect(s.role).toBeNull();
      expect(s.method).toBeNull();
      expect(s.error).toBeNull();
    });

    it('clears error from previous state on logout', async () => {
      useSessionStore.setState({ status: 'error', error: 'old problem' });
      vi.spyOn(api, 'logoutDashboardSession').mockResolvedValue(undefined);

      await useSessionStore.getState().logout();

      expect(useSessionStore.getState().error).toBeNull();
    });
  });

  // ── clearError ───────────────────────────────────────────────────────

  describe('clearError', () => {
    it('clears error and sets status to ready when authenticated', () => {
      useSessionStore.setState({
        status: 'error',
        error: 'broken',
        authenticated: true,
      });

      useSessionStore.getState().clearError();

      const s = useSessionStore.getState();
      expect(s.error).toBeNull();
      expect(s.status).toBe('ready');
    });

    it('clears error and sets status to idle when not authenticated', () => {
      useSessionStore.setState({
        status: 'error',
        error: 'broken',
        authenticated: false,
      });

      useSessionStore.getState().clearError();

      const s = useSessionStore.getState();
      expect(s.error).toBeNull();
      expect(s.status).toBe('idle');
    });

    it('clears error and sets status to idle from initial anonymous state', () => {
      useSessionStore.setState({ status: 'error', error: 'oops', authenticated: false });

      useSessionStore.getState().clearError();

      expect(useSessionStore.getState().status).toBe('idle');
      expect(useSessionStore.getState().error).toBeNull();
    });
  });

  // ── initial state ────────────────────────────────────────────────────

  describe('initial state', () => {
    it('starts with idle anonymous defaults', () => {
      resetSessionStore();

      const s = useSessionStore.getState();
      expect(s.status).toBe('idle');
      expect(s.authenticated).toBe(false);
      expect(s.accountId).toBeNull();
      expect(s.username).toBeNull();
      expect(s.role).toBeNull();
      expect(s.method).toBeNull();
      expect(s.error).toBeNull();
    });
  });

  // ── full lifecycle ───────────────────────────────────────────────────

  describe('full lifecycle', () => {
    it('login -> refresh -> logout round-trip preserves correct state at each step', async () => {
      // login
      vi.spyOn(api, 'loginDashboardSession').mockResolvedValue(undefined);
      vi.spyOn(api, 'getDashboardSessionStatus').mockResolvedValue(
        authenticatedSession({ role: 'member', account_id: 3, username: 'eve' }),
      );

      await useSessionStore.getState().login('eve', 'pw');
      expect(useSessionStore.getState().authenticated).toBe(true);
      expect(useSessionStore.getState().role).toBe('member');

      // refresh while logged in
      vi.spyOn(api, 'getDashboardSessionStatus').mockResolvedValue(
        authenticatedSession({ role: 'admin', account_id: 3, username: 'eve' }),
      );
      await useSessionStore.getState().refresh();
      expect(useSessionStore.getState().role).toBe('admin');

      // logout
      vi.spyOn(api, 'logoutDashboardSession').mockResolvedValue(undefined);
      await useSessionStore.getState().logout();
      expect(useSessionStore.getState().authenticated).toBe(false);
      expect(useSessionStore.getState().status).toBe('ready');
    });

    it('error -> clearError -> refresh recovers from error state', async () => {
      vi.spyOn(api, 'getDashboardSessionStatus').mockRejectedValue(new Error('fail'));

      await useSessionStore.getState().refresh();
      expect(useSessionStore.getState().status).toBe('error');

      useSessionStore.getState().clearError();
      expect(useSessionStore.getState().status).toBe('idle');
      expect(useSessionStore.getState().error).toBeNull();

      vi.spyOn(api, 'getDashboardSessionStatus').mockResolvedValue(
        authenticatedSession(),
      );
      await useSessionStore.getState().refresh();
      expect(useSessionStore.getState().status).toBe('ready');
      expect(useSessionStore.getState().authenticated).toBe(true);
    });
  });
});
