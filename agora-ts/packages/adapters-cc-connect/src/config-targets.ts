import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

const DEFAULT_CC_CONNECT_CONFIG_DIR = resolve(homedir(), '.cc-connect');
const DEFAULT_CC_CONNECT_CONFIG_PATH = resolve(homedir(), '.cc-connect', 'config.toml');
const DEFAULT_CC_CONNECT_MANAGEMENT_HOST = '127.0.0.1';
const DEFAULT_CC_CONNECT_MANAGEMENT_PORT = 9820;

type ConfigTargetDependencies = {
  env?: NodeJS.ProcessEnv;
  exists?: (path: string) => boolean;
  readFile?: (path: string, encoding: BufferEncoding) => string;
  readDir?: (path: string) => string[];
};

type MutableProjectTarget = {
  name: string | null;
  agentType: string | null;
  workDir: string | null;
  primaryModel: string | null;
  channelProviders: Set<string>;
};

type MutableManagementConfig = {
  enabled: boolean | null;
  port: number | null;
  token: string | null;
};

export interface CcConnectProjectTarget {
  configPath: string;
  projectName: string;
  agentType: string | null;
  workDir: string | null;
  primaryModel: string | null;
  channelProviders: string[];
  management: {
    enabled: boolean;
    baseUrl: string | null;
    token: string | null;
  };
}

export function parseCcConnectConfigPaths(
  env: NodeJS.ProcessEnv = process.env,
  readDir: (path: string) => string[] = readdirSync,
) {
  const multi = splitPathLikeList(env.AGORA_CC_CONNECT_CONFIG_PATHS);
  const single = env.AGORA_CC_CONNECT_CONFIG_PATH?.trim();
  const candidates = [
    ...multi,
    ...(single ? [single] : []),
  ];
  if (candidates.length > 0) {
    return Array.from(new Set(candidates.map(resolveTilde)));
  }

  try {
    const discovered = readDir(DEFAULT_CC_CONNECT_CONFIG_DIR)
      .filter((entry) => entry.endsWith('.toml'))
      .map((entry) => resolve(DEFAULT_CC_CONNECT_CONFIG_DIR, entry))
      .sort((left, right) => {
        if (left === DEFAULT_CC_CONNECT_CONFIG_PATH) {
          return -1;
        }
        if (right === DEFAULT_CC_CONNECT_CONFIG_PATH) {
          return 1;
        }
        return left.localeCompare(right);
      });
    if (discovered.length > 0) {
      return Array.from(new Set(discovered));
    }
  } catch {
    // Fall through to the historical default path when the directory is absent.
  }

  return [DEFAULT_CC_CONNECT_CONFIG_PATH];
}

export function loadCcConnectProjectTargets(
  deps: ConfigTargetDependencies = {},
): CcConnectProjectTarget[] {
  const env = deps.env ?? process.env;
  const exists = deps.exists ?? existsSync;
  const readFile = deps.readFile ?? readFileSync;
  const readDir = deps.readDir ?? readdirSync;

  const targets: CcConnectProjectTarget[] = [];
  for (const configPath of parseCcConnectConfigPaths(env, readDir)) {
    if (!exists(configPath)) {
      continue;
    }
    targets.push(...parseCcConnectConfig(readFile(configPath, 'utf8'), configPath));
  }
  return targets.sort((left, right) => left.projectName.localeCompare(right.projectName));
}

function parseCcConnectConfig(raw: string, configPath: string): CcConnectProjectTarget[] {
  let currentSection = '';
  const management: MutableManagementConfig = {
    enabled: null,
    port: null,
    token: null,
  };
  const projects: MutableProjectTarget[] = [];
  let currentProject: MutableProjectTarget | null = null;

  for (const rawLine of raw.split('\n')) {
    const line = stripTomlComment(rawLine).trim();
    if (!line) {
      continue;
    }

    const arraySection = line.match(/^\[\[([^\]]+)\]\]$/)?.[1]?.trim() ?? null;
    if (arraySection === 'projects') {
      currentProject = {
        name: null,
        agentType: null,
        workDir: null,
        primaryModel: null,
        channelProviders: new Set<string>(),
      };
      projects.push(currentProject);
      currentSection = 'projects';
      continue;
    }
    if (arraySection === 'projects.platforms') {
      currentSection = 'projects.platforms';
      continue;
    }

    const section = line.match(/^\[([^\]]+)\]$/)?.[1]?.trim() ?? null;
    if (section) {
      currentSection = section;
      continue;
    }

    const kvMatch = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/);
    if (!kvMatch?.[1] || !kvMatch[2]) {
      continue;
    }

    const key = kvMatch[1].trim();
    const value = parseScalar(kvMatch[2]);

    if (currentSection === 'management') {
      if (key === 'enabled' && typeof value === 'boolean') {
        management.enabled = value;
      }
      if (key === 'port' && typeof value === 'number') {
        management.port = value;
      }
      if (key === 'token' && typeof value === 'string') {
        management.token = value;
      }
      continue;
    }

    if (!currentProject) {
      continue;
    }

    if (currentSection === 'projects') {
      if (key === 'name' && typeof value === 'string') {
        currentProject.name = value;
      }
      continue;
    }
    if (currentSection === 'projects.agent') {
      if (key === 'type' && typeof value === 'string') {
        currentProject.agentType = value;
      }
      continue;
    }
    if (currentSection === 'projects.agent.options') {
      if (key === 'work_dir' && typeof value === 'string') {
        currentProject.workDir = value;
      }
      if (key === 'model' && typeof value === 'string') {
        currentProject.primaryModel = value;
      }
      continue;
    }
    if (currentSection === 'projects.platforms') {
      if (key === 'type' && typeof value === 'string') {
        currentProject.channelProviders.add(value);
      }
      continue;
    }
  }

  const managementEnabled = management.enabled === true;
  const managementBaseUrl = managementEnabled
    ? `http://${DEFAULT_CC_CONNECT_MANAGEMENT_HOST}:${management.port ?? DEFAULT_CC_CONNECT_MANAGEMENT_PORT}`
    : null;

  return projects
    .filter((project) => Boolean(project.name))
    .map((project) => ({
      configPath,
      projectName: project.name as string,
      agentType: project.agentType,
      workDir: project.workDir,
      primaryModel: project.primaryModel,
      channelProviders: Array.from(project.channelProviders).sort(),
      management: {
        enabled: managementEnabled,
        baseUrl: managementBaseUrl,
        token: management.token?.trim() || null,
      },
    }));
}

function parseScalar(raw: string): string | number | boolean | null {
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
  const doubleQuoted = value.match(/^"(.*)"$/);
  if (doubleQuoted) {
    return doubleQuoted[1] ?? '';
  }
  const singleQuoted = value.match(/^'(.*)'$/);
  if (singleQuoted) {
    return singleQuoted[1] ?? '';
  }
  return null;
}

function splitPathLikeList(raw: string | undefined) {
  if (!raw) {
    return [];
  }
  return raw
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map(resolveTilde);
}

function resolveTilde(path: string) {
  return path.startsWith('~/') ? resolve(homedir(), path.slice(2)) : path;
}

function stripTomlComment(line: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (ch === '#' && !inSingle && !inDouble) {
      return line.slice(0, i);
    }
  }
  return line;
}
