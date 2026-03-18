import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

const DEFAULT_PLUGIN_ID = 'agora';

export interface OpenClawConfigDocumentOptions {
  configPath?: string;
}

export interface AgoraPluginRegistrationOptions {
  configPath?: string;
  pluginId?: string;
  pluginPath: string;
  serverUrl: string;
  apiToken?: string | null;
  enabled?: boolean;
  version?: string;
  installedAt?: string;
  includeInstallRecord?: boolean;
}

export interface AgoraPluginRegistrationSummary {
  allowed: boolean;
  loadPathPresent: boolean;
  entryPresent: boolean;
  enabled: boolean;
  installPresent: boolean;
  serverUrl: string | null;
  apiTokenConfigured: boolean;
}

export function resolveOpenClawConfigPath(path = '~/.openclaw/openclaw.json') {
  return resolveTilde(path);
}

export function loadOpenClawConfigDocument(options: OpenClawConfigDocumentOptions = {}) {
  const configPath = resolveOpenClawConfigPath(options.configPath);
  if (!existsSync(configPath)) {
    return {
      configPath,
      exists: false,
      data: {} as Record<string, unknown>,
    };
  }

  try {
    return {
      configPath,
      exists: true,
      data: JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>,
    };
  } catch (error) {
    throw new Error(`Invalid OpenClaw config JSON at ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function inspectAgoraPluginRegistration(
  raw: Record<string, unknown>,
  pluginId = DEFAULT_PLUGIN_ID,
): AgoraPluginRegistrationSummary {
  const plugins = asObjectRecord(raw.plugins);
  const allow = asStringArray(plugins?.allow);
  const load = asObjectRecord(plugins?.load);
  const loadPaths = asStringArray(load?.paths);
  const entries = asObjectRecord(plugins?.entries);
  const entry = asObjectRecord(entries?.[pluginId]);
  const config = asObjectRecord(entry?.config);
  const installs = asObjectRecord(plugins?.installs);

  return {
    allowed: allow.includes(pluginId),
    loadPathPresent: loadPaths.length > 0,
    entryPresent: Boolean(entry),
    enabled: entry?.enabled !== false,
    installPresent: Boolean(asObjectRecord(installs?.[pluginId])),
    serverUrl: typeof config?.serverUrl === 'string' ? config.serverUrl : null,
    apiTokenConfigured: typeof config?.apiToken === 'string' && config.apiToken.trim().length > 0,
  };
}

export function upsertAgoraPluginRegistration(
  raw: Record<string, unknown>,
  options: AgoraPluginRegistrationOptions,
) {
  const pluginId = options.pluginId ?? DEFAULT_PLUGIN_ID;
  const plugins = asObjectRecord(raw.plugins) ?? {};
  const allow = uniqueStrings([...asStringArray(plugins.allow), pluginId]);
  const load = asObjectRecord(plugins.load) ?? {};
  const loadPaths = uniqueStrings([...asStringArray(load.paths), options.pluginPath]);
  const entries = asObjectRecord(plugins.entries) ?? {};
  const currentEntry = asObjectRecord(entries[pluginId]) ?? {};
  const currentConfig = asObjectRecord(currentEntry.config) ?? {};
  const nextConfig: Record<string, unknown> = {
    ...currentConfig,
    serverUrl: options.serverUrl,
  };

  if (options.apiToken === null) {
    delete nextConfig.apiToken;
  } else if (typeof options.apiToken === 'string') {
    nextConfig.apiToken = options.apiToken;
  }

  const updatedPlugins: Record<string, unknown> = {
    ...plugins,
    allow,
    load: {
      ...load,
      paths: loadPaths,
    },
    entries: {
      ...entries,
      [pluginId]: {
        ...currentEntry,
        enabled: options.enabled ?? true,
        config: nextConfig,
      },
    },
  };

  if (options.includeInstallRecord !== false) {
    const installs = asObjectRecord(plugins.installs) ?? {};
    const currentInstall = asObjectRecord(installs[pluginId]) ?? {};
    updatedPlugins.installs = {
      ...installs,
      [pluginId]: {
        ...currentInstall,
        source: 'path',
        sourcePath: options.pluginPath,
        installPath: options.pluginPath,
        ...(options.version ? { version: options.version } : {}),
        installedAt: options.installedAt ?? currentInstall.installedAt ?? new Date().toISOString(),
      },
    };
  }

  return {
    ...raw,
    plugins: updatedPlugins,
  };
}

function asObjectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values));
}

function resolveTilde(path: string) {
  if (!path.startsWith('~/')) {
    return path;
  }
  return resolve(homedir(), path.slice(2));
}
