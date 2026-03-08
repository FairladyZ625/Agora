import { spawn, type SpawnOptions, type ChildProcess } from 'node:child_process';
import type { CraftsmanDispatchRequest, CraftsmanDispatchResult, CraftsmanAdapter } from '../craftsman-adapter.js';

type SpawnLike = (command: string, args: string[], options: SpawnOptions) => Pick<ChildProcess, 'pid' | 'unref'>;

export interface ProcessCraftsmanAdapterOptions {
  spawn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

export abstract class ProcessCraftsmanAdapter implements CraftsmanAdapter {
  protected readonly spawnProcess: SpawnLike;
  protected readonly env: NodeJS.ProcessEnv;

  constructor(
    public readonly name: string,
    options: ProcessCraftsmanAdapterOptions = {},
  ) {
    this.spawnProcess = options.spawn ?? spawn;
    this.env = options.env ?? process.env;
  }

  dispatchTask(request: CraftsmanDispatchRequest): CraftsmanDispatchResult {
    if (!request.prompt || request.prompt.trim().length === 0) {
      throw new Error(`${this.name} adapter requires a prompt`);
    }
    const spec = this.buildCommand(request);
    const child = this.spawnProcess(spec.command, spec.args, {
      cwd: request.workdir ?? process.cwd(),
      detached: true,
      stdio: 'ignore',
      env: {
        ...this.env,
        ...spec.env,
      },
    });
    if (!child.pid || child.pid <= 0) {
      throw new Error(`${this.name} adapter failed to start process`);
    }
    child.unref();
    return {
      status: 'running',
      session_id: `pid:${child.pid}`,
      started_at: new Date().toISOString(),
      payload: {
        command: spec.command,
        args: spec.args,
      },
    };
  }

  protected abstract buildCommand(request: CraftsmanDispatchRequest): {
    command: string;
    args: string[];
    env?: NodeJS.ProcessEnv;
  };
}
