import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_CC_CONNECT_CONFIG_PATH = join(homedir(), '.cc-connect', 'config.toml');
const DEFAULT_CC_CONNECT_MANAGEMENT_HOST = '127.0.0.1';
const DEFAULT_CC_CONNECT_MANAGEMENT_PORT = 9820;
const DEFAULT_TIMEOUT_MS = 5_000;

type FetchJsonResult = {
  status: number;
  json: unknown;
};

type ManagementDependencies = {
  readFile?: (path: string, encoding: BufferEncoding) => string;
  exists?: (path: string) => boolean;
  fetchJson?: (url: string, init: {
    method?: 'GET' | 'POST' | 'DELETE';
    headers: Record<string, string>;
    timeoutMs: number;
    body?: string;
  }) => Promise<FetchJsonResult>;
};

export interface CcConnectManagementInput {
  configPath?: string;
  managementBaseUrl?: string;
  managementToken?: string;
  timeoutMs?: number;
}

export interface CcConnectProjectSummary {
  name: string;
  agent_type: string;
  platforms: string[];
  sessions_count: number;
  heartbeat_enabled: boolean;
}

export interface CcConnectSessionSummary {
  id: string;
  session_key: string;
  name: string | null;
  platform: string;
  agent_type: string;
  active: boolean;
  live: boolean;
  history_count: number;
  created_at: string | null;
  updated_at: string | null;
  user_name: string | null;
  chat_name: string | null;
  last_message?: CcConnectSessionMessage | null;
}

export interface CcConnectSessionMessage {
  role: string;
  content: string;
  timestamp: string | null;
}

export interface CcConnectProjectPlatformStatus {
  type: string;
  connected: boolean;
}

export interface CcConnectProjectPlatformConfig {
  type: string;
  allow_from: string | null;
}

export interface CcConnectProjectHeartbeat {
  enabled: boolean;
  paused: boolean;
  interval_mins: number | null;
  session_key: string | null;
}

export interface CcConnectProjectSettings {
  language: string | null;
  admin_from: string | null;
  disabled_commands: string[];
  quiet: boolean | null;
}

export interface CcConnectProjectDetail {
  name: string;
  agent_type: string;
  platforms: CcConnectProjectPlatformStatus[];
  platform_configs: CcConnectProjectPlatformConfig[];
  sessions_count: number;
  active_session_keys: string[];
  heartbeat: CcConnectProjectHeartbeat | null;
  settings: CcConnectProjectSettings;
  work_dir: string | null;
  agent_mode: string | null;
  mode: string | null;
  show_context_indicator: boolean | null;
}

export interface CcConnectSessionDetail {
  id: string;
  session_key: string;
  name: string | null;
  platform: string;
  agent_type: string;
  agent_session_id: string | null;
  active: boolean;
  live: boolean;
  history_count: number;
  created_at: string | null;
  updated_at: string | null;
  history: CcConnectSessionMessage[];
}

export interface CcConnectBridgeAdapterSummary {
  platform: string;
  project: string | null;
  capabilities: string[];
  connected_at: string | null;
}

export interface CcConnectSendMessageReceipt {
  message: string;
}

export interface CcConnectSessionCreateReceipt {
  id: string;
  session_key: string;
  name: string | null;
  created_at: string | null;
}

export interface CcConnectSessionSwitchReceipt {
  message: string;
  active_session_id: string;
}

export interface CcConnectDeleteReceipt {
  message: string;
}

export interface CcConnectProviderSummary {
  name: string;
  active: boolean;
  model: string | null;
  base_url: string | null;
}

export interface CcConnectProviderList {
  providers: CcConnectProviderSummary[];
  active_provider: string | null;
}

export interface CcConnectActivateProviderReceipt {
  active_provider: string;
  message: string;
}

export interface CcConnectProviderMutationReceipt {
  name?: string | null;
  message: string;
}

export interface CcConnectModelList {
  models: string[];
  current: string | null;
}

export interface CcConnectSetModelReceipt {
  model: string;
  message: string;
}

export interface CcConnectHeartbeatStatus {
  enabled: boolean;
  paused: boolean;
  interval_mins: number | null;
  only_when_idle: boolean | null;
  session_key: string | null;
  silent: boolean | null;
  run_count: number | null;
  error_count: number | null;
  skipped_busy: number | null;
  last_run: string | null;
  last_error: string | null;
}

export interface CcConnectHeartbeatReceipt {
  message: string;
}

export interface CcConnectHeartbeatIntervalReceipt {
  interval_mins: number | null;
  message: string;
}

export interface CcConnectCronJob {
  id: string;
  project: string | null;
  session_key: string;
  cron_expr: string;
  prompt: string | null;
  exec: string | null;
  work_dir: string | null;
  description: string | null;
  enabled: boolean;
  silent: boolean | null;
  created_at: string | null;
  last_run: string | null;
  last_error: string | null;
}

export interface CcConnectCronCreateReceipt {
  id: string;
  project: string | null;
  session_key: string;
  cron_expr: string;
  prompt: string | null;
  exec: string | null;
  description: string | null;
  enabled: boolean;
  created_at: string | null;
}

function normalizeBaseUrl(input: string): string {
  return input.endsWith('/') ? input.slice(0, -1) : input;
}

function parseTomlScalar(raw: string): string | number | boolean | null {
  const value = raw.trim();
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  if (/^-?\d+$/.test(value)) {
    return Number(value);
  }
  const stringMatch = value.match(/^"(.*)"$/);
  if (stringMatch) {
    return stringMatch[1] ?? '';
  }
  return null;
}

function parseManagementConfig(raw: string): { enabled: boolean | null; port: number | null; token: string | null } {
  let currentSection = '';
  let enabled: boolean | null = null;
  let port: number | null = null;
  let token: string | null = null;

  for (const rawLine of raw.split('\n')) {
    const line = rawLine.replace(/#.*/, '').trim();
    if (!line) {
      continue;
    }
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch?.[1]) {
      currentSection = sectionMatch[1].trim();
      continue;
    }
    if (currentSection !== 'management') {
      continue;
    }
    const kvMatch = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/);
    if (!kvMatch?.[1] || !kvMatch[2]) {
      continue;
    }
    const key = kvMatch[1].trim();
    const parsed = parseTomlScalar(kvMatch[2]);
    if (key === 'enabled' && typeof parsed === 'boolean') {
      enabled = parsed;
    }
    if (key === 'port' && typeof parsed === 'number') {
      port = parsed;
    }
    if (key === 'token' && typeof parsed === 'string') {
      token = parsed;
    }
  }

  return { enabled, port, token };
}

async function defaultFetchJson(
  url: string,
  init: {
    method?: 'GET' | 'POST' | 'DELETE';
    headers: Record<string, string>;
    timeoutMs: number;
    body?: string;
  },
): Promise<FetchJsonResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs);
  try {
    const response = await fetch(url, {
      method: init.method ?? 'GET',
      headers: init.headers,
      signal: controller.signal,
      ...(init.body !== undefined ? { body: init.body } : {}),
    });
    return {
      status: response.status,
      json: await response.json(),
    };
  } finally {
    clearTimeout(timer);
  }
}

type ResolvedConnection = {
  baseUrl: string;
  token: string;
  timeoutMs: number;
};

export class CcConnectManagementService {
  private readonly readFile: (path: string, encoding: BufferEncoding) => string;
  private readonly exists: (path: string) => boolean;
  private readonly fetchJson;

  constructor(deps: ManagementDependencies = {}) {
    this.readFile = deps.readFile ?? readFileSync;
    this.exists = deps.exists ?? existsSync;
    this.fetchJson = deps.fetchJson ?? defaultFetchJson;
  }

  private resolveConnection(input: CcConnectManagementInput = {}): ResolvedConnection {
    const configPath = input.configPath?.trim() || DEFAULT_CC_CONNECT_CONFIG_PATH;
    const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const configExists = this.exists(configPath);
    const parsed = configExists
      ? parseManagementConfig(this.readFile(configPath, 'utf8'))
      : { enabled: null, port: null, token: null };
    const baseUrl = input.managementBaseUrl?.trim()
      ? normalizeBaseUrl(input.managementBaseUrl)
      : parsed.enabled
        ? normalizeBaseUrl(`http://${DEFAULT_CC_CONNECT_MANAGEMENT_HOST}:${parsed.port ?? DEFAULT_CC_CONNECT_MANAGEMENT_PORT}`)
        : null;
    const token = input.managementToken?.trim() || parsed.token?.trim() || null;

    if (!baseUrl) {
      throw new Error('cc-connect management api is not configured');
    }
    if (!token) {
      throw new Error('cc-connect management api token is missing');
    }

    return { baseUrl, token, timeoutMs };
  }

  private async request<T>(
    connection: ResolvedConnection,
    path: string,
    options: { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown } = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${connection.token}`,
    };
    let body: string | undefined;
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }
    const response = await this.fetchJson(`${connection.baseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers,
      timeoutMs: connection.timeoutMs,
      ...(body !== undefined ? { body } : {}),
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`cc-connect management api returned status ${response.status}`);
    }
    const envelope = response.json as {
      ok?: boolean;
      data?: T;
      error?: string;
    };
    if (!envelope.ok || envelope.data === undefined) {
      throw new Error(envelope.error ?? 'cc-connect management api returned an invalid response');
    }
    return envelope.data;
  }

  async listProjects(input: CcConnectManagementInput = {}): Promise<CcConnectProjectSummary[]> {
    const connection = this.resolveConnection(input);
    const data = await this.request<{ projects?: CcConnectProjectSummary[] }>(connection, '/api/v1/projects');
    return Array.isArray(data.projects) ? data.projects : [];
  }

  async getProject(
    input: CcConnectManagementInput & { project: string },
  ): Promise<CcConnectProjectDetail> {
    const connection = this.resolveConnection(input);
    return this.request<CcConnectProjectDetail>(
      connection,
      `/api/v1/projects/${encodeURIComponent(input.project)}`,
    );
  }

  async listSessions(
    input: CcConnectManagementInput & { project: string },
  ): Promise<CcConnectSessionSummary[]> {
    const connection = this.resolveConnection(input);
    const data = await this.request<{ sessions?: CcConnectSessionSummary[] }>(
      connection,
      `/api/v1/projects/${encodeURIComponent(input.project)}/sessions`,
    );
    return Array.isArray(data.sessions) ? data.sessions : [];
  }

  async getSession(
    input: CcConnectManagementInput & { project: string; sessionId: string; historyLimit?: number },
  ): Promise<CcConnectSessionDetail> {
    const connection = this.resolveConnection(input);
    const params = new URLSearchParams();
    if (input.historyLimit !== undefined) {
      params.set('history_limit', String(input.historyLimit));
    }
    const query = params.size > 0 ? `?${params.toString()}` : '';
    return this.request<CcConnectSessionDetail>(
      connection,
      `/api/v1/projects/${encodeURIComponent(input.project)}/sessions/${encodeURIComponent(input.sessionId)}${query}`,
    );
  }

  async listBridgeAdapters(input: CcConnectManagementInput = {}): Promise<CcConnectBridgeAdapterSummary[]> {
    const connection = this.resolveConnection(input);
    const data = await this.request<{ adapters?: CcConnectBridgeAdapterSummary[] | null }>(
      connection,
      '/api/v1/bridge/adapters',
    );
    return Array.isArray(data.adapters) ? data.adapters : [];
  }

  async sendMessage(
    input: CcConnectManagementInput & { project: string; sessionKey: string; message: string },
  ): Promise<CcConnectSendMessageReceipt> {
    const connection = this.resolveConnection(input);
    return this.request<CcConnectSendMessageReceipt>(
      connection,
      `/api/v1/projects/${encodeURIComponent(input.project)}/send`,
      {
        method: 'POST',
        body: {
          session_key: input.sessionKey,
          message: input.message,
        },
      },
    );
  }

  async createSession(
    input: CcConnectManagementInput & { project: string; sessionKey: string; name?: string | null },
  ): Promise<CcConnectSessionCreateReceipt> {
    const connection = this.resolveConnection(input);
    return this.request<CcConnectSessionCreateReceipt>(
      connection,
      `/api/v1/projects/${encodeURIComponent(input.project)}/sessions`,
      {
        method: 'POST',
        body: {
          session_key: input.sessionKey,
          ...(input.name?.trim() ? { name: input.name.trim() } : {}),
        },
      },
    );
  }

  async switchSession(
    input: CcConnectManagementInput & { project: string; sessionKey: string; sessionId: string },
  ): Promise<CcConnectSessionSwitchReceipt> {
    const connection = this.resolveConnection(input);
    return this.request<CcConnectSessionSwitchReceipt>(
      connection,
      `/api/v1/projects/${encodeURIComponent(input.project)}/sessions/switch`,
      {
        method: 'POST',
        body: {
          session_key: input.sessionKey,
          session_id: input.sessionId,
        },
      },
    );
  }

  async deleteSession(
    input: CcConnectManagementInput & { project: string; sessionId: string },
  ): Promise<CcConnectDeleteReceipt> {
    const connection = this.resolveConnection(input);
    return this.request<CcConnectDeleteReceipt>(
      connection,
      `/api/v1/projects/${encodeURIComponent(input.project)}/sessions/${encodeURIComponent(input.sessionId)}`,
      {
        method: 'DELETE',
      },
    );
  }

  async listProviders(
    input: CcConnectManagementInput & { project: string },
  ): Promise<CcConnectProviderList> {
    const connection = this.resolveConnection(input);
    return this.request<CcConnectProviderList>(
      connection,
      `/api/v1/projects/${encodeURIComponent(input.project)}/providers`,
    );
  }

  async activateProvider(
    input: CcConnectManagementInput & { project: string; provider: string },
  ): Promise<CcConnectActivateProviderReceipt> {
    const connection = this.resolveConnection(input);
    return this.request<CcConnectActivateProviderReceipt>(
      connection,
      `/api/v1/projects/${encodeURIComponent(input.project)}/providers/${encodeURIComponent(input.provider)}/activate`,
      {
        method: 'POST',
      },
    );
  }

  async addProvider(
    input: CcConnectManagementInput & {
      project: string;
      name: string;
      apiKey?: string | null;
      baseUrl?: string | null;
      model?: string | null;
      thinking?: string | null;
      env?: Record<string, string>;
    },
  ): Promise<CcConnectProviderMutationReceipt> {
    const connection = this.resolveConnection(input);
    return this.request<CcConnectProviderMutationReceipt>(
      connection,
      `/api/v1/projects/${encodeURIComponent(input.project)}/providers`,
      {
        method: 'POST',
        body: {
          name: input.name,
          ...(input.apiKey?.trim() ? { api_key: input.apiKey.trim() } : {}),
          ...(input.baseUrl?.trim() ? { base_url: input.baseUrl.trim() } : {}),
          ...(input.model?.trim() ? { model: input.model.trim() } : {}),
          ...(input.thinking?.trim() ? { thinking: input.thinking.trim() } : {}),
          ...(input.env && Object.keys(input.env).length > 0 ? { env: input.env } : {}),
        },
      },
    );
  }

  async removeProvider(
    input: CcConnectManagementInput & { project: string; provider: string },
  ): Promise<CcConnectDeleteReceipt> {
    const connection = this.resolveConnection(input);
    return this.request<CcConnectDeleteReceipt>(
      connection,
      `/api/v1/projects/${encodeURIComponent(input.project)}/providers/${encodeURIComponent(input.provider)}`,
      {
        method: 'DELETE',
      },
    );
  }

  async listModels(
    input: CcConnectManagementInput & { project: string },
  ): Promise<CcConnectModelList> {
    const connection = this.resolveConnection(input);
    return this.request<CcConnectModelList>(
      connection,
      `/api/v1/projects/${encodeURIComponent(input.project)}/models`,
    );
  }

  async setModel(
    input: CcConnectManagementInput & { project: string; model: string },
  ): Promise<CcConnectSetModelReceipt> {
    const connection = this.resolveConnection(input);
    return this.request<CcConnectSetModelReceipt>(
      connection,
      `/api/v1/projects/${encodeURIComponent(input.project)}/model`,
      {
        method: 'POST',
        body: {
          model: input.model,
        },
      },
    );
  }

  async getHeartbeat(
    input: CcConnectManagementInput & { project: string },
  ): Promise<CcConnectHeartbeatStatus> {
    const connection = this.resolveConnection(input);
    return this.request<CcConnectHeartbeatStatus>(
      connection,
      `/api/v1/projects/${encodeURIComponent(input.project)}/heartbeat`,
    );
  }

  async pauseHeartbeat(
    input: CcConnectManagementInput & { project: string },
  ): Promise<CcConnectHeartbeatReceipt> {
    const connection = this.resolveConnection(input);
    return this.request<CcConnectHeartbeatReceipt>(
      connection,
      `/api/v1/projects/${encodeURIComponent(input.project)}/heartbeat/pause`,
      {
        method: 'POST',
      },
    );
  }

  async resumeHeartbeat(
    input: CcConnectManagementInput & { project: string },
  ): Promise<CcConnectHeartbeatReceipt> {
    const connection = this.resolveConnection(input);
    return this.request<CcConnectHeartbeatReceipt>(
      connection,
      `/api/v1/projects/${encodeURIComponent(input.project)}/heartbeat/resume`,
      {
        method: 'POST',
      },
    );
  }

  async runHeartbeat(
    input: CcConnectManagementInput & { project: string },
  ): Promise<CcConnectHeartbeatReceipt> {
    const connection = this.resolveConnection(input);
    return this.request<CcConnectHeartbeatReceipt>(
      connection,
      `/api/v1/projects/${encodeURIComponent(input.project)}/heartbeat/run`,
      {
        method: 'POST',
      },
    );
  }

  async updateHeartbeatInterval(
    input: CcConnectManagementInput & { project: string; minutes: number },
  ): Promise<CcConnectHeartbeatIntervalReceipt> {
    const connection = this.resolveConnection(input);
    return this.request<CcConnectHeartbeatIntervalReceipt>(
      connection,
      `/api/v1/projects/${encodeURIComponent(input.project)}/heartbeat/interval`,
      {
        method: 'POST',
        body: {
          minutes: input.minutes,
        },
      },
    );
  }

  async listCronJobs(
    input: CcConnectManagementInput & { project?: string },
  ): Promise<CcConnectCronJob[]> {
    const connection = this.resolveConnection(input);
    const params = new URLSearchParams();
    if (input.project?.trim()) {
      params.set('project', input.project.trim());
    }
    const query = params.size > 0 ? `?${params.toString()}` : '';
    const data = await this.request<{ jobs?: CcConnectCronJob[] }>(
      connection,
      `/api/v1/cron${query}`,
    );
    return Array.isArray(data.jobs) ? data.jobs : [];
  }

  async createCronPrompt(
    input: CcConnectManagementInput & {
      project: string;
      sessionKey: string;
      cronExpr: string;
      prompt: string;
      description?: string | null;
      silent?: boolean;
    },
  ): Promise<CcConnectCronCreateReceipt> {
    const connection = this.resolveConnection(input);
    return this.request<CcConnectCronCreateReceipt>(
      connection,
      '/api/v1/cron',
      {
        method: 'POST',
        body: {
          project: input.project,
          session_key: input.sessionKey,
          cron_expr: input.cronExpr,
          prompt: input.prompt,
          ...(input.description?.trim() ? { description: input.description.trim() } : {}),
          ...(input.silent !== undefined ? { silent: input.silent } : {}),
        },
      },
    );
  }

  async deleteCronJob(
    input: CcConnectManagementInput & { jobId: string },
  ): Promise<CcConnectDeleteReceipt> {
    const connection = this.resolveConnection(input);
    return this.request<CcConnectDeleteReceipt>(
      connection,
      `/api/v1/cron/${encodeURIComponent(input.jobId)}`,
      {
        method: 'DELETE',
      },
    );
  }
}
