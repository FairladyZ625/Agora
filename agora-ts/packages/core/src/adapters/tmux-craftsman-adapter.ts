import type { CraftsmanAdapter, CraftsmanDispatchRequest, CraftsmanDispatchResult } from '../craftsman-adapter.js';
import type { ProcessCraftsmanAdapter } from './process-craftsman-adapter.js';
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
    const spec = this.inner.createCommandSpec(request);
    const shellCommand = renderShellCommand({
      cwd: request.workdir,
      command: spec.command,
      args: spec.args,
    });
    this.registry.sendKeys(paneTarget, shellCommand);
    return {
      status: 'running',
      session_id: `tmux:${this.registry.getSessionName()}:${this.name}`,
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
}) {
  const commandPart = [spec.command, ...spec.args.map(quoteShellArg)].join(' ');
  if (!spec.cwd) {
    return commandPart;
  }
  return `cd ${quoteShellArg(spec.cwd)} && ${commandPart}`;
}

function quoteShellArg(value: string) {
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}
