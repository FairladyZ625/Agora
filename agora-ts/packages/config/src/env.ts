import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_AGORA_HOST = '127.0.0.1';
export const DEFAULT_AGORA_BACKEND_PORT = 18420;
export const DEFAULT_AGORA_FRONTEND_PORT = 33173;

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
    entries[key] = value;
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
  const envPath = resolve(projectRoot, '.env');
  if (!existsSync(envPath)) {
    return {};
  }

  return parseEnvFile(readFileSync(envPath, 'utf8'));
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
