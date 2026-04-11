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

export function parseRunnerPayloadArg(payloadArg: string): RunnerPayload {
  return parseJsonWithContext<RunnerPayload>(payloadArg, 'process callback runner payload');
}

async function main() {
  const payloadArg = process.argv[2];
  if (!payloadArg) {
    throw new Error('missing runner payload');
  }
  const payload = parseRunnerPayloadArg(payloadArg);
  await runCallbackProcess(payload);
}

function runCommand(payload: RunnerPayload) {
  return new Promise<{
    status: 'succeeded' | 'failed';
    stdout: string;
    stderr: string;
    failureSummary: string | null;
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
      const trimmedStdout = stdout.trim();
      const trimmedStderr = stderr.trim();
      const failureSummary = inferSemanticFailure(trimmedStdout, trimmedStderr);
      resolve({
        status: code === 0 && !failureSummary ? 'succeeded' : 'failed',
        stdout: trimmedStdout,
        stderr: trimmedStderr,
        failureSummary,
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
    failureSummary: string | null;
    finishedAt: string;
  },
) {
  const failureSummary = result.failureSummary?.trim()
    || result.stderr?.trim()
    || result.stdout?.trim()
    || 'craftsman failed';
  const callbackPayload = {
    execution_id: payload.executionId,
    status: result.status,
    session_id: null,
    payload: {
      output: result.status === 'succeeded'
        ? {
          summary: summarizeCraftsmanOutputForHuman(result.stdout, 'craftsman completed'),
          text: result.stdout || null,
          stderr: null,
          artifacts: [],
          structured: null,
        }
        : {
          summary: failureSummary,
          text: result.stdout || null,
          stderr: result.stderr || null,
          artifacts: [],
          structured: null,
        },
    },
    error: result.status === 'failed' ? failureSummary : null,
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

const PERMISSION_REJECTION_MARKERS = [
  'User refused permission to run tool',
  "The user doesn't want to proceed with this tool use.",
  'The tool use was rejected',
];
const TRANSCRIPT_PREFIXES = ['[client]', '[tool]', '[done]'];
const TRANSCRIPT_REJECTIONS = [
  'User refused permission to run tool',
  "The user doesn't want to proceed with this tool use.",
  'STOP what you are doing and wait for the user to tell you how to proceed.',
];

function inferSemanticFailure(stdout: string, stderr: string) {
  const combined = [stdout, stderr].filter((value) => value.trim().length > 0).join('\n');
  if (!combined) {
    return null;
  }
  for (const marker of PERMISSION_REJECTION_MARKERS) {
    if (combined.includes(marker)) {
      return marker;
    }
  }
  const htmlFailure = summarizeHtmlGatewayFailure(combined);
  if (htmlFailure) {
    return htmlFailure;
  }
  return null;
}

function summarizeHtmlGatewayFailure(output: string) {
  const statusMatch = output.match(/HTTP\s*(\d{3})[: ]/i);
  const looksLikeHtml = /<!doctype\s*html|<html|<\/html>/i.test(output);
  if (!statusMatch || !looksLikeHtml) {
    return null;
  }
  const host = output.includes('errors.aliyun.com')
    ? 'errors.aliyun.com'
    : output.includes('aliyun.com')
      ? 'aliyun.com'
      : 'upstream';
  return `HTTP ${statusMatch[1]} HTML error page from ${host}`;
}

function summarizeCraftsmanOutputForHuman(output: string | null | undefined, fallback = 'completed') {
  const trimmed = output?.trim();
  if (!trimmed) {
    return fallback;
  }
  if (!looksLikeCraftsmanTranscript(trimmed)) {
    return trimmed;
  }

  const meaningfulLines = Array.from(new Set(
    trimmed
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => isMeaningfulTranscriptLine(line)),
  ));
  const rejection = TRANSCRIPT_REJECTIONS.find((line) => trimmed.includes(line)) ?? null;
  const summaryParts = meaningfulLines.slice(-2);
  if (rejection && !summaryParts.includes(rejection)) {
    summaryParts.push(rejection);
  }
  if (summaryParts.length === 0) {
    return fallback;
  }
  return summaryParts.join(' ').trim();
}

function looksLikeCraftsmanTranscript(output: string) {
  return output.split('\n').some((line) => {
    const trimmed = line.trim();
    return TRANSCRIPT_PREFIXES.some((prefix) => trimmed.startsWith(prefix))
      || trimmed.includes('session/request_permission')
      || trimmed.includes('→')
      || trimmed.startsWith('input:')
      || trimmed.startsWith('files:');
  });
}

function isMeaningfulTranscriptLine(line: string) {
  if (!line) {
    return false;
  }
  if (TRANSCRIPT_PREFIXES.some((prefix) => line.startsWith(prefix))) {
    return false;
  }
  if (
    line.startsWith('input:')
    || line.startsWith('kind:')
    || line.startsWith('files:')
    || line.startsWith('output:')
    || line.startsWith('```')
    || line.startsWith('<')
    || line.startsWith('...')
    || /^\d+→/.test(line)
  ) {
    return false;
  }
  return true;
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

function parseJsonWithContext<T>(value: string, context: string): T {
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    throw new Error(`Invalid ${context}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
