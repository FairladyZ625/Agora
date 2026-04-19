import type {
  CcConnectManagementInput,
  CcConnectSendMessageReceipt,
  CcConnectSessionCreateReceipt,
  CcConnectSessionSummary,
  CcConnectSessionSwitchReceipt,
} from '@agora-ts/core';
import { loadCcConnectProjectTargets, type CcConnectProjectTarget } from './config-targets.js';
import { buildCcConnectAgentId } from './agent-registry.js';

type ManagementService = {
  listSessions(input: CcConnectManagementInput & { project: string }): Promise<CcConnectSessionSummary[]>;
  createSession(input: CcConnectManagementInput & { project: string; sessionKey: string; name?: string | null }): Promise<CcConnectSessionCreateReceipt>;
  switchSession(input: CcConnectManagementInput & { project: string; sessionKey: string; sessionId: string }): Promise<CcConnectSessionSwitchReceipt>;
  sendMessage(input: CcConnectManagementInput & { project: string; sessionKey: string; message: string }): Promise<CcConnectSendMessageReceipt>;
};

export interface CcConnectThreadSessionServiceOptions {
  targets?: CcConnectProjectTarget[];
  env?: NodeJS.ProcessEnv;
  exists?: (path: string) => boolean;
  readFile?: (path: string, encoding: BufferEncoding) => string;
  readDir?: (path: string) => string[];
  managementService: ManagementService;
}

export interface EnsureCcConnectThreadSessionInput {
  agentRef: string;
  provider?: string;
  threadRef: string;
  participantBindingId: string;
  sessionName?: string | null;
}

export interface DeliverCcConnectThreadMessageInput extends EnsureCcConnectThreadSessionInput {
  message: string;
}

export interface CcConnectThreadSessionBinding {
  agentRef: string;
  projectName: string;
  sessionKey: string;
  sessionId: string | null;
  created: boolean;
  switched: boolean;
  target: CcConnectProjectTarget;
}

export class CcConnectThreadSessionService {
  private readonly targets: CcConnectProjectTarget[];
  private readonly managementService: ManagementService;

  constructor(options: CcConnectThreadSessionServiceOptions) {
    this.targets = options.targets ?? loadCcConnectProjectTargets({
      env: options.env ?? process.env,
      ...(options.exists ? { exists: options.exists } : {}),
      ...(options.readFile ? { readFile: options.readFile } : {}),
      ...(options.readDir ? { readDir: options.readDir } : {}),
    });
    this.managementService = options.managementService;
  }

  async ensureSessionBinding(input: EnsureCcConnectThreadSessionInput): Promise<CcConnectThreadSessionBinding> {
    const target = this.resolveTarget(input.agentRef);
    const connection = toManagementConnection(target);
    const sessionKey = buildCcConnectThreadSessionKey(
      input.provider ?? 'discord',
      input.threadRef,
      input.participantBindingId,
    );
    const sessions = await this.managementService.listSessions({
      ...connection,
      project: target.projectName,
    });
    const existing = sessions.find((session) => session.session_key === sessionKey) ?? null;
    if (existing) {
      const switched = existing.active ? false : await this.ensureActiveSession(connection, target.projectName, sessionKey, existing.id);
      return {
        agentRef: input.agentRef,
        projectName: target.projectName,
        sessionKey,
        sessionId: existing.id,
        created: false,
        switched,
        target,
      };
    }

    const created = await this.managementService.createSession({
      ...connection,
      project: target.projectName,
      sessionKey,
      name: input.sessionName ?? null,
    });
    const switched = await this.ensureActiveSession(connection, target.projectName, sessionKey, created.id);
    return {
      agentRef: input.agentRef,
      projectName: target.projectName,
      sessionKey,
      sessionId: created.id,
      created: true,
      switched,
      target,
    };
  }

  async deliverText(input: DeliverCcConnectThreadMessageInput) {
    const binding = await this.ensureSessionBinding(input);
    const receipt = await this.managementService.sendMessage({
      ...toManagementConnection(binding.target),
      project: binding.projectName,
      sessionKey: binding.sessionKey,
      message: input.message,
    });
    return { binding, receipt };
  }

  resolveTarget(agentRef: string) {
    const target = this.targets.find((candidate) => buildCcConnectAgentId(candidate.projectName) === agentRef) ?? null;
    if (!target) {
      throw new Error(`no cc-connect target configured for agent ${agentRef}`);
    }
    if (!target.management.enabled || !target.management.baseUrl || !target.management.token) {
      throw new Error(`cc-connect management api is not configured for agent ${agentRef}`);
    }
    return target;
  }

  private async ensureActiveSession(
    connection: CcConnectManagementInput,
    projectName: string,
    sessionKey: string,
    sessionId: string,
  ) {
    await this.managementService.switchSession({
      ...connection,
      project: projectName,
      sessionKey,
      sessionId,
    });
    return true;
  }
}

export function buildCcConnectThreadSessionKey(provider: string, threadRef: string, participantBindingId: string) {
  return `agora-${provider}:${threadRef}:${participantBindingId}`;
}

function toManagementConnection(target: CcConnectProjectTarget): CcConnectManagementInput {
  return {
    configPath: target.configPath,
    managementBaseUrl: target.management.baseUrl as string,
    managementToken: target.management.token as string,
  };
}
