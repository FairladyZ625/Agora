import { describe, expect, it } from 'vitest';
import {
  formatCraftsmanOutput,
  normalizeCraftsmanOutput,
  summarizeCraftsmanOutputForHuman,
} from './craftsman-output.js';

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

  it('summarizes raw craftsman transcripts for human-facing surfaces', () => {
    const transcript = [
      '[client] initialize (running)',
      '',
      '[client] session/new (running)',
      '我先读取 spec 文件和当前 constitution.md。',
      '',
      '[tool] Read File (pending)',
      '  input: {}',
      '',
      '[client] session/request_permission (running)',
      '',
      '内容已读取，现在填充 constitution.md。',
      '',
      '[tool] Write /tmp/constitution.md (failed)',
      '  kind: edit',
      '  output:',
      '    User refused permission to run tool',
      '',
      '[done] end_turn',
    ].join('\n');

    const summary = summarizeCraftsmanOutputForHuman(transcript, 'completed');
    expect(summary).toContain('内容已读取，现在填充 constitution.md。');
    expect(summary).toContain('User refused permission to run tool');
    expect(summary).not.toContain('[client]');
    expect(summary).not.toContain('[tool]');
    expect(summary).not.toContain('[done] end_turn');
  });
});
