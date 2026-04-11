import { existsSync, readFileSync } from 'node:fs';
import type { AgentInventorySource, RegisteredAgent } from '@agora-ts/core';
import { loadCcConnectProjectTargets } from './config-targets.js';

type RegistryDependencies = {
  env?: NodeJS.ProcessEnv;
  exists?: (path: string) => boolean;
  readFile?: (path: string, encoding: BufferEncoding) => string;
};

export type CcConnectAgentRegistryOptions = RegistryDependencies;

export function buildCcConnectAgentId(projectName: string) {
  return `cc-connect:${projectName}`;
}

export class CcConnectAgentRegistry implements AgentInventorySource {
  private readonly env: NodeJS.ProcessEnv;
  private readonly exists: (path: string) => boolean;
  private readonly readFile: (path: string, encoding: BufferEncoding) => string;

  constructor(options: CcConnectAgentRegistryOptions = {}) {
    this.env = options.env ?? process.env;
    this.exists = options.exists ?? existsSync;
    this.readFile = options.readFile ?? readFileSync;
  }

  listAgents(): RegisteredAgent[] {
    return loadCcConnectProjectTargets({
      env: this.env,
      exists: this.exists,
      readFile: this.readFile,
    }).map((target) => ({
      id: buildCcConnectAgentId(target.projectName),
      host_framework: 'cc-connect',
      channel_providers: target.channelProviders,
      inventory_sources: ['cc-connect'],
      primary_model: target.primaryModel,
      workspace_dir: target.workDir,
      agent_origin: 'user_managed',
    }));
  }
}
