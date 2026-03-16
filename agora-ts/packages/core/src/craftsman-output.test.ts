import { describe, expect, it } from 'vitest';
import { formatCraftsmanOutput, normalizeCraftsmanOutput } from './craftsman-output.js';

describe('craftsman output helpers', () => {
  it('normalizes structured output payloads', () => {
    expect(normalizeCraftsmanOutput({
      output: {
        summary: 'done',
        text: 'stdout',
        stderr: null,
        artifacts: ['artifact.txt'],
        structured: { kind: 'result' },
      },
    })).toEqual({
      summary: 'done',
      text: 'stdout',
      stderr: null,
      artifacts: ['artifact.txt'],
      structured: { kind: 'result' },
    });
  });

  it('formats fallback legacy payloads and respects fallback text', () => {
    expect(formatCraftsmanOutput({
      summary: null,
      stdout: '',
      stderr: '',
      artifacts: ['artifact-a', 'artifact-b'],
    }, 'fallback text')).toBe('artifact-a\nartifact-b');
    expect(formatCraftsmanOutput(null, 'fallback text')).toBe('fallback text');
  });
});
