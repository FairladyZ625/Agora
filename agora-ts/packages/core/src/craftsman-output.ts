import type { CraftsmanExecutionPayloadDto, CraftsmanNormalizedOutputDto } from '@agora-ts/contracts';

const TRANSCRIPT_PREFIXES = ['[client]', '[tool]', '[done]'];
const TRANSCRIPT_REJECTIONS = [
  'User refused permission to run tool',
  "The user doesn't want to proceed with this tool use.",
  'STOP what you are doing and wait for the user to tell you how to proceed.',
];

export function normalizeCraftsmanOutput(payload: CraftsmanExecutionPayloadDto | null | undefined): CraftsmanNormalizedOutputDto | null {
  if (!payload) {
    return null;
  }
  if (payload.output) {
    return {
      summary: payload.output.summary ?? null,
      text: payload.output.text ?? null,
      stderr: payload.output.stderr ?? null,
      artifacts: payload.output.artifacts ?? [],
      structured: payload.output.structured ?? null,
    };
  }
  return {
    summary: typeof payload.summary === 'string' ? payload.summary : null,
    text: typeof payload.stdout === 'string' ? payload.stdout : null,
    stderr: typeof payload.stderr === 'string' ? payload.stderr : null,
    artifacts: Array.isArray(payload.artifacts) ? payload.artifacts.filter((item): item is string => typeof item === 'string') : [],
    structured: null,
  };
}

export function formatCraftsmanOutput(payload: CraftsmanExecutionPayloadDto | null | undefined, fallback = '') {
  const normalized = normalizeCraftsmanOutput(payload);
  if (!normalized) {
    return fallback;
  }
  if (normalized.summary) {
    return normalized.summary;
  }
  if (normalized.text) {
    return normalized.text;
  }
  if (normalized.stderr) {
    return normalized.stderr;
  }
  if (normalized.structured) {
    return JSON.stringify(normalized.structured);
  }
  if (normalized.artifacts.length > 0) {
    return normalized.artifacts.join('\n');
  }
  return fallback;
}

export function summarizeCraftsmanOutputForHuman(output: string | null | undefined, fallback = 'completed') {
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
