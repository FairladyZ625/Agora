import { existsSync, readFileSync, readdirSync } from 'node:fs';
import type { AgentInventorySource, RegisteredAgent } from '@agora-ts/core';
import { loadCcConnectProjectTargets } from './config-targets.js';
import type { CcConnectProjectTarget } from './config-targets.js';

type RegistryDependencies = {
  env?: NodeJS.ProcessEnv;
  exists?: (path: string) => boolean;
  readFile?: (path: string, encoding: BufferEncoding) => string;
  readDir?: (path: string) => string[];
};

export type CcConnectAgentRegistryOptions = RegistryDependencies;

export function buildCcConnectAgentId(projectName: string) {
  return `cc-connect:${projectName}`;
}

export function buildCcConnectDiscordParticipantUserIds(targets: CcConnectProjectTarget[]) {
  const participantUserIds: Record<string, string> = {};
  for (const target of targets) {
    const [userId] = target.discord?.bot_user_ids ?? [];
    if (!userId) {
      continue;
    }
    participantUserIds[buildCcConnectAgentId(target.projectName)] = userId;
  }
  return participantUserIds;
}

export class CcConnectAgentRegistry implements AgentInventorySource {
  private readonly env: NodeJS.ProcessEnv;
  private readonly exists: (path: string) => boolean;
  private readonly readFile: (path: string, encoding: BufferEncoding) => string;
  private readonly readDir: (path: string) => string[];

  constructor(options: CcConnectAgentRegistryOptions = {}) {
    this.env = options.env ?? process.env;
    this.exists = options.exists ?? existsSync;
    this.readFile = options.readFile ?? readFileSync;
    this.readDir = options.readDir ?? readdirSync;
  }

  listAgents(): RegisteredAgent[] {
    return loadCcConnectProjectTargets({
      env: this.env,
      exists: this.exists,
      readFile: this.readFile,
      readDir: this.readDir,
    }).map((target) => ({
      id: buildCcConnectAgentId(target.projectName),
      inventory_kind: 'runtime_target' as const,
      host_framework: 'cc-connect',
      runtime_provider: 'cc-connect',
      runtime_flavor: target.runtimeFlavor,
      runtime_target_ref: buildCcConnectAgentId(target.projectName),
      channel_providers: target.channelProviders,
      inventory_sources: ['cc-connect'],
      primary_model: target.primaryModel,
      workspace_dir: target.workDir,
      discord_bot_user_ids: target.discord?.bot_user_ids ?? [],
      agent_origin: 'user_managed',
    }));
  }
}
