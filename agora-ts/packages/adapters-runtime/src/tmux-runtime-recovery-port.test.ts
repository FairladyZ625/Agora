import { describe, expect, it, vi } from 'vitest';
import { TmuxRuntimeRecoveryPort } from './tmux-runtime-recovery-port.js';

describe('tmux runtime recovery port', () => {
  it('reports restart as unsupported with provider-specific detail', () => {
    const port = new TmuxRuntimeRecoveryPort({
      doctor: () => ({ session: 'agora', panes: [] }),
      tail: () => '',
      sendKeys: vi.fn(),
    });

    expect(port.restartCitizenRuntime({
      taskId: 'OC-RESTART-1',
      agentRef: 'claude',
      runtimeProvider: 'tmux',
      runtimeActorRef: 'claude',
    })).toMatchObject({
      operation: 'restart_citizen_runtime',
      status: 'unsupported',
      task_id: 'OC-RESTART-1',
      agent_ref: 'claude',
      detail: 'Current runtime provider tmux does not expose a restart seam yet.',
    });
  });

  it('diagnoses a ready tmux pane', () => {
    const port = new TmuxRuntimeRecoveryPort({
      doctor: () => ({
        session: 'agora',
        panes: [
          {
            agent: 'claude',
            pane: '%1',
            command: 'claude',
            active: true,
            ready: true,
            continuityBackend: 'claude_session_id',
            resumeCapability: 'native_resume',
            sessionReference: 'claude-session',
            identitySource: 'manual',
            lastRecoveryMode: 'fresh_start',
            transportSessionId: 'tmux:claude',
          },
        ],
      }),
      tail: () => 'latest runtime output',
      sendKeys: vi.fn(),
    });

    const result = port.requestRuntimeDiagnosis({
      taskId: 'OC-DIAG-1',
      agentRef: 'claude',
      runtimeProvider: 'tmux',
      runtimeActorRef: 'claude',
    });

    expect(result).toMatchObject({
      status: 'accepted',
      health: 'healthy',
      summary: 'claude pane is ready.',
      detail: 'latest runtime output',
    });
  });

  it('returns unavailable when a tmux-backed actor has no pane binding', () => {
    const port = new TmuxRuntimeRecoveryPort({
      doctor: () => ({
        session: 'agora',
        panes: [],
      }),
      tail: () => 'should not be read',
      sendKeys: vi.fn(),
    });

    expect(port.requestRuntimeDiagnosis({
      taskId: 'OC-DIAG-2',
      agentRef: 'claude',
      runtimeProvider: 'tmux',
      runtimeActorRef: 'claude',
    })).toMatchObject({
      operation: 'request_runtime_diagnosis',
      task_id: 'OC-DIAG-2',
      agent_ref: 'claude',
      status: 'unavailable',
      health: 'unavailable',
      runtime_actor_ref: 'claude',
      summary: 'No tmux pane was found for claude.',
      detail: null,
    });
  });

  it('sends Ctrl-C when stopping a tmux-backed craftsman execution', () => {
    const sendKeys = vi.fn();
    const port = new TmuxRuntimeRecoveryPort({
      doctor: () => ({ session: 'agora', panes: [] }),
      tail: () => '',
      sendKeys,
    });

    const result = port.stopExecution({
      taskId: 'OC-STOP-1',
      subtaskId: 'sub-1',
      executionId: 'exec-1',
      adapter: 'claude',
      sessionId: 'tmux:claude',
    });

    expect(sendKeys).toHaveBeenCalledWith('claude', ['C-c']);
    expect(result).toMatchObject({
      status: 'accepted',
      execution_id: 'exec-1',
    });
  });

  it('rejects stop requests when the execution has no tmux session binding', () => {
    const sendKeys = vi.fn();
    const port = new TmuxRuntimeRecoveryPort({
      doctor: () => ({ session: 'agora', panes: [] }),
      tail: () => '',
      sendKeys,
    });

    const result = port.stopExecution({
      taskId: 'OC-STOP-2',
      subtaskId: 'sub-2',
      executionId: 'exec-2',
      adapter: 'claude',
      sessionId: null,
    });

    expect(sendKeys).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 'unsupported',
      execution_id: 'exec-2',
    });
    expect(result.detail).toContain('no tmux session binding');
  });
});
