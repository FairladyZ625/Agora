import type { CraftsmanAdapter, CraftsmanDispatchRequest, CraftsmanDispatchResult } from '../craftsman-adapter.js';
import type { AcpRuntimeAgent, AcpRuntimePort } from '../acp-runtime-port.js';
import { ProcessCraftsmanAdapter, type InteractiveResumeCommand, type ProcessCraftsmanAdapterOptions } from './process-craftsman-adapter.js';
import { WatchedProcessCraftsmanAdapter } from './watched-process-craftsman-adapter.js';
import { buildAcpSessionId } from './acp-session-ref.js';

export interface AcpCraftsmanAdapterOptions {
  runtime: AcpRuntimePort;
  callbackUrl: string;
  apiToken?: string | null;
  processOptions?: ProcessCraftsmanAdapterOptions;
}

export class AcpCraftsmanAdapter implements CraftsmanAdapter {
  public readonly name: AcpRuntimeAgent;
  private readonly runtime: AcpRuntimePort;
  private readonly oneShotAdapter: WatchedProcessCraftsmanAdapter;

  constructor(
    agent: AcpRuntimeAgent,
    options: AcpCraftsmanAdapterOptions,
  ) {
    this.name = agent;
    this.runtime = options.runtime;
    this.oneShotAdapter = new WatchedProcessCraftsmanAdapter(
      new AcpxExecProcessCraftsmanAdapter(agent, options.processOptions),
      {
        callbackUrl: options.callbackUrl,
        apiToken: options.apiToken ?? null,
      },
    );
  }

  dispatchTask(request: CraftsmanDispatchRequest): CraftsmanDispatchResult {
    if (request.mode === 'one_shot') {
      return this.oneShotAdapter.dispatchTask(request);
    }
    if (!request.prompt || request.prompt.trim().length === 0) {
      throw new Error(`${this.name} adapter requires a prompt`);
    }
    const cwd = request.workdir ?? process.cwd();
    const sessionName = request.execution_id;
    const result = this.runtime.startExecution({
      executionId: request.execution_id,
      agent: this.name,
      cwd,
      sessionName,
      prompt: request.prompt,
    });
    return {
      status: 'running',
      session_id: buildAcpSessionId(sessionName),
      started_at: result.startedAt,
      payload: {
        runtime_mode: 'acp',
        transport: 'acpx-session',
        session_name: sessionName,
        agent_session_id: result.agentSessionId,
        queued: result.queued,
      },
    };
  }
}

class AcpxExecProcessCraftsmanAdapter extends ProcessCraftsmanAdapter {
  private readonly agent: AcpRuntimeAgent;

  constructor(
    agent: AcpRuntimeAgent,
    options: ProcessCraftsmanAdapterOptions = {},
  ) {
    super(agent, options);
    this.agent = agent;
  }

  protected buildCommand(request: CraftsmanDispatchRequest) {
    return {
      command: 'acpx',
      args: [
        '--cwd',
        request.workdir ?? process.cwd(),
        '--approve-reads',
        '--format',
        'text',
        this.agent,
        'exec',
        request.prompt ?? '',
      ],
    };
  }

  createInteractiveStartSpec() {
    return {
      command: 'acpx',
      args: [this.agent],
    };
  }

  createInteractiveResumeSpec(_sessionReference: string | null): InteractiveResumeCommand {
    return {
      recoveryMode: 'fresh_start',
      spec: this.createInteractiveStartSpec(),
    };
  }
}
