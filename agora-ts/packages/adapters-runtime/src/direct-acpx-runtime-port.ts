import { spawnSync, type SpawnSyncOptions, type SpawnSyncReturns } from 'node:child_process';
import type { CraftsmanExecutionTailResponseDto, CraftsmanInputKeyDto } from '@agora-ts/contracts';
import type {
  AcpRuntimeEnsureSessionRequest,
  AcpRuntimeEnsureSessionResult,
  AcpRuntimePort,
  AcpRuntimeProbeResult,
  AcpRuntimeSendTextRequest,
  AcpRuntimeStartExecutionRequest,
  AcpRuntimeStartExecutionResult,
  AcpRuntimeStopExecutionRequest,
  AcpRuntimeSessionRef,
} from '@agora-ts/core';

type SpawnSyncLike = (
  command: string,
  args: string[],
  options: SpawnSyncOptions & {
    encoding: 'utf8';
  },
) => SpawnSyncReturns<string>;

export interface DirectAcpxRuntimePortOptions {
  spawnSync?: SpawnSyncLike;
  now?: () => string;
  command?: string;
  baseArgs?: string[];
}

export class DirectAcpxRuntimePort implements AcpRuntimePort {
  private readonly runSync: SpawnSyncLike;
  private readonly now: () => string;
  private readonly command: string;
  private readonly baseArgs: string[];

  constructor(options: DirectAcpxRuntimePortOptions = {}) {
    this.runSync = options.spawnSync ?? ((command, args, spawnOptions) => (
      spawnSync(command, args, spawnOptions)
    ));
    this.now = options.now ?? (() => new Date().toISOString());
    this.command = options.command ?? 'acpx';
    this.baseArgs = options.baseArgs ?? [];
  }

  ensureSession(request: AcpRuntimeEnsureSessionRequest): AcpRuntimeEnsureSessionResult {
    const payload = this.runJsonCommand(
      [
        ...this.buildGlobalArgs(request),
        request.agent,
        'sessions',
        'ensure',
        '--name',
        request.sessionName,
      ],
      request.cwd,
    );
    return {
      sessionName: request.sessionName,
      created: payload.created === true,
      agentSessionId: readString(payload.agentSessionId),
    };
  }

  startExecution(request: AcpRuntimeStartExecutionRequest): AcpRuntimeStartExecutionResult {
    const ensured = this.ensureSession(request);
    this.runTextCommand(
      [
        ...this.buildGlobalArgs(request, { format: 'quiet' }),
        request.agent,
        '-s',
        request.sessionName,
        '--no-wait',
        request.prompt,
      ],
      request.cwd,
    );
    return {
      executionId: request.executionId,
      sessionName: request.sessionName,
      agentSessionId: ensured.agentSessionId,
      queued: true,
      startedAt: this.now(),
    };
  }

  probeExecution(request: AcpRuntimeSessionRef): AcpRuntimeProbeResult {
    const payload = this.runJsonCommand(
      [
        '--cwd',
        request.cwd,
        '--format',
        'json',
        request.agent,
        'status',
        '-s',
        request.sessionName,
      ],
      request.cwd,
    );
    const status = readString(payload.status);
    return {
      sessionName: request.sessionName,
      lifecycleState: normalizeLifecycleState(status),
      agentSessionId: readString(payload.agentSessionId),
      summary: readString(payload.summary),
      lastPromptTime: readString(payload.lastPromptTime),
      rawStatus: payload,
    };
  }

  tailExecution(request: AcpRuntimeSessionRef, lines: number): CraftsmanExecutionTailResponseDto {
    const output = this.runTextCommand(
      [
        '--cwd',
        request.cwd,
        '--format',
        'text',
        request.agent,
        'sessions',
        'read',
        '--tail',
        String(lines),
        request.sessionName,
      ],
      request.cwd,
    ).trim();

    return {
      execution_id: request.sessionName,
      available: output.length > 0,
      output: output.length > 0 ? output : null,
      source: 'acpx',
    };
  }

  sendText(request: AcpRuntimeSendTextRequest): void {
    this.runTextCommand(
      [
        ...this.buildGlobalArgs(request, { format: 'quiet' }),
        request.agent,
        '-s',
        request.sessionName,
        '--no-wait',
        request.prompt,
      ],
      request.cwd,
    );
  }

  sendKeys(request: AcpRuntimeSessionRef, keys: CraftsmanInputKeyDto[]): void {
    throw new Error(`ACPX transport does not support structured key input yet (${request.agent}: ${keys.join(',')})`);
  }

  submitChoice(request: AcpRuntimeSessionRef, keys: CraftsmanInputKeyDto[]): void {
    throw new Error(`ACPX transport does not support choice-key submission yet (${request.agent}: ${keys.join(',')})`);
  }

  stopExecution(request: AcpRuntimeStopExecutionRequest): void {
    this.runTextCommand(
      [
        ...this.buildGlobalArgs(request, { format: 'quiet' }),
        request.agent,
        'cancel',
        '-s',
        request.sessionName,
      ],
      request.cwd,
    );
  }

  private buildGlobalArgs(
    request: {
      cwd: string;
      model?: string | null;
      timeoutSeconds?: number | null;
      ttlSeconds?: number | null;
      permissionMode?: 'approve_all' | 'approve_reads' | 'deny_all';
    },
    options: { format?: 'json' | 'text' | 'quiet' } = {},
  ) {
    const args = [
      '--cwd',
      request.cwd,
      ...(request.permissionMode ? [toPermissionFlag(request.permissionMode)] : ['--approve-reads']),
      '--format',
      options.format ?? 'json',
    ];
    if ((options.format ?? 'json') === 'json') {
      args.push('--json-strict');
    }
    if (request.model) {
      args.push('--model', request.model);
    }
    if (typeof request.timeoutSeconds === 'number') {
      args.push('--timeout', String(request.timeoutSeconds));
    }
    if (typeof request.ttlSeconds === 'number') {
      args.push('--ttl', String(request.ttlSeconds));
    }
    return [...this.baseArgs, ...args];
  }

  private runJsonCommand(args: string[], cwd: string) {
    const result = this.run(args, cwd);
    const stdout = result.stdout.trim();
    if (!stdout) {
      throw new Error(`acpx returned empty JSON output for args: ${args.join(' ')}`);
    }
    return parseJsonRecord(stdout);
  }

  private runTextCommand(args: string[], cwd: string) {
    const result = this.run(args, cwd);
    return result.stdout;
  }

  private run(args: string[], cwd: string) {
    const result = this.runSync(this.command, args, {
      cwd,
      encoding: 'utf8',
      env: process.env,
    });
    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      const stderr = (result.stderr ?? '').trim();
      throw new Error(stderr || `acpx command failed: ${[this.command, ...args].join(' ')}`);
    }
    return {
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    };
  }
}

function toPermissionFlag(mode: 'approve_all' | 'approve_reads' | 'deny_all') {
  if (mode === 'approve_all') {
    return '--approve-all';
  }
  if (mode === 'deny_all') {
    return '--deny-all';
  }
  return '--approve-reads';
}

function parseJsonRecord(text: string): Record<string, unknown> {
  const value = JSON.parse(text) as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('expected acpx JSON output to be an object');
  }
  return value as Record<string, unknown>;
}

function readString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function normalizeLifecycleState(status: string | null) {
  if (status === 'alive' || status === 'running') {
    return 'alive';
  }
  if (status === 'no-session') {
    return 'no_session';
  }
  return 'dead';
}
