import { describe, expect, it } from 'vitest';
import {
  craftsmanCallbackRequestSchema,
  craftsmanDispatchRequestSchema,
  craftsmanExecutionSchema,
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
      callback_payload: { summary: 'started' },
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
        payload: { files: 3 },
        error: null,
        finished_at: '2026-03-08T10:10:00.000Z',
      }).status,
    ).toBe('succeeded');
  });

  it('rejects invalid execution modes and statuses', () => {
    expect(() => craftsmanDispatchRequestSchema.parse({
      task_id: 'OC-500',
      subtask_id: 'build-runtime',
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
});
