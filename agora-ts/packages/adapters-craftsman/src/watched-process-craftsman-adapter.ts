import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, type SpawnOptions, type ChildProcess } from 'node:child_process';
import type { CraftsmanAdapter, CraftsmanDispatchRequest, CraftsmanDispatchResult } from '@agora-ts/core';
import type { ProcessCraftsmanAdapter } from './process-craftsman-adapter.js';

type SpawnLike = (command: string, args: string[], options: SpawnOptions) => Pick<ChildProcess, 'pid' | 'unref'>;

export interface WatchedProcessCraftsmanAdapterOptions {
  callbackUrl: string;
  apiToken?: string | null;
  spawn?: SpawnLike;
  resolveRunner?: () => { command: string; args: string[] };
}

export class WatchedProcessCraftsmanAdapter implements CraftsmanAdapter {
  public readonly name: string;
  private readonly spawnProcess: SpawnLike;
  private readonly callbackUrl: string;
  private readonly apiToken: string | null;
  private readonly resolveRunner: () => { command: string; args: string[] };

  constructor(
    private readonly inner: ProcessCraftsmanAdapter,
    options: WatchedProcessCraftsmanAdapterOptions,
  ) {
    this.name = inner.name;
    this.spawnProcess = options.spawn ?? spawn;
    this.callbackUrl = options.callbackUrl;
    this.apiToken = options.apiToken ?? null;
    this.resolveRunner = options.resolveRunner ?? defaultRunnerCommand;
  }

  dispatchTask(request: CraftsmanDispatchRequest): CraftsmanDispatchResult {
    if (!request.prompt || request.prompt.trim().length === 0) {
      throw new Error(`${this.name} adapter requires a prompt`);
    }
    const spec = this.inner.createCommandSpec(request);
    const runner = this.resolveRunner();
    const payload = JSON.stringify({
      executionId: request.execution_id,
      callbackUrl: this.callbackUrl,
      apiToken: this.apiToken,
      command: spec.command,
      args: spec.args,
      cwd: request.workdir ?? process.cwd(),
      env: spec.env,
    });
    const child = this.spawnProcess(runner.command, [...runner.args, payload], {
      cwd: request.workdir ?? process.cwd(),
      detached: true,
      stdio: 'ignore',
    });
    if (!child.pid || child.pid <= 0) {
      throw new Error(`${this.name} watched adapter failed to start watcher`);
    }
    child.unref();
    return {
      status: 'running',
      session_id: `watcher:${child.pid}`,
      started_at: new Date().toISOString(),
      payload: {
        command: spec.command,
        args: spec.args,
        watcher: true,
        runtime_mode: 'watched',
        transport: 'process-callback-runner',
      },
    };
  }
}

function defaultRunnerCommand() {
  const dir = dirname(fileURLToPath(import.meta.url));
  const jsPath = join(dir, 'process-callback-runner.js');
  if (existsSync(jsPath)) {
    return {
      command: process.execPath,
      args: [jsPath],
    };
  }
  const tsPath = join(dir, 'process-callback-runner.ts');
  return {
    command: 'tsx',
    args: [tsPath],
  };
}
