import { spawn } from 'node:child_process';

type RunnerPayload = {
  executionId: string;
  callbackUrl: string;
  apiToken: string | null;
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string | undefined>;
};

export async function runCallbackProcess(payload: RunnerPayload) {
  const result = await runCommand(payload);
  await postCallback(payload, result);
}

async function main() {
  const payloadArg = process.argv[2];
  if (!payloadArg) {
    throw new Error('missing runner payload');
  }
  const payload = JSON.parse(payloadArg) as RunnerPayload;
  await runCallbackProcess(payload);
}

function runCommand(payload: RunnerPayload) {
  return new Promise<{
    status: 'succeeded' | 'failed';
    stdout: string;
    stderr: string;
    finishedAt: string;
  }>((resolve, reject) => {
    const child = spawn(payload.command, payload.args, {
      cwd: payload.cwd,
      env: {
        ...process.env,
        ...payload.env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({
        status: code === 0 ? 'succeeded' : 'failed',
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        finishedAt: new Date().toISOString(),
      });
    });
  });
}

async function postCallback(
  payload: RunnerPayload,
  result: {
    status: 'succeeded' | 'failed';
    stdout: string;
    stderr: string;
    finishedAt: string;
  },
) {
  const callbackPayload = {
    execution_id: payload.executionId,
    status: result.status,
    session_id: null,
    payload: {
      output: result.status === 'succeeded'
        ? {
          summary: result.stdout || 'craftsman completed',
          text: result.stdout || null,
          stderr: null,
          artifacts: [],
          structured: null,
        }
        : {
          summary: null,
          text: result.stdout || null,
          stderr: result.stderr || result.stdout || 'craftsman failed',
          artifacts: [],
          structured: null,
        },
    },
    error: result.status === 'failed' ? (result.stderr || result.stdout || 'craftsman failed') : null,
    finished_at: result.finishedAt,
  };
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (payload.apiToken) {
    headers.authorization = `Bearer ${payload.apiToken}`;
  }
  await fetch(payload.callbackUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(callbackPayload),
  });
}

const isEntrypoint = process.argv[1]
  ? import.meta.url === new URL(`file://${process.argv[1]}`).href
  : false;

if (isEntrypoint) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
