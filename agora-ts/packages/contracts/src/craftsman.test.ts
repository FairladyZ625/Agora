import { describe, expect, it } from 'vitest';
import {
  craftsmanCallbackRequestSchema,
  craftsmanDispatchRequestSchema,
  craftsmanExecutionSchema,
  craftsmanRuntimeIdentityRequestSchema,
} from './craftsman.js';

describe('craftsman contracts', () => {
  it('parses generic execution, dispatch, and callback payloads without binding adapters', () => {
    const execution = craftsmanExecutionSchema.parse({
      execution_id: 'exec-001',
      task_id: 'OC-500',
      subtask_id: 'build-runtime',
      adapter: 'codex',
      mode: 'task',
      session_id: 'session-42',
      status: 'running',
      brief_path: '/tmp/brief.md',
      workdir: '/tmp/worktree',
      callback_payload: {
        output: {
          summary: 'started',
          artifacts: [],
        },
      },
      error: null,
      started_at: '2026-03-08T10:00:00.000Z',
      finished_at: null,
      created_at: '2026-03-08T10:00:00.000Z',
      updated_at: '2026-03-08T10:00:00.000Z',
    });

    expect(execution.adapter).toBe('codex');
    expect(
      craftsmanDispatchRequestSchema.parse({
        task_id: 'OC-500',
        subtask_id: 'build-runtime',
        caller_id: 'opus',
        adapter: 'shell',
        mode: 'continuous',
        brief_path: null,
        workdir: '/tmp/worktree',
      }).mode,
    ).toBe('continuous');
    expect(
      craftsmanCallbackRequestSchema.parse({
        execution_id: 'exec-001',
        status: 'succeeded',
        session_id: 'session-42',
        payload: {
          output: {
            summary: 'done',
            artifacts: ['src/index.ts'],
            structured: { files: 3 },
          },
        },
        error: null,
        finished_at: '2026-03-08T10:10:00.000Z',
      }).status,
    ).toBe('succeeded');
  });

  it('rejects invalid execution modes and statuses', () => {
    expect(() => craftsmanDispatchRequestSchema.parse({
      task_id: 'OC-500',
      subtask_id: 'build-runtime',
      caller_id: 'opus',
      adapter: 'codex',
      mode: 'stream',
    })).toThrow();

    expect(() => craftsmanExecutionSchema.parse({
      execution_id: 'exec-001',
      task_id: 'OC-500',
      subtask_id: 'build-runtime',
      adapter: 'codex',
      mode: 'task',
      session_id: null,
      status: 'done',
      brief_path: null,
      workdir: null,
      callback_payload: null,
      error: null,
      started_at: null,
      finished_at: null,
      created_at: '2026-03-08T10:00:00.000Z',
      updated_at: '2026-03-08T10:00:00.000Z',
    })).toThrow();
  });

  it('accepts runtime identity provenance values for gateway and plugin signals', () => {
    expect(
      craftsmanRuntimeIdentityRequestSchema.parse({
        agent: 'gemini',
        session_reference: 'gemini-runtime-123',
        identity_source: 'runtime_gateway',
        identity_path: '/tmp/runtime/session.json',
        session_observed_at: '2026-03-08T13:00:00Z',
      }).identity_source,
    ).toBe('runtime_gateway');

    expect(
      craftsmanRuntimeIdentityRequestSchema.parse({
        agent: 'gemini',
        session_reference: 'gemini-plugin-456',
        identity_source: 'plugin_event',
      }).identity_source,
    ).toBe('plugin_event');
  });
});
