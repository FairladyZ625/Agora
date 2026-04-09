import { describe, expect, it, vi } from 'vitest';
import { TmuxCraftsmanInputPort } from './tmux-craftsman-input-port.js';
import { TmuxCraftsmanProbePort } from './tmux-craftsman-probe-port.js';
import { TmuxCraftsmanTailPort } from './tmux-craftsman-tail-port.js';

function inputExecution(overrides: Record<string, unknown> = {}) {
  return {
    executionId: 'exec-input',
    adapter: 'claude',
    sessionId: 'tmux:claude',
    workdir: '/tmp/agora',
    taskId: 'OC-1',
    subtaskId: 'subtask-1',
    ...overrides,
  };
}

function executionProbe(overrides: Record<string, unknown> = {}) {
  return {
    executionId: 'exec-probe',
    adapter: 'claude',
    sessionId: 'tmux:claude',
    workdir: '/tmp/agora',
    status: 'running',
    ...overrides,
  };
}

describe('tmux craftsman input port', () => {
  it('routes text, keys, and choices through the runtime using the adapter as agent', () => {
    const runtime = {
      sendText: vi.fn(),
      sendKeys: vi.fn(),
      submitChoice: vi.fn(),
    };
    const port = new TmuxCraftsmanInputPort(runtime);
    const execution = inputExecution({ executionId: 'exec-1' });

    port.sendText(execution, 'hello');
    port.sendKeys(execution, ['Escape', 'Enter']);
    port.submitChoice(execution, ['Down', 'Enter']);

    expect(runtime.sendText).toHaveBeenCalledWith('claude', 'hello', true);
    expect(runtime.sendKeys).toHaveBeenCalledWith('claude', ['Escape', 'Enter']);
    expect(runtime.submitChoice).toHaveBeenCalledWith('claude', ['Down', 'Enter']);
  });

  it('rejects unsupported adapters and non-tmux session ids', () => {
    const runtime = {
      sendText: vi.fn(),
      sendKeys: vi.fn(),
      submitChoice: vi.fn(),
    };
    const port = new TmuxCraftsmanInputPort(runtime);

    expect(() => port.sendText(inputExecution({
      executionId: 'exec-2',
      adapter: 'acp',
      sessionId: 'tmux:acp',
    }), 'hello')).toThrow('tmux craftsman input does not support adapter: acp');

    expect(() => port.sendKeys(inputExecution({
      executionId: 'exec-3',
      adapter: 'codex',
      sessionId: 'session:codex',
    }), ['Enter'])).toThrow('tmux craftsman input requires a tmux session id, received: session:codex');
  });
});

describe('tmux craftsman tail port', () => {
  it('returns runtime tail output for supported tmux executions', () => {
    const runtime = {
      tail: vi.fn().mockReturnValue('tail output'),
    };
    const port = new TmuxCraftsmanTailPort(runtime);

    expect(port.tail(executionProbe({
      executionId: 'exec-4',
      adapter: 'gemini',
      sessionId: 'tmux:gemini',
    }), 40)).toEqual({
      execution_id: 'exec-4',
      available: true,
      output: 'tail output',
      source: 'tmux',
    });
    expect(runtime.tail).toHaveBeenCalledWith('gemini', 40);
  });

  it('returns null for unsupported adapters or invalid session ids', () => {
    const runtime = {
      tail: vi.fn(),
    };
    const port = new TmuxCraftsmanTailPort(runtime);

    expect(port.tail(executionProbe({
      executionId: 'exec-5',
      adapter: 'acp',
      sessionId: 'tmux:acp',
    }), 20)).toBeNull();

    expect(port.tail(executionProbe({
      executionId: 'exec-6',
      adapter: 'claude',
      sessionId: 'session:claude',
    }), 20)).toBeNull();
  });
});

describe('tmux craftsman probe port', () => {
  it('returns a failed callback when the pane is unavailable', () => {
    const runtime = {
      doctor: vi.fn().mockReturnValue({ panes: [] }),
      tail: vi.fn(),
    };
    const port = new TmuxCraftsmanProbePort(runtime);

    expect(port.probe(executionProbe({
      executionId: 'exec-7',
      adapter: 'codex',
      sessionId: 'tmux:codex',
      status: 'running',
    }))).toMatchObject({
      execution_id: 'exec-7',
      status: 'failed',
      error: 'tmux pane unavailable for adapter codex',
    });
  });

  it('extracts exit markers into succeeded and failed callbacks', () => {
    const runtime = {
      doctor: vi.fn().mockReturnValue({
        panes: [{ agent: 'claude', pane: 'claude.0', ready: true }],
      }),
      tail: vi.fn()
        .mockReturnValueOnce('first line\n__AGORA_EXIT__:exec-8:0\n')
        .mockReturnValueOnce('stderr text\n__AGORA_EXIT__:exec-9:7\n'),
    };
    const port = new TmuxCraftsmanProbePort(runtime);

    expect(port.probe(executionProbe({
      executionId: 'exec-8',
      adapter: 'claude',
      sessionId: 'tmux:claude',
      status: 'running',
    }))).toMatchObject({
      execution_id: 'exec-8',
      status: 'succeeded',
      payload: {
        output: {
          summary: 'first line',
          text: 'first line',
          stderr: null,
        },
      },
      error: null,
    });

    expect(port.probe(executionProbe({
      executionId: 'exec-9',
      adapter: 'claude',
      sessionId: 'tmux:claude',
      status: 'running',
    }))).toMatchObject({
      execution_id: 'exec-9',
      status: 'failed',
      payload: {
        output: {
          text: 'stderr text',
          stderr: 'stderr text',
        },
      },
      error: 'stderr text',
    });
  });

  it('reports resumed execution after operator input and returns null for unsupported adapters', () => {
    const runtime = {
      doctor: vi.fn().mockReturnValue({
        panes: [{ agent: 'gemini', pane: 'gemini.0', ready: true, command: 'python' }],
      }),
      tail: vi.fn().mockReturnValue('still running'),
    };
    const port = new TmuxCraftsmanProbePort(runtime);

    expect(port.probe(executionProbe({
      executionId: 'exec-10',
      adapter: 'gemini',
      sessionId: 'tmux:gemini',
      status: 'needs_input',
    }))).toMatchObject({
      execution_id: 'exec-10',
      status: 'running',
      payload: {
        output: {
          summary: 'gemini resumed after operator input',
        },
      },
    });

    expect(port.probe(executionProbe({
      executionId: 'exec-11',
      adapter: 'acp',
      sessionId: 'tmux:acp',
      status: 'running',
    }))).toBeNull();
  });
});
