import { execFile as nodeExecFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, isAbsolute, join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(nodeExecFile);
const DEFAULT_CC_CONNECT_COMMAND = 'cc-connect';
const DEFAULT_CC_CONNECT_TIMEOUT_MS = 5_000;
const DEFAULT_CC_CONNECT_CONFIG_PATH = join(homedir(), '.cc-connect', 'config.toml');
const DEFAULT_CC_CONNECT_MANAGEMENT_HOST = '127.0.0.1';
const DEFAULT_CC_CONNECT_MANAGEMENT_PORT = 9820;

type ExecResult = {
  stdout: string;
  stderr: string;
};

type FetchJsonResult = {
  status: number;
  json: unknown;
};

type InspectDependencies = {
  env?: NodeJS.ProcessEnv;
  readFile?: (path: string, encoding: BufferEncoding) => string;
  exists?: (path: string) => boolean;
  resolveCommand?: (command: string, env: NodeJS.ProcessEnv) => string | null;
  execFile?: (file: string, args: string[], options: { timeoutMs: number }) => Promise<ExecResult>;
  fetchJson?: (url: string, init: { headers: Record<string, string>; timeoutMs: number }) => Promise<FetchJsonResult>;
};

export interface CcConnectInspectInput {
  command?: string;
  configPath?: string;
  managementBaseUrl?: string;
  managementToken?: string;
  timeoutMs?: number;
}

export interface CcConnectBinaryInspection {
  command: string;
  found: boolean;
  resolvedPath: string | null;
  version: string | null;
  reason: string | null;
  error?: string | null;
}

export interface CcConnectManagementConfigInspection {
  enabled: boolean | null;
  port: number | null;
  tokenPresent: boolean;
}

export interface CcConnectConfigInspection {
  path: string;
  exists: boolean;
  management: CcConnectManagementConfigInspection;
}

export interface CcConnectManagementInspection {
  url: string | null;
  reachable: boolean;
  version: string | null;
  projectsCount: number | null;
  bridgeAdapterCount: number | null;
  connectedPlatforms: string[];
  reason: string | null;
  error: string | null;
}

export interface CcConnectInspectionResult {
  binary: CcConnectBinaryInspection;
  config: CcConnectConfigInspection;
  management: CcConnectManagementInspection;
}

type ParsedManagementConfig = {
  enabled: boolean | null;
  port: number | null;
  token: string | null;
};

function normalizeBaseUrl(input: string): string {
  return input.endsWith('/') ? input.slice(0, -1) : input;
}

function parseVersion(stdout: string): string | null {
  const firstLine = stdout
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) {
    return null;
  }
  const match = firstLine.match(/cc-connect\s+([^\s]+)/i);
  if (match?.[1]) {
    return match[1];
  }
  return firstLine;
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

function parseCcConnectManagementConfig(raw: string): ParsedManagementConfig {
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

export function resolveCommandOnPath(command: string, env: NodeJS.ProcessEnv = process.env): string | null {
  if (!command.trim()) {
    return null;
  }
  if (isAbsolute(command) || command.includes('/')) {
    return existsSync(command) ? command : null;
  }

  const pathValue = env.PATH ?? '';
  const pathEntries = pathValue.split(delimiter).filter(Boolean);
  const extensions = process.platform === 'win32'
    ? (env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean)
    : [''];

  for (const dir of pathEntries) {
    for (const ext of extensions) {
      const candidate = join(dir, process.platform === 'win32' ? `${command}${ext}` : command);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

async function defaultExecFile(
  file: string,
  args: string[],
  options: { timeoutMs: number },
): Promise<ExecResult> {
  const result = await execFileAsync(file, args, {
    encoding: 'utf8',
    timeout: options.timeoutMs,
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

async function defaultFetchJson(
  url: string,
  init: { headers: Record<string, string>; timeoutMs: number },
): Promise<FetchJsonResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs);
  try {
    const response = await fetch(url, {
      headers: init.headers,
      signal: controller.signal,
    });
    return {
      status: response.status,
      json: await response.json(),
    };
  } finally {
    clearTimeout(timer);
  }
}

export class CcConnectInspectionService {
  private readonly env: NodeJS.ProcessEnv;
  private readonly readFile: (path: string, encoding: BufferEncoding) => string;
  private readonly exists: (path: string) => boolean;
  private readonly resolveCommand;
  private readonly execFile;
  private readonly fetchJson;

  constructor(deps: InspectDependencies = {}) {
    this.env = deps.env ?? process.env;
    this.readFile = deps.readFile ?? readFileSync;
    this.exists = deps.exists ?? existsSync;
    this.resolveCommand = deps.resolveCommand ?? resolveCommandOnPath;
    this.execFile = deps.execFile ?? defaultExecFile;
    this.fetchJson = deps.fetchJson ?? defaultFetchJson;
  }

  async inspect(input: CcConnectInspectInput = {}): Promise<CcConnectInspectionResult> {
    const timeoutMs = input.timeoutMs ?? DEFAULT_CC_CONNECT_TIMEOUT_MS;
    const command = input.command?.trim() || DEFAULT_CC_CONNECT_COMMAND;
    const configPath = input.configPath?.trim() || DEFAULT_CC_CONNECT_CONFIG_PATH;
    const resolvedPath = this.resolveCommand(command, this.env);

    const binary: CcConnectBinaryInspection = {
      command,
      found: false,
      resolvedPath,
      version: null,
      reason: null,
      error: null,
    };

    if (!resolvedPath) {
      binary.reason = 'not_found';
    } else {
      binary.found = true;
      try {
        const result = await this.execFile(resolvedPath, ['--version'], { timeoutMs });
        binary.version = parseVersion(result.stdout);
      } catch (error) {
        binary.reason = 'version_probe_failed';
        binary.error = error instanceof Error ? error.message : String(error);
      }
    }

    const configExists = this.exists(configPath);
    const parsedManagement = configExists
      ? parseCcConnectManagementConfig(this.readFile(configPath, 'utf8'))
      : { enabled: null, port: null, token: null };

    const config: CcConnectConfigInspection = {
      path: configPath,
      exists: configExists,
      management: {
        enabled: parsedManagement.enabled,
        port: parsedManagement.port,
        tokenPresent: Boolean((input.managementToken ?? parsedManagement.token)?.trim()),
      },
    };

    const management: CcConnectManagementInspection = {
      url: null,
      reachable: false,
      version: null,
      projectsCount: null,
      bridgeAdapterCount: null,
      connectedPlatforms: [],
      reason: null,
      error: null,
    };

    const managementBaseUrl = input.managementBaseUrl?.trim()
      ? normalizeBaseUrl(input.managementBaseUrl)
      : parsedManagement.enabled
        ? normalizeBaseUrl(`http://${DEFAULT_CC_CONNECT_MANAGEMENT_HOST}:${parsedManagement.port ?? DEFAULT_CC_CONNECT_MANAGEMENT_PORT}`)
        : null;
    const managementToken = input.managementToken?.trim() || parsedManagement.token?.trim() || null;

    management.url = managementBaseUrl;

    if (!managementBaseUrl) {
      management.reason = 'management_not_configured';
      return { binary, config, management };
    }
    if (!managementToken) {
      management.reason = 'management_missing_token';
      return { binary, config, management };
    }

    try {
      const response = await this.fetchJson(`${managementBaseUrl}/api/v1/status`, {
        headers: {
          Authorization: `Bearer ${managementToken}`,
        },
        timeoutMs,
      });
      if (response.status < 200 || response.status >= 300) {
        management.reason = 'management_unreachable';
        management.error = `status ${response.status}`;
        return { binary, config, management };
      }
      const envelope = response.json as {
        ok?: boolean;
        data?: {
          version?: string;
          projects_count?: number;
          bridge_adapters?: unknown[];
          connected_platforms?: string[];
        };
        error?: string;
      };
      if (!envelope.ok) {
        management.reason = 'management_unreachable';
        management.error = envelope.error ?? 'unknown error';
        return { binary, config, management };
      }
      management.reachable = true;
      management.version = typeof envelope.data?.version === 'string' ? envelope.data.version : null;
      management.projectsCount = typeof envelope.data?.projects_count === 'number' ? envelope.data.projects_count : null;
      management.bridgeAdapterCount = Array.isArray(envelope.data?.bridge_adapters) ? envelope.data.bridge_adapters.length : null;
      management.connectedPlatforms = Array.isArray(envelope.data?.connected_platforms)
        ? envelope.data.connected_platforms.filter((item): item is string => typeof item === 'string')
        : [];
      return { binary, config, management };
    } catch (error) {
      management.reason = 'management_unreachable';
      management.error = error instanceof Error ? error.message : String(error);
      return { binary, config, management };
    }
  }
}
