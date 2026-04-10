import { describe, expect, it, vi } from 'vitest';
import { buildApp } from './app.js';

describe('cc-connect routes', () => {
  it('proxies detect and read surfaces through injected services', async () => {
    const ccConnectInspectionService = {
      inspect: vi.fn().mockResolvedValue({
        binary: { found: true },
        config: { exists: true },
        management: { reachable: true },
      }),
    };
    const ccConnectManagementService = {
      listProjects: vi.fn().mockResolvedValue([{ name: 'agora-codex', agent_type: 'codex' }]),
      getProject: vi.fn().mockResolvedValue({ name: 'agora-codex', sessions_count: 1 }),
      listSessions: vi.fn().mockResolvedValue([{ id: 's1', session_key: 'discord:1' }]),
      getSession: vi.fn().mockResolvedValue({ id: 's1', session_key: 'discord:1', history_count: 2 }),
      createSession: vi.fn().mockResolvedValue({ id: 's2', session_key: 'discord:1', name: 'work', created_at: '2026-04-10T00:00:00Z' }),
      switchSession: vi.fn().mockResolvedValue({ message: 'active session switched', active_session_id: 's2' }),
      deleteSession: vi.fn().mockResolvedValue({ message: 'session deleted' }),
      listBridgeAdapters: vi.fn().mockResolvedValue([{ platform: 'discord', project: 'agora-codex' }]),
      sendMessage: vi.fn().mockResolvedValue({ message: 'queued' }),
    };
    const app = buildApp({
      ccConnectInspectionService: ccConnectInspectionService as never,
      ccConnectManagementService: ccConnectManagementService as never,
    });

    const detect = await app.inject({
      method: 'GET',
      url: '/api/external-bridges/cc-connect/detect?configPath=/tmp/cc-connect.toml&timeoutMs=42',
    });
    const status = await app.inject({
      method: 'GET',
      url: '/api/external-bridges/cc-connect/status?managementBaseUrl=http://127.0.0.1:9820',
    });
    const project = await app.inject({
      method: 'GET',
      url: '/api/external-bridges/cc-connect/projects/agora-codex?managementToken=secret',
    });
    const sessions = await app.inject({
      method: 'GET',
      url: '/api/external-bridges/cc-connect/projects/agora-codex/sessions',
    });
    const session = await app.inject({
      method: 'GET',
      url: '/api/external-bridges/cc-connect/projects/agora-codex/sessions/s1?historyLimit=10',
    });
    const bridges = await app.inject({
      method: 'GET',
      url: '/api/external-bridges/cc-connect/bridges',
    });
    const createSession = await app.inject({
      method: 'POST',
      url: '/api/external-bridges/cc-connect/projects/agora-codex/sessions',
      payload: {
        session_key: 'discord:1',
        name: 'work',
      },
    });
    const switchSession = await app.inject({
      method: 'POST',
      url: '/api/external-bridges/cc-connect/projects/agora-codex/sessions/switch',
      payload: {
        session_key: 'discord:1',
        session_id: 's2',
      },
    });
    const deleteSession = await app.inject({
      method: 'DELETE',
      url: '/api/external-bridges/cc-connect/projects/agora-codex/sessions/s2?managementToken=secret',
    });
    const send = await app.inject({
      method: 'POST',
      url: '/api/external-bridges/cc-connect/projects/agora-codex/send',
      payload: {
        session_key: 'discord:1',
        message: 'hello',
        timeoutMs: 15,
      },
    });

    expect(detect.statusCode).toBe(200);
    expect(status.statusCode).toBe(200);
    expect(project.statusCode).toBe(200);
    expect(sessions.statusCode).toBe(200);
    expect(session.statusCode).toBe(200);
    expect(bridges.statusCode).toBe(200);
    expect(createSession.statusCode).toBe(200);
    expect(switchSession.statusCode).toBe(200);
    expect(deleteSession.statusCode).toBe(200);
    expect(send.statusCode).toBe(200);

    expect(ccConnectInspectionService.inspect).toHaveBeenCalledWith({
      configPath: '/tmp/cc-connect.toml',
      timeoutMs: 42,
    });
    expect(ccConnectManagementService.listProjects).toHaveBeenNthCalledWith(1, {
      managementBaseUrl: 'http://127.0.0.1:9820',
    });
    expect(ccConnectManagementService.getProject).toHaveBeenCalledWith({
      managementToken: 'secret',
      project: 'agora-codex',
    });
    expect(ccConnectManagementService.listSessions).toHaveBeenCalledWith({
      project: 'agora-codex',
    });
    expect(ccConnectManagementService.getSession).toHaveBeenCalledWith({
      project: 'agora-codex',
      sessionId: 's1',
      historyLimit: 10,
    });
    expect(ccConnectManagementService.createSession).toHaveBeenCalledWith({
      project: 'agora-codex',
      sessionKey: 'discord:1',
      name: 'work',
    });
    expect(ccConnectManagementService.switchSession).toHaveBeenCalledWith({
      project: 'agora-codex',
      sessionKey: 'discord:1',
      sessionId: 's2',
    });
    expect(ccConnectManagementService.deleteSession).toHaveBeenCalledWith({
      managementToken: 'secret',
      project: 'agora-codex',
      sessionId: 's2',
    });
    expect(ccConnectManagementService.listBridgeAdapters).toHaveBeenCalledWith({});
    expect(ccConnectManagementService.sendMessage).toHaveBeenCalledWith({
      project: 'agora-codex',
      sessionKey: 'discord:1',
      message: 'hello',
      timeoutMs: 15,
    });
  });

  it('translates cc-connect service failures with standard API error handling', async () => {
    const app = buildApp({
      ccConnectInspectionService: {
        inspect: vi.fn().mockRejectedValue(new Error('bad config')),
      } as never,
      ccConnectManagementService: {
        listProjects: vi.fn(),
      } as never,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/external-bridges/cc-connect/detect',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ message: 'bad config' });
  });
});
