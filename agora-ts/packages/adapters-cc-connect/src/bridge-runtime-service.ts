import type {
  IMProvisioningPort,
  LiveSessionStore,
  RuntimeThreadMessageInput,
  RuntimeThreadMessagePort,
  TaskConversationService,
  TaskContextBindingService,
  TaskParticipationService,
} from '@agora-ts/core';
import { buildCcConnectAgentId } from './agent-registry.js';
import { CcConnectBridgeClient } from './cc-connect-bridge-client.js';
import { CcConnectBridgeReplyRelayService } from './bridge-reply-relay.js';
import { loadCcConnectProjectTargets, type CcConnectProjectTarget } from './config-targets.js';
import { buildCcConnectThreadSessionKey } from './thread-session-service.js';

type BridgeClientLike = Pick<CcConnectBridgeClient, 'connect' | 'sendMessage' | 'ping' | 'close' | 'onEvent'>;

type BridgeRuntimeLogger = {
  warn?: (message: string, meta?: Record<string, unknown>) => void;
};

type BridgeRuntimeConnection = {
  agentRef: string;
  target: CcConnectProjectTarget;
  client: BridgeClientLike;
  relay: CcConnectBridgeReplyRelayService;
};

export interface CcConnectBridgeRuntimeServiceOptions {
  targets?: CcConnectProjectTarget[];
  env?: NodeJS.ProcessEnv;
  exists?: (path: string) => boolean;
  readFile?: (path: string, encoding: BufferEncoding) => string;
  readDir?: (path: string) => string[];
  imProvisioningPort: Pick<IMProvisioningPort, 'publishMessages'>;
  taskConversationService: Pick<TaskConversationService, 'ingest'>;
  taskContextBindingService: Pick<TaskContextBindingService, 'getBindingById' | 'getActiveBinding'>;
  taskParticipationService: Pick<TaskParticipationService, 'getParticipantById' | 'getRuntimeSessionByParticipant' | 'bindRuntimeSession'>;
  liveSessionStore?: Pick<LiveSessionStore, 'upsert'>;
  createClient?: (target: CcConnectProjectTarget) => BridgeClientLike;
  logger?: BridgeRuntimeLogger;
  now?: () => Date;
  pingIntervalMs?: number | null;
}

export class CcConnectBridgeRuntimeService implements RuntimeThreadMessagePort {
  readonly runtime_provider = 'cc-connect';

  private readonly targets: CcConnectProjectTarget[];
  private readonly createClient: (target: CcConnectProjectTarget) => BridgeClientLike;
  private readonly logger: BridgeRuntimeLogger;
  private readonly now: () => Date;
  private readonly pingIntervalMs: number | null;
  private readonly connections = new Map<string, BridgeRuntimeConnection>();
  private readonly pendingConnections = new Map<string, Promise<BridgeRuntimeConnection>>();
  private pingTimer: NodeJS.Timeout | null = null;
  private started = false;

  constructor(private readonly options: CcConnectBridgeRuntimeServiceOptions) {
    this.targets = options.targets ?? loadCcConnectProjectTargets({
      env: options.env ?? process.env,
      ...(options.exists ? { exists: options.exists } : {}),
      ...(options.readFile ? { readFile: options.readFile } : {}),
      ...(options.readDir ? { readDir: options.readDir } : {}),
    });
    this.createClient = options.createClient ?? (() => new CcConnectBridgeClient());
    this.logger = options.logger ?? {};
    this.now = options.now ?? (() => new Date());
    this.pingIntervalMs = options.pingIntervalMs ?? 30_000;
  }

  start() {
    if (this.started) {
      return;
    }
    this.started = true;
    for (const target of this.listBridgeTargets()) {
      void this.ensureConnection(buildCcConnectAgentId(target.projectName)).catch(() => undefined);
    }
    if (this.pingIntervalMs && this.pingIntervalMs > 0) {
      this.pingTimer = setInterval(() => {
        for (const connection of this.connections.values()) {
          void connection.client.ping().catch((error: unknown) => {
            this.logger.warn?.('cc-connect bridge ping failed', {
              project: connection.target.projectName,
              error: toErrorMessage(error),
            });
          });
        }
      }, this.pingIntervalMs);
      this.pingTimer.unref?.();
    }
  }

  async whenReady() {
    await Promise.allSettled(
      this.listBridgeTargets().map((target) => this.ensureConnection(buildCcConnectAgentId(target.projectName))),
    );
  }

  stop() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    for (const connection of this.connections.values()) {
      connection.relay.stop();
      connection.client.close();
    }
    this.connections.clear();
    this.pendingConnections.clear();
    this.started = false;
  }

  async sendInboundMessage(input: RuntimeThreadMessageInput): Promise<void> {
    if (!input.thread_ref) {
      return;
    }
    const connection = await this.ensureConnection(input.agent_ref);
    const sessionKey = buildCcConnectThreadSessionKey(input.provider, input.thread_ref, input.participant_binding_id);
    const observedAt = this.now().toISOString();

    this.options.taskParticipationService.bindRuntimeSession({
      participant_binding_id: input.participant_binding_id,
      runtime_provider: 'cc-connect',
      runtime_session_ref: sessionKey,
      runtime_actor_ref: input.agent_ref,
      presence_state: 'active',
      binding_reason: 'thread_bridge_dispatch',
      last_seen_at: observedAt,
    });
    this.options.liveSessionStore?.upsert({
      source: 'cc-connect',
      agent_id: input.agent_ref,
      session_key: sessionKey,
      channel: input.provider,
      conversation_id: input.conversation_ref,
      thread_id: input.thread_ref,
      status: 'active',
      last_event: 'thread_bridge_dispatch',
      last_event_at: observedAt,
      metadata: {
        project: connection.target.projectName,
      },
    });

    await connection.client.sendMessage({
      msg_id: input.entry_id,
      session_key: sessionKey,
      user_id: input.author_ref ?? 'human:unknown',
      ...(input.display_name ? { user_name: input.display_name } : {}),
      content: input.body,
      reply_ctx: input.entry_id,
      project: connection.target.projectName,
      images: [],
      files: [],
      audio: null,
    });
  }

  private listBridgeTargets() {
    return this.targets.filter((target) => Boolean(target.bridge.enabled && target.bridge.baseUrl && target.bridge.token));
  }

  private async ensureConnection(agentRef: string): Promise<BridgeRuntimeConnection> {
    const existing = this.connections.get(agentRef);
    if (existing) {
      return existing;
    }
    const pending = this.pendingConnections.get(agentRef);
    if (pending) {
      return pending;
    }

    const target = this.resolveTarget(agentRef);
    const promise = this.connectTarget(target).finally(() => {
      this.pendingConnections.delete(agentRef);
    });
    this.pendingConnections.set(agentRef, promise);
    return promise;
  }

  private async connectTarget(target: CcConnectProjectTarget): Promise<BridgeRuntimeConnection> {
    const agentRef = buildCcConnectAgentId(target.projectName);
    const client = this.createClient(target);
    const relay = new CcConnectBridgeReplyRelayService({
      bridgeClient: client,
      imProvisioningPort: this.options.imProvisioningPort,
      taskConversationService: this.options.taskConversationService,
      taskContextBindingService: this.options.taskContextBindingService,
      taskParticipationService: this.options.taskParticipationService,
      now: this.now,
    });

    try {
      await client.connect({
        baseUrl: target.bridge.baseUrl as string,
        token: target.bridge.token as string,
        path: target.bridge.path,
        platform: resolveBridgePlatform(target),
        project: target.projectName,
        capabilities: ['text'],
        metadata: {
          source: 'agora-ts',
          protocol_version: 1,
        },
      });
      relay.start();
      const connection = { agentRef, target, client, relay };
      this.connections.set(agentRef, connection);
      return connection;
    } catch (error) {
      relay.stop();
      client.close();
      this.logger.warn?.('cc-connect bridge connect failed', {
        project: target.projectName,
        baseUrl: target.bridge.baseUrl,
        error: toErrorMessage(error),
      });
      throw error;
    }
  }

  private resolveTarget(agentRef: string) {
    const target = this.listBridgeTargets().find((candidate) => buildCcConnectAgentId(candidate.projectName) === agentRef) ?? null;
    if (!target) {
      throw new Error(`no bridge-enabled cc-connect target configured for agent ${agentRef}`);
    }
    return target;
  }
}

function resolveBridgePlatform(target: CcConnectProjectTarget) {
  return `agora-${target.channelProviders[0] ?? 'discord'}`;
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
