import type { CraftsmanAdapter, CraftsmanDispatchRequest, CraftsmanDispatchResult } from '@agora-ts/core';
import type { ProcessCraftsmanAdapter } from '@agora-ts/adapters-craftsman';
import { TmuxPaneRegistry, type TmuxPaneRegistryOptions } from './tmux-pane-registry.js';

export interface TmuxCraftsmanAdapterOptions extends TmuxPaneRegistryOptions {
  registry?: TmuxPaneRegistry;
}

export class TmuxCraftsmanAdapter implements CraftsmanAdapter {
  public readonly name: string;
  private readonly registry: TmuxPaneRegistry;

  constructor(
    private readonly inner: ProcessCraftsmanAdapter,
    options: TmuxCraftsmanAdapterOptions = {},
  ) {
    this.name = inner.name;
    this.registry = options.registry ?? new TmuxPaneRegistry(options);
  }

  dispatchTask(request: CraftsmanDispatchRequest): CraftsmanDispatchResult {
    if (!request.prompt || request.prompt.trim().length === 0) {
      throw new Error(`${this.name} adapter requires a prompt`);
    }
    const paneTarget = this.registry.getPaneTarget(this.name);
    const spec = request.mode === 'interactive'
      ? this.inner.createInteractiveStartSpec()
      : this.inner.createCommandSpec(request);
    const shellCommand = renderShellCommand({
      cwd: request.workdir,
      command: spec.command,
      args: spec.args,
      executionId: request.execution_id,
    });
    this.registry.sendText(paneTarget, shellCommand, true);
    if (request.mode === 'interactive' && request.prompt.trim().length > 0) {
      this.registry.sendText(paneTarget, request.prompt, true);
    }
    const transportSessionId = `tmux:${this.registry.getSessionName()}:${this.name}`;
    this.registry.updatePaneState(this.name, {
      transportSessionId,
      lastRecoveryMode: 'fresh_start',
    });
    return {
      status: 'running',
      session_id: transportSessionId,
      started_at: new Date().toISOString(),
      payload: {
        command: spec.command,
        args: spec.args,
        tmux: true,
        pane: paneTarget,
        runtime_mode: 'tmux',
        transport: 'tmux-pane',
      },
    };
  }
}

function renderShellCommand(spec: {
  cwd: string | null;
  command: string;
  args: string[];
  executionId: string;
}) {
  const commandPart = [spec.command, ...spec.args.map(quoteShellArg)].join(' ');
  const baseCommand = spec.cwd
    ? `cd ${quoteShellArg(spec.cwd)} && ${commandPart}`
    : commandPart;
  return `${baseCommand}; status=$?; printf '__AGORA_EXIT__:${spec.executionId}:%s\\n' "$status"`;
}

function quoteShellArg(value: string) {
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}
