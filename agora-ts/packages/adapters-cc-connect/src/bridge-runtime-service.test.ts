import { describe, expect, it, vi } from 'vitest';
import { CcConnectBridgeRuntimeService } from './bridge-runtime-service.js';
import type { CcConnectProjectTarget } from './config-targets.js';

function buildTarget(overrides: Partial<CcConnectProjectTarget> = {}): CcConnectProjectTarget {
  return {
    configPath: '/Users/lizeyu/.cc-connect/config-immediate.toml',
    projectName: 'agora-codex-immediate',
    agentType: 'codex',
    runtimeFlavor: 'codex',
    workDir: '/Users/lizeyu/Projects/Agora',
    primaryModel: 'gpt-5.4',
    channelProviders: ['discord'],
    management: {
      enabled: true,
      baseUrl: 'http://127.0.0.1:9821',
      token: 'mgmt-token',
    },
    bridge: {
      enabled: true,
      baseUrl: 'http://127.0.0.1:9811/bridge/ws',
      token: 'bridge-token',
      path: '/bridge/ws',
    },
    ...overrides,
  };
}

describe('CcConnectBridgeRuntimeService', () => {
  it('registers enabled bridge targets and delivers inbound messages over bridge', async () => {
    const connect = vi.fn(async () => undefined);
    const sendMessage = vi.fn(async () => undefined);
    const ping = vi.fn(async () => undefined);
    const close = vi.fn();
    const onEvent = vi.fn(() => () => undefined);
    const bindRuntimeSession = vi.fn(() => ({
      id: 'rs-1',
      participant_binding_id: 'participant-1',
      runtime_provider: 'cc-connect' as const,
      runtime_session_ref: 'agora-discord:thread-1:participant-1',
      runtime_actor_ref: 'cc-connect:agora-codex-immediate',
      continuity_ref: null,
      presence_state: 'active' as const,
      binding_reason: 'thread_bridge_dispatch',
      desired_runtime_presence: 'detached' as const,
      reconcile_stage_id: null,
      reconciled_at: null,
      last_seen_at: '2026-04-14T12:00:00.000Z',
      created_at: '2026-04-14T12:00:00.000Z',
      updated_at: '2026-04-14T12:00:00.000Z',
      closed_at: null,
    }));
    const upsert = vi.fn();

    const service = new CcConnectBridgeRuntimeService({
      targets: [buildTarget()],
      imProvisioningPort: { publishMessages: vi.fn(async () => undefined) },
      taskConversationService: { ingest: vi.fn() },
      taskContextBindingService: {
        getBindingById: vi.fn(() => null),
        getActiveBinding: vi.fn(() => null),
      },
      taskParticipationService: {
        getParticipantById: vi.fn(() => null),
        getRuntimeSessionByParticipant: vi.fn(() => null),
        bindRuntimeSession,
      },
      liveSessionStore: { get: vi.fn(() => null), upsert },
      createClient: () => ({
        connect,
        sendMessage,
        ping,
        close,
        onEvent,
      }),
      now: () => new Date('2026-04-14T12:00:00.000Z'),
      pingIntervalMs: null,
    });

    service.start();
    await service.whenReady();

    expect(connect).toHaveBeenCalledWith({
      baseUrl: 'http://127.0.0.1:9811/bridge/ws',
      token: 'bridge-token',
      path: '/bridge/ws',
      platform: 'agora-discord',
      project: 'agora-codex-immediate',
      capabilities: ['text'],
      metadata: {
        source: 'agora-ts',
        protocol_version: 1,
      },
    });

    await service.sendInboundMessage({
      task_id: 'OC-THREAD-1',
      provider: 'discord',
      thread_ref: 'thread-1',
      conversation_ref: 'forum-1',
      entry_id: 'entry-1',
      body: 'route this',
      author_ref: 'discord-user-1',
      display_name: 'Tester',
      participant_binding_id: 'participant-1',
      agent_ref: 'cc-connect:agora-codex-immediate',
    });

    expect(bindRuntimeSession).toHaveBeenCalledWith({
      participant_binding_id: 'participant-1',
      runtime_provider: 'cc-connect',
      runtime_session_ref: 'agora-discord:thread-1:participant-1',
      runtime_actor_ref: 'cc-connect:agora-codex-immediate',
      presence_state: 'active',
      binding_reason: 'thread_bridge_dispatch',
      last_seen_at: '2026-04-14T12:00:00.000Z',
    });
    expect(upsert).toHaveBeenCalledWith({
      source: 'cc-connect',
      agent_id: 'cc-connect:agora-codex-immediate',
      session_key: 'agora-discord:thread-1:participant-1',
      channel: 'discord',
      conversation_id: 'forum-1',
      thread_id: 'thread-1',
      status: 'active',
      last_event: 'thread_bridge_dispatch',
      last_event_at: '2026-04-14T12:00:00.000Z',
      metadata: {
        project: 'agora-codex-immediate',
        session_scope: 'thread_binding',
        participant_binding_id: 'participant-1',
        runtime_flavor: 'codex',
        runtime_target_ref: 'cc-connect:agora-codex-immediate',
        work_dir: '/Users/lizeyu/Projects/Agora',
      },
    });
    expect(sendMessage).toHaveBeenCalledWith({
      msg_id: 'entry-1',
      session_key: 'agora-discord:thread-1:participant-1',
      user_id: 'discord-user-1',
      user_name: 'Tester',
      content: 'route this',
      reply_ctx: 'entry-1',
      project: 'agora-codex-immediate',
      images: [],
      files: [],
      audio: null,
    });

    service.stop();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('keeps same-thread cc-connect participants isolated by target flavor and participant session key', async () => {
    const connect = vi.fn(async () => undefined);
    const sendMessage = vi.fn(async () => undefined);
    const ping = vi.fn(async () => undefined);
    const close = vi.fn();
    const onEvent = vi.fn(() => () => undefined);
    const bindRuntimeSession = vi.fn(() => null);
    const upsert = vi.fn();

    const service = new CcConnectBridgeRuntimeService({
      targets: [
        buildTarget({
          projectName: 'project-a-codex',
          agentType: 'codex',
          runtimeFlavor: 'codex',
          workDir: '/Projects/A',
        }),
        buildTarget({
          projectName: 'project-a-claude',
          agentType: 'claude',
          runtimeFlavor: 'claude-code',
          workDir: '/Projects/A',
        }),
      ],
      imProvisioningPort: { publishMessages: vi.fn(async () => undefined) },
      taskConversationService: { ingest: vi.fn() },
      taskContextBindingService: {
        getBindingById: vi.fn(() => null),
        getActiveBinding: vi.fn(() => null),
      },
      taskParticipationService: {
        getParticipantById: vi.fn(() => null),
        getRuntimeSessionByParticipant: vi.fn(() => null),
        bindRuntimeSession,
      },
      liveSessionStore: { get: vi.fn(() => null), upsert },
      createClient: () => ({
        connect,
        sendMessage,
        ping,
        close,
        onEvent,
      }),
      now: () => new Date('2026-04-14T12:00:00.000Z'),
      pingIntervalMs: null,
    });

    service.start();
    await service.whenReady();

    await service.sendInboundMessage({
      task_id: 'OC-MULTI-THREAD-1',
      provider: 'discord',
      thread_ref: 'thread-shared',
      conversation_ref: 'forum-1',
      entry_id: 'entry-codex',
      body: 'developer brief',
      author_ref: 'agora-bot',
      display_name: 'agora-bot',
      participant_binding_id: 'participant-codex',
      agent_ref: 'cc-connect:project-a-codex',
    });
    await service.sendInboundMessage({
      task_id: 'OC-MULTI-THREAD-1',
      provider: 'discord',
      thread_ref: 'thread-shared',
      conversation_ref: 'forum-1',
      entry_id: 'entry-claude',
      body: 'reviewer brief',
      author_ref: 'agora-bot',
      display_name: 'agora-bot',
      participant_binding_id: 'participant-claude',
      agent_ref: 'cc-connect:project-a-claude',
    });

    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      session_key: 'agora-discord:thread-shared:participant-codex',
      project: 'project-a-codex',
      content: 'developer brief',
    }));
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      session_key: 'agora-discord:thread-shared:participant-claude',
      project: 'project-a-claude',
      content: 'reviewer brief',
    }));
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      agent_id: 'cc-connect:project-a-codex',
      session_key: 'agora-discord:thread-shared:participant-codex',
      metadata: {
        project: 'project-a-codex',
        session_scope: 'thread_binding',
        participant_binding_id: 'participant-codex',
        runtime_flavor: 'codex',
        runtime_target_ref: 'cc-connect:project-a-codex',
        work_dir: '/Projects/A',
      },
    }));
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      agent_id: 'cc-connect:project-a-claude',
      session_key: 'agora-discord:thread-shared:participant-claude',
      metadata: {
        project: 'project-a-claude',
        session_scope: 'thread_binding',
        participant_binding_id: 'participant-claude',
        runtime_flavor: 'claude-code',
        runtime_target_ref: 'cc-connect:project-a-claude',
        work_dir: '/Projects/A',
      },
    }));

    service.stop();
  });
});
