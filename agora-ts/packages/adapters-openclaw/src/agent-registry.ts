import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import type { AgentInventorySource, RegisteredAgent } from '@agora-ts/core';

export interface OpenClawAgentRegistryOptions {
  configPath?: string;
}

type RegistryAccumulator = {
  id: string;
  host_framework: string | null;
  channel_providers: Set<string>;
  inventory_sources: Set<string>;
  primary_model: string | null;
  workspace_dir: string | null;
};

export class OpenClawAgentRegistry implements AgentInventorySource {
  private readonly configPath: string;

  constructor(options: OpenClawAgentRegistryOptions = {}) {
    this.configPath = resolveTilde(options.configPath ?? '~/.openclaw/openclaw.json');
  }

  listAgents(): RegisteredAgent[] {
    if (!existsSync(this.configPath)) {
      return [];
    }

    const raw = JSON.parse(readFileSync(this.configPath, 'utf8')) as Record<string, unknown>;
    const registry = new Map<string, RegistryAccumulator>();

    for (const item of getAgentList(raw)) {
      const id = typeof item.id === 'string' ? item.id : null;
      if (!id) {
        continue;
      }
      const model = isObjectRecord(item.model) && typeof item.model.primary === 'string'
        ? item.model.primary
        : null;
      const workspace = typeof item.workspace === 'string' ? item.workspace : null;
      upsertRegistryEntry(registry, id, 'openclaw', model, workspace);
    }

    for (const item of getChannelAccounts(raw)) {
      if (item === 'default') {
        continue;
      }
      upsertRegistryEntry(registry, item, 'discord', null, null);
    }

    return Array.from(registry.values())
      .map((item) => ({
        id: item.id,
        host_framework: item.host_framework,
        channel_providers: Array.from(item.channel_providers).sort(),
        inventory_sources: Array.from(item.inventory_sources).sort(),
        primary_model: item.primary_model,
        workspace_dir: item.workspace_dir,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }
}

function getAgentList(raw: Record<string, unknown>) {
  const agents = raw.agents;
  if (!isObjectRecord(agents)) {
    return [] as Array<Record<string, unknown>>;
  }
  const list = agents.list;
  if (!Array.isArray(list)) {
    return [] as Array<Record<string, unknown>>;
  }
  return list.filter(isObjectRecord);
}

function getChannelAccounts(raw: Record<string, unknown>) {
  const channels = raw.channels;
  if (!isObjectRecord(channels)) {
    return [] as string[];
  }

  const entries: string[] = [];
  for (const channelConfig of Object.values(channels)) {
    if (!isObjectRecord(channelConfig) || !isObjectRecord(channelConfig.accounts)) {
      continue;
    }
    entries.push(...Object.keys(channelConfig.accounts));
  }
  return entries;
}

function upsertRegistryEntry(
  registry: Map<string, RegistryAccumulator>,
  id: string,
  source: string,
  primaryModel: string | null,
  workspaceDir: string | null,
) {
  const current = registry.get(id) ?? {
    id,
    host_framework: null,
    channel_providers: new Set<string>(),
    inventory_sources: new Set<string>(),
    primary_model: null,
    workspace_dir: null,
  };
  current.inventory_sources.add(source);
  if (source === 'openclaw' && !current.host_framework) {
    current.host_framework = 'openclaw';
  }
  if (source !== 'openclaw') {
    current.channel_providers.add(source);
  }
  current.primary_model = current.primary_model ?? primaryModel;
  current.workspace_dir = current.workspace_dir ?? workspaceDir;
  registry.set(id, current);
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function resolveTilde(path: string) {
  if (!path.startsWith('~/')) {
    return path;
  }
  return resolve(homedir(), path.slice(2));
}
