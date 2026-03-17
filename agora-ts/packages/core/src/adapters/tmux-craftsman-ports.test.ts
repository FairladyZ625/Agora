import { describe, expect, it, vi } from 'vitest';
import { TmuxCraftsmanInputPort } from './tmux-craftsman-input-port.js';
import { TmuxCraftsmanProbePort } from './tmux-craftsman-probe-port.js';
import { TmuxCraftsmanTailPort } from './tmux-craftsman-tail-port.js';
import type { TmuxDoctorPane } from '../tmux-runtime-service.js';

describe('tmux craftsman transport ports', () => {
  const readyPane: TmuxDoctorPane = {
    agent: 'codex',
    pane: '%1',
    command: 'python',
    active: true,
    ready: true,
    continuityBackend: 'unknown',
    resumeCapability: 'resume_last',
    sessionReference: null,
    identitySource: 'transport_session',
    lastRecoveryMode: null,
    transportSessionId: 'tmux:codex',
  };

  it('routes text, keys, and choices through the tmux input port', () => {
    const runtime = {
      sendText: vi.fn(),
      sendKeys: vi.fn(),
      submitChoice: vi.fn(),
    };
    const port = new TmuxCraftsmanInputPort(runtime);
    const execution = {
      executionId: 'exec-1',
      adapter: 'codex',
      sessionId: 'tmux:codex',
      workdir: null,
      taskId: 'OC-1',
      subtaskId: 'draft',
    };

    port.sendText(execution, 'continue');
    port.sendKeys(execution, ['Enter']);
    port.submitChoice(execution, ['Down', 'Enter']);

    expect(runtime.sendText).toHaveBeenCalledWith('codex', 'continue', true);
    expect(runtime.sendKeys).toHaveBeenCalledWith('codex', ['Enter']);
    expect(runtime.submitChoice).toHaveBeenCalledWith('codex', ['Down', 'Enter']);
  });

  it('rejects unsupported adapters and non-tmux session ids in the tmux input port', () => {
    const port = new TmuxCraftsmanInputPort({
      sendText: vi.fn(),
      sendKeys: vi.fn(),
      submitChoice: vi.fn(),
    });

    expect(() => port.sendText({
      executionId: 'exec-2',
      adapter: 'unknown',
      sessionId: 'tmux:unknown',
      workdir: null,
      taskId: 'OC-2',
      subtaskId: 'draft',
    }, 'continue')).toThrow(/does not support adapter/);

    expect(() => port.sendText({
      executionId: 'exec-3',
      adapter: 'claude',
      sessionId: 'acp:claude',
      workdir: null,
      taskId: 'OC-3',
      subtaskId: 'draft',
    }, 'continue')).toThrow(/requires a tmux session id/);
  });

  it('reports pane failures, resumptions, and exit markers through the tmux probe port', () => {
    const readyRuntime = {
      doctor: () => ({
        session: 'tmux-runtime',
        panes: [readyPane],
      }),
      tail: vi
        .fn()
        .mockReturnValueOnce('first line\n__AGORA_EXIT__:exec[1]:0\n')
        .mockReturnValueOnce('still running'),
    };
    const port = new TmuxCraftsmanProbePort(readyRuntime);

    const success = port.probe({
      executionId: 'exec[1]',
      adapter: 'codex',
      sessionId: 'tmux:codex',
      workdir: null,
      status: 'running',
    });
    const resumed = port.probe({
      executionId: 'exec-running',
      adapter: 'codex',
      sessionId: 'tmux:codex',
      workdir: null,
      status: 'needs_input',
    });
    const unavailable = new TmuxCraftsmanProbePort({
      doctor: () => ({ session: 'tmux-runtime', panes: [] }),
      tail: vi.fn(),
    }).probe({
      executionId: 'exec-missing',
      adapter: 'codex',
      sessionId: 'tmux:codex',
      workdir: null,
      status: 'running',
    });

    expect(success).toMatchObject({
      status: 'succeeded',
      error: null,
      payload: {
        output: {
          summary: 'first line',
          text: 'first line',
        },
      },
    });
    expect(resumed).toMatchObject({
      status: 'running',
      error: null,
      payload: {
        output: {
          summary: 'codex resumed after operator input',
        },
      },
    });
    expect(unavailable).toMatchObject({
      status: 'failed',
      error: 'tmux pane unavailable for adapter codex',
    });
  });

  it('returns null for unsupported adapters and exposes tmux tail output for supported ones', () => {
    const runtime = {
      tail: vi.fn(() => 'latest output'),
    };
    const tailPort = new TmuxCraftsmanTailPort(runtime);

    expect(tailPort.tail({
      executionId: 'exec-tail-1',
      adapter: 'unknown',
      sessionId: 'tmux:unknown',
      workdir: null,
      status: 'running',
    }, 20)).toBeNull();

    expect(tailPort.tail({
      executionId: 'exec-tail-2',
      adapter: 'gemini',
      sessionId: 'tmux:gemini',
      workdir: null,
      status: 'running',
    }, 40)).toEqual({
      execution_id: 'exec-tail-2',
      available: true,
      output: 'latest output',
      source: 'tmux',
    });
  });
});
