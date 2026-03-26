import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_AGORA_HOST = '127.0.0.1';
export const DEFAULT_AGORA_BACKEND_PORT = 18420;
export const DEFAULT_AGORA_FRONTEND_PORT = 33173;

const RUNTIME_ENV_KEYS = new Set([
  'AGORA_SERVER_HOST',
  'AGORA_BACKEND_PORT',
  'AGORA_FRONTEND_PORT',
  'AGORA_SERVER_URL',
  'VITE_API_BASE_URL',
]);

const PATH_LIKE_ENV_KEYS = new Set([
  'AGORA_DB_PATH',
  'AGORA_CONFIG_PATH',
]);

function parseEnvFile(content: string): Record<string, string> {
  const entries: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separator = line.indexOf('=');
    if (separator <= 0) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/gu, '');
    entries[key] = normalizePathLikeEnvValue(key, value) ?? value;
  }

  return entries;
}

export function findAgoraProjectRoot(startDir: string): string {
  let current = resolve(startDir);

  while (true) {
    if (
      existsSync(resolve(current, 'AGENTS.md'))
      && existsSync(resolve(current, 'agora-ts'))
      && existsSync(resolve(current, 'dashboard'))
    ) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      throw new Error(`Unable to locate Agora project root from ${startDir}`);
    }
    current = parent;
  }
}

export function loadAgoraDotEnv(projectRoot: string): Record<string, string> {
  const envPath = resolveAgoraDotEnvPath(projectRoot);
  if (!envPath) {
    return {};
  }

  return parseEnvFile(readFileSync(envPath, 'utf8'));
}

export function resolveAgoraDotEnvPath(projectRoot: string): string | null {
  const directEnvPath = resolve(projectRoot, '.env');
  if (existsSync(directEnvPath)) {
    return directEnvPath;
  }

  const parent = dirname(projectRoot);
  if (basename(parent) === '.worktrees') {
    const sharedEnvPath = resolve(parent, '..', '.env');
    if (existsSync(sharedEnvPath)) {
      return sharedEnvPath;
    }
  }

  return null;
}

export function normalizePathLikeEnvValue(key: string, value: string | undefined): string | undefined {
  if (!value) {
    return value;
  }
  if (!PATH_LIKE_ENV_KEYS.has(key)) {
    return value;
  }

  const home = process.env.HOME?.trim() || homedir();
  if (value === '$HOME') {
    return home;
  }
  if (value.startsWith('$HOME/')) {
    return resolve(home, value.slice('$HOME/'.length));
  }
  if (value.startsWith('~/')) {
    return resolve(home, value.slice(2));
  }
  return value;
}

function hydrateProcessEnv(fileEnv: Record<string, string>, envOverrides: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(fileEnv)) {
    if (RUNTIME_ENV_KEYS.has(key)) {
      continue;
    }
    if (process.env[key] !== undefined || envOverrides[key] !== undefined) {
      continue;
    }
    process.env[key] = normalizePathLikeEnvValue(key, value) ?? value;
  }
}

export type AgoraRuntimeEnvironment = {
  projectRoot: string;
  backendPort: number;
  frontendPort: number;
  host: string;
  serverUrl: string;
  apiBaseUrl: string;
};

export function resolveAgoraRuntimeEnvironment(
  startDir: string,
  envOverrides: Record<string, string | undefined> = {},
): AgoraRuntimeEnvironment {
  const projectRoot = findAgoraProjectRoot(startDir);
  const fileEnv = loadAgoraDotEnv(projectRoot);
  hydrateProcessEnv(fileEnv, envOverrides);
  const mergedEnv = { ...fileEnv, ...process.env, ...envOverrides };

  const host = mergedEnv.AGORA_SERVER_HOST?.trim() || DEFAULT_AGORA_HOST;
  const backendPort = Number(mergedEnv.AGORA_BACKEND_PORT ?? DEFAULT_AGORA_BACKEND_PORT);
  const frontendPort = Number(mergedEnv.AGORA_FRONTEND_PORT ?? DEFAULT_AGORA_FRONTEND_PORT);
  const serverUrl = mergedEnv.AGORA_SERVER_URL?.trim() || `http://${host}:${backendPort}`;
  const apiBaseUrl = mergedEnv.VITE_API_BASE_URL?.trim() || serverUrl;

  return {
    projectRoot,
    backendPort,
    frontendPort,
    host,
    serverUrl,
    apiBaseUrl,
  };
}

export function resolveAgoraRuntimeEnvironmentFromConfigPackage(): AgoraRuntimeEnvironment {
  const configDir = dirname(fileURLToPath(import.meta.url));
  return resolveAgoraRuntimeEnvironment(resolve(configDir, '../../..'));
}
