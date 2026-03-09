import type { CraftsmanExecutionPayloadDto, CraftsmanNormalizedOutputDto } from '@agora-ts/contracts';

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
