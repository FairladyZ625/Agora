import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  activateCcConnectProvider,
  addCcConnectProvider,
  createCcConnectCronPrompt,
  createCcConnectSession,
  deleteCcConnectCronJob,
  deleteCcConnectSession,
  getCcConnectHeartbeat,
  getCcConnectDetect,
  getCcConnectProject,
  getCcConnectSession,
  listCcConnectCronJobs,
  listCcConnectModels,
  listCcConnectBridges,
  listCcConnectProjects,
  listCcConnectProviders,
  listCcConnectSessions,
  pauseCcConnectHeartbeat,
  removeCcConnectProvider,
  resumeCcConnectHeartbeat,
  runCcConnectHeartbeat,
  sendCcConnectProjectMessage,
  setCcConnectModel,
  switchCcConnectSession,
  updateCcConnectHeartbeatInterval,
} from '@/lib/api';

function expectFetchCall(path: string, init: Record<string, unknown>) {
  expect(globalThis.fetch).toHaveBeenCalledWith(
    expect.stringContaining(path),
    expect.objectContaining(init),
  );
}

describe('cc-connect api client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    globalThis.fetch = vi.fn(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url.includes('/external-bridges/cc-connect/detect')) {
        return {
          ok: true,
          json: async () => ({
            binary: { command: 'cc-connect', found: true, resolvedPath: '/opt/homebrew/bin/cc-connect', version: 'v1.2.2', reason: null, error: null },
            config: { path: '/Users/test/.cc-connect/config.toml', exists: true, management: { enabled: true, port: 9820, tokenPresent: true } },
            management: {
              url: 'http://127.0.0.1:9820',
              reachable: true,
              version: 'v1.2.2-beta.5',
              projectsCount: 1,
              bridgeAdapterCount: 1,
              connectedPlatforms: ['discord'],
              reason: null,
              error: null,
            },
          }),
        };
      }
      if (url.endsWith('/external-bridges/cc-connect/projects')) {
        return {
          ok: true,
          json: async () => ([{
            name: 'agora-codex',
            agent_type: 'codex',
            platforms: ['discord'],
            sessions_count: 2,
            heartbeat_enabled: false,
          }]),
        };
      }
      if (url.includes('/external-bridges/cc-connect/projects/agora-codex/sessions/') && method === 'GET') {
        return {
          ok: true,
          json: async () => ({
            id: 'session-1',
            session_key: 'discord:thread:1',
            name: 'Main Thread',
            platform: 'discord',
            agent_type: 'codex',
            agent_session_id: 'codex-session-1',
            active: true,
            live: true,
            history_count: 1,
            created_at: '2026-04-10T00:00:00.000Z',
            updated_at: '2026-04-10T00:05:00.000Z',
            history: [{ role: 'assistant', content: 'hello', timestamp: '2026-04-10T00:05:00.000Z' }],
          }),
        };
      }
      if (url.endsWith('/external-bridges/cc-connect/projects/agora-codex/sessions')) {
        if (method === 'POST') {
          return {
            ok: true,
            json: async () => ({
              id: 'session-2',
              session_key: 'discord:thread:1',
              name: 'work',
              created_at: '2026-04-10T00:06:00.000Z',
            }),
          };
        }
        return {
          ok: true,
          json: async () => ([{
            id: 'session-1',
            session_key: 'discord:thread:1',
            name: 'Main Thread',
            platform: 'discord',
            agent_type: 'codex',
            active: true,
            live: true,
            history_count: 1,
            created_at: '2026-04-10T00:00:00.000Z',
            updated_at: '2026-04-10T00:05:00.000Z',
            user_name: 'FairladyZ',
            chat_name: 'main',
            last_message: { role: 'assistant', content: 'hello', timestamp: '2026-04-10T00:05:00.000Z' },
          }]),
        };
      }
      if (url.endsWith('/external-bridges/cc-connect/projects/agora-codex') && method === 'GET') {
        return {
          ok: true,
          json: async () => ({
            name: 'agora-codex',
            agent_type: 'codex',
            platforms: [{ type: 'discord', connected: true }],
            platform_configs: [{ type: 'discord', allow_from: '*' }],
            sessions_count: 2,
            active_session_keys: ['discord:thread:1'],
            heartbeat: { enabled: true, paused: false, interval_mins: 30, session_key: 'discord:thread:1' },
            settings: { language: 'zh-CN', admin_from: null, disabled_commands: [], quiet: false },
            work_dir: '/Users/lizeyu/Projects/Agora',
            agent_mode: 'immediate',
            mode: 'channel',
            show_context_indicator: false,
          }),
        };
      }
      if (url.endsWith('/external-bridges/cc-connect/bridges')) {
        return {
          ok: true,
          json: async () => ([{
            platform: 'discord',
            project: 'agora-codex',
            capabilities: ['reply', 'thread'],
            connected_at: '2026-04-10T00:00:00.000Z',
          }]),
        };
      }
      if (url.endsWith('/external-bridges/cc-connect/projects/agora-codex/send') && method === 'POST') {
        return {
          ok: true,
          json: async () => ({
            message: 'sent',
          }),
        };
      }
      if (url.endsWith('/external-bridges/cc-connect/projects/agora-codex/sessions/switch') && method === 'POST') {
        return {
          ok: true,
          json: async () => ({
            message: 'active session switched',
            active_session_id: 'session-2',
          }),
        };
      }
      if (url.endsWith('/external-bridges/cc-connect/projects/agora-codex/sessions/session-2') && method === 'DELETE') {
        return {
          ok: true,
          json: async () => ({
            message: 'session deleted',
          }),
        };
      }
      if (url.endsWith('/external-bridges/cc-connect/projects/agora-codex/providers')) {
        if (method === 'POST') {
          return {
            ok: true,
            json: async () => ({
              name: 'relay',
              message: 'provider added',
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            providers: [{ name: 'gac', active: true, model: 'gpt-5.4', base_url: 'https://gaccode.com/codex/v1' }],
            active_provider: 'gac',
          }),
        };
      }
      if (url.endsWith('/external-bridges/cc-connect/projects/agora-codex/providers/relay/activate') && method === 'POST') {
        return {
          ok: true,
          json: async () => ({
            active_provider: 'relay',
            message: 'provider activated',
          }),
        };
      }
      if (url.endsWith('/external-bridges/cc-connect/projects/agora-codex/providers/relay') && method === 'DELETE') {
        return {
          ok: true,
          json: async () => ({
            message: 'provider removed',
          }),
        };
      }
      if (url.endsWith('/external-bridges/cc-connect/projects/agora-codex/models')) {
        return {
          ok: true,
          json: async () => ({
            models: ['gpt-5.4', 'gpt-5.3-codex'],
            current: 'gpt-5.4',
          }),
        };
      }
      if (url.endsWith('/external-bridges/cc-connect/projects/agora-codex/model') && method === 'POST') {
        return {
          ok: true,
          json: async () => ({
            model: 'gpt-5.3-codex',
            message: 'model updated',
          }),
        };
      }
      if (url.endsWith('/external-bridges/cc-connect/projects/agora-codex/heartbeat')) {
        return {
          ok: true,
          json: async () => ({
            enabled: true,
            paused: false,
            interval_mins: 30,
            only_when_idle: true,
            session_key: 'discord:thread:1',
            silent: true,
            run_count: 4,
            error_count: 0,
            skipped_busy: 1,
            last_run: '2026-04-10T00:10:00.000Z',
            last_error: '',
          }),
        };
      }
      if (url.endsWith('/external-bridges/cc-connect/projects/agora-codex/heartbeat/pause') && method === 'POST') {
        return {
          ok: true,
          json: async () => ({ message: 'heartbeat paused' }),
        };
      }
      if (url.endsWith('/external-bridges/cc-connect/projects/agora-codex/heartbeat/resume') && method === 'POST') {
        return {
          ok: true,
          json: async () => ({ message: 'heartbeat resumed' }),
        };
      }
      if (url.endsWith('/external-bridges/cc-connect/projects/agora-codex/heartbeat/run') && method === 'POST') {
        return {
          ok: true,
          json: async () => ({ message: 'heartbeat triggered' }),
        };
      }
      if (url.endsWith('/external-bridges/cc-connect/projects/agora-codex/heartbeat/interval') && method === 'POST') {
        return {
          ok: true,
          json: async () => ({ interval_mins: 15, message: 'interval updated' }),
        };
      }
      if (url === 'http://localhost:3000/api/external-bridges/cc-connect/cron?project=agora-codex' && method === 'GET') {
        return {
          ok: true,
          json: async () => ([{
            id: 'cron-1',
            project: 'agora-codex',
            session_key: 'discord:thread:1',
            cron_expr: '0 * * * *',
            prompt: 'Summarize the latest thread state.',
            exec: null,
            work_dir: null,
            description: 'Hourly summary',
            enabled: true,
            silent: true,
            created_at: '2026-04-11T00:00:00.000Z',
            last_run: null,
            last_error: null,
          }]),
        };
      }
      if (url.endsWith('/external-bridges/cc-connect/cron') && method === 'POST') {
        return {
          ok: true,
          json: async () => ({
            id: 'cron-2',
            project: 'agora-codex',
            session_key: 'discord:thread:1',
            cron_expr: '*/30 * * * *',
            prompt: 'Ping the live session.',
            exec: null,
            description: 'Half-hour ping',
            enabled: true,
            created_at: '2026-04-11T00:30:00.000Z',
          }),
        };
      }
      if (url.endsWith('/external-bridges/cc-connect/cron/cron-2') && method === 'DELETE') {
        return {
          ok: true,
          json: async () => ({ message: 'cron deleted' }),
        };
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;
  });

  it('reads detect, projects, project detail, sessions, session detail, and bridges', async () => {
    const detect = await getCcConnectDetect();
    const projects = await listCcConnectProjects();
    const project = await getCcConnectProject('agora-codex');
    const sessions = await listCcConnectSessions('agora-codex');
    const session = await getCcConnectSession('agora-codex', 'session-1', 30);
    const bridges = await listCcConnectBridges();

    expect(detect.binary.found).toBe(true);
    expect(projects[0]?.agent_type).toBe('codex');
    expect(project.sessions_count).toBe(2);
    expect(sessions[0]?.session_key).toBe('discord:thread:1');
    expect(session.agent_session_id).toBe('codex-session-1');
    expect(bridges[0]?.platform).toBe('discord');
  });

  it('reads, creates, and deletes cron jobs', async () => {
    const jobs = await listCcConnectCronJobs('agora-codex');
    const createReceipt = await createCcConnectCronPrompt({
      project: 'agora-codex',
      session_key: 'discord:thread:1',
      cron_expr: '*/30 * * * *',
      prompt: 'Ping the live session.',
      description: 'Half-hour ping',
      silent: true,
    });
    const deleteReceipt = await deleteCcConnectCronJob('cron-2');

    expect(jobs[0]?.cron_expr).toBe('0 * * * *');
    expect(createReceipt.id).toBe('cron-2');
    expect(deleteReceipt.message).toBe('cron deleted');
    expectFetchCall('/external-bridges/cc-connect/cron?project=agora-codex', {
      method: 'GET',
    });
    expectFetchCall('/external-bridges/cc-connect/cron', {
      method: 'POST',
      body: JSON.stringify({
        project: 'agora-codex',
        session_key: 'discord:thread:1',
        cron_expr: '*/30 * * * *',
        prompt: 'Ping the live session.',
        description: 'Half-hour ping',
        silent: true,
      }),
    });
    expectFetchCall('/external-bridges/cc-connect/cron/cron-2', {
      method: 'DELETE',
    });
  });

  it('posts send payload with session key', async () => {
    const receipt = await sendCcConnectProjectMessage('agora-codex', {
      session_key: 'discord:thread:1',
      message: 'hello cc-connect',
    });

    expect(receipt.message).toBe('sent');
    expectFetchCall('/external-bridges/cc-connect/projects/agora-codex/send', {
      method: 'POST',
      body: JSON.stringify({
        session_key: 'discord:thread:1',
        message: 'hello cc-connect',
      }),
    });
  });

  it('creates, switches, and deletes sessions', async () => {
    const createReceipt = await createCcConnectSession('agora-codex', {
      session_key: 'discord:thread:1',
      name: 'work',
    });
    const switchReceipt = await switchCcConnectSession('agora-codex', {
      session_key: 'discord:thread:1',
      session_id: 'session-2',
    });
    const deleteReceipt = await deleteCcConnectSession('agora-codex', 'session-2');

    expect(createReceipt.id).toBe('session-2');
    expect(switchReceipt.active_session_id).toBe('session-2');
    expect(deleteReceipt.message).toBe('session deleted');
    expectFetchCall('/external-bridges/cc-connect/projects/agora-codex/sessions', {
      method: 'POST',
      body: JSON.stringify({
        session_key: 'discord:thread:1',
        name: 'work',
      }),
    });
    expectFetchCall('/external-bridges/cc-connect/projects/agora-codex/sessions/switch', {
      method: 'POST',
      body: JSON.stringify({
        session_key: 'discord:thread:1',
        session_id: 'session-2',
      }),
    });
    expectFetchCall('/external-bridges/cc-connect/projects/agora-codex/sessions/session-2', {
      method: 'DELETE',
    });
  });

  it('reads and controls providers, model, and heartbeat', async () => {
    const providers = await listCcConnectProviders('agora-codex');
    const addProviderReceipt = await addCcConnectProvider('agora-codex', {
      name: 'relay',
      api_key: 'sk-relay',
      base_url: 'https://relay.example.com',
      model: 'gpt-5.3-codex',
      thinking: 'disabled',
      env: {
        AWS_PROFILE: 'bedrock',
      },
    });
    const removeProviderReceipt = await removeCcConnectProvider('agora-codex', 'relay');
    const activateProviderReceipt = await activateCcConnectProvider('agora-codex', 'relay');
    const models = await listCcConnectModels('agora-codex');
    const modelReceipt = await setCcConnectModel('agora-codex', 'gpt-5.3-codex');
    const heartbeat = await getCcConnectHeartbeat('agora-codex');
    const pauseReceipt = await pauseCcConnectHeartbeat('agora-codex');
    const resumeReceipt = await resumeCcConnectHeartbeat('agora-codex');
    const runReceipt = await runCcConnectHeartbeat('agora-codex');
    const intervalReceipt = await updateCcConnectHeartbeatInterval('agora-codex', 15);

    expect(providers.active_provider).toBe('gac');
    expect(addProviderReceipt.message).toBe('provider added');
    expect(removeProviderReceipt.message).toBe('provider removed');
    expect(activateProviderReceipt.active_provider).toBe('relay');
    expect(models.current).toBe('gpt-5.4');
    expect(modelReceipt.model).toBe('gpt-5.3-codex');
    expect(heartbeat.interval_mins).toBe(30);
    expect(pauseReceipt.message).toBe('heartbeat paused');
    expect(resumeReceipt.message).toBe('heartbeat resumed');
    expect(runReceipt.message).toBe('heartbeat triggered');
    expect(intervalReceipt.interval_mins).toBe(15);
    expectFetchCall('/external-bridges/cc-connect/projects/agora-codex/providers', {
      method: 'POST',
      body: JSON.stringify({
        name: 'relay',
        api_key: 'sk-relay',
        base_url: 'https://relay.example.com',
        model: 'gpt-5.3-codex',
        thinking: 'disabled',
        env: {
          AWS_PROFILE: 'bedrock',
        },
      }),
    });
    expectFetchCall('/external-bridges/cc-connect/projects/agora-codex/providers/relay', {
      method: 'DELETE',
    });
  });
});
