import type { LiveSessionDto } from '@agora-ts/contracts';
import { existsSync, readFileSync } from 'node:fs';
import { loadCcConnectProjectTargets, type CcConnectProjectTarget } from './config-targets.js';
import { buildCcConnectAgentId } from './agent-registry.js';

export type MirroredLiveSessionDto = LiveSessionDto;

export interface CcConnectSessionSummary {
  id: string;
  session_key: string;
  platform: string;
  active: boolean;
  live: boolean;
  created_at: string | null;
  updated_at: string | null;
  chat_name: string | null;
  user_name: string | null;
}

export interface CcConnectSessionListInput {
  configPath?: string;
  managementBaseUrl?: string;
  managementToken?: string;
  project: string;
}

type ManagementReader = {
  listSessions(input: CcConnectSessionListInput): Promise<CcConnectSessionSummary[]>;
};

type MirrorDependencies = {
  env?: NodeJS.ProcessEnv;
  exists?: (path: string) => boolean;
  readFile?: (path: string, encoding: BufferEncoding) => string;
  managementService: ManagementReader;
  now?: () => Date;
  logger?: {
    warn?: (message: string, meta?: Record<string, unknown>) => void;
  };
};

export interface CcConnectSessionMirrorServiceOptions extends MirrorDependencies {
  targets?: CcConnectProjectTarget[];
  liveSessionStore: {
    upsert(session: MirroredLiveSessionDto): unknown;
    end(sessionKey: string, endedAt: string, event?: string): MirroredLiveSessionDto | null;
  };
  onSessionSync?: (session: MirroredLiveSessionDto) => unknown;
  autoStart?: boolean;
  pollIntervalMs?: number;
}

export class CcConnectSessionMirrorService {
  private readonly targets: CcConnectProjectTarget[];
  private readonly managementService: ManagementReader;
  private readonly liveSessionStore: CcConnectSessionMirrorServiceOptions['liveSessionStore'];
  private readonly onSessionSync: ((session: MirroredLiveSessionDto) => unknown) | undefined;
  private readonly now: () => Date;
  private readonly pollIntervalMs: number;
  private readonly logger: NonNullable<MirrorDependencies['logger']>;
  private readonly mirroredSessionKeys = new Set<string>();
  private interval: NodeJS.Timeout | null = null;
  private refreshPromise: Promise<void> | null = null;

  constructor(options: CcConnectSessionMirrorServiceOptions) {
    this.targets = options.targets ?? loadCcConnectProjectTargets({
      env: options.env ?? process.env,
      exists: options.exists ?? existsSync,
      readFile: options.readFile ?? readFileSync,
    });
    this.managementService = options.managementService;
    this.liveSessionStore = options.liveSessionStore;
    this.onSessionSync = options.onSessionSync;
    this.now = options.now ?? (() => new Date());
    this.pollIntervalMs = options.pollIntervalMs ?? 30_000;
    this.logger = options.logger ?? {};

    if (options.autoStart !== false) {
      this.start();
    }
  }

  start() {
    if (this.interval) {
      return;
    }
    void this.refreshNow().catch((error) => {
      this.logger.warn?.('[agora] cc-connect session mirror refresh failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
    this.interval = setInterval(() => {
      void this.refreshNow().catch((error) => {
        this.logger.warn?.('[agora] cc-connect session mirror refresh failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, this.pollIntervalMs);
    this.interval.unref?.();
  }

  stop() {
    if (!this.interval) {
      return;
    }
    clearInterval(this.interval);
    this.interval = null;
  }

  async refreshNow() {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }
    this.refreshPromise = this.performRefresh().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  private async performRefresh() {
    const seenSessionKeys = new Set<string>();

    for (const target of this.targets) {
      if (!target.management.enabled || !target.management.baseUrl || !target.management.token) {
        continue;
      }
      let sessions: CcConnectSessionSummary[] = [];
      try {
        sessions = await this.managementService.listSessions({
          configPath: target.configPath,
          managementBaseUrl: target.management.baseUrl,
          managementToken: target.management.token,
          project: target.projectName,
        });
      } catch (error) {
        this.logger.warn?.('[agora] cc-connect session mirror poll failed', {
          project: target.projectName,
          baseUrl: target.management.baseUrl,
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }

      for (const session of sessions) {
        const mirrored = toLiveSession(target, session, this.now().toISOString());
        seenSessionKeys.add(mirrored.session_key);
        this.mirroredSessionKeys.add(mirrored.session_key);
        this.liveSessionStore.upsert(mirrored);
        this.onSessionSync?.(mirrored);
      }
    }

    for (const mirroredKey of Array.from(this.mirroredSessionKeys)) {
      if (seenSessionKeys.has(mirroredKey)) {
        continue;
      }
      const ended = this.liveSessionStore.end(mirroredKey, this.now().toISOString(), 'cc_connect_session_missing');
      if (ended) {
        this.onSessionSync?.(ended);
      }
      this.mirroredSessionKeys.delete(mirroredKey);
    }
  }
}

function toLiveSession(
  target: CcConnectProjectTarget,
  session: CcConnectSessionSummary,
  nowIso: string,
): MirroredLiveSessionDto {
  const rawRef = extractPlatformRef(session.session_key, session.platform);
  const sessionStatus = session.live || session.active ? 'active' : 'idle';
  return {
    source: 'cc-connect',
    agent_id: buildCcConnectAgentId(target.projectName),
    session_key: buildMirroredSessionKey(target.projectName, session.session_key),
    channel: session.platform,
    account_id: null,
    conversation_id: rawRef,
    thread_id: rawRef,
    status: sessionStatus,
    last_event: sessionStatus === 'active' ? 'cc_connect_session_active' : 'cc_connect_session_idle',
    last_event_at: session.updated_at ?? session.created_at ?? nowIso,
    metadata: {
      project: target.projectName,
      session_scope: 'legacy_channel',
      runtime_target_ref: buildCcConnectAgentId(target.projectName),
      ...(target.runtimeFlavor ? { runtime_flavor: target.runtimeFlavor } : {}),
      ...(target.workDir ? { work_dir: target.workDir } : {}),
      raw_session_key: session.session_key,
      session_id: session.id,
      ...(session.chat_name ? { chat_name: session.chat_name } : {}),
      ...(session.user_name ? { user_name: session.user_name } : {}),
    },
  };
}

function buildMirroredSessionKey(projectName: string, sessionKey: string) {
  return `cc-connect:${projectName}:${sessionKey}`;
}

function extractPlatformRef(sessionKey: string, platform: string) {
  const prefix = `${platform}:`;
  return sessionKey.startsWith(prefix) ? sessionKey.slice(prefix.length) : sessionKey;
}
