import { describe, expect, it } from 'vitest';
import {
  craftsmanCallbackRequestSchema,
  craftsmanDispatchRequestSchema,
  craftsmanExecutionSchema,
  tmuxSendKeysRequestSchema,
  tmuxSendTextRequestSchema,
  tmuxSubmitChoiceRequestSchema,
  craftsmanRuntimeIdentityRequestSchema,
} from './craftsman.js';

describe('craftsman contracts', () => {
  it('parses generic execution, dispatch, and callback payloads without binding adapters', () => {
    const execution = craftsmanExecutionSchema.parse({
      execution_id: 'exec-001',
      task_id: 'OC-500',
      subtask_id: 'build-runtime',
      adapter: 'codex',
      mode: 'one_shot',
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
        mode: 'interactive',
        interaction_expectation: 'needs_input',
        brief_path: null,
        workdir: '/tmp/worktree',
      }).mode,
    ).toBe('interactive');
    expect(
      craftsmanDispatchRequestSchema.parse({
        task_id: 'OC-500',
        subtask_id: 'build-runtime',
        caller_id: 'opus',
        adapter: 'shell',
      }).interaction_expectation,
    ).toBe('one_shot');
    expect(
      craftsmanCallbackRequestSchema.parse({
        execution_id: 'exec-001',
        status: 'needs_input',
        session_id: 'session-42',
        payload: {
          output: {
            summary: 'done',
            artifacts: ['src/index.ts'],
            structured: { files: 3 },
          },
          input_request: {
            transport: 'choice',
            hint: 'Select the next plan step',
            choice_options: [
              { id: 'continue', label: 'Continue', keys: ['Down'], submit: true },
            ],
          },
        },
        error: null,
        finished_at: null,
      }).status,
    ).toBe('needs_input');
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
      mode: 'one_shot',
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

  it('parses structured tmux input requests', () => {
    expect(tmuxSendTextRequestSchema.parse({
      agent: 'codex',
      text: 'Continue with the implementation plan',
      submit: false,
    }).submit).toBe(false);

    expect(tmuxSendKeysRequestSchema.parse({
      agent: 'claude',
      keys: ['Down', 'Down', 'Tab'],
    }).keys).toEqual(['Down', 'Down', 'Tab']);

    expect(tmuxSubmitChoiceRequestSchema.parse({
      agent: 'gemini',
      keys: ['Down'],
    }).keys).toEqual(['Down']);
  });
});
