import { describe, expect, it, vi } from 'vitest';
import { AcpCraftsmanInputPort } from './acp-craftsman-input-port.js';
import { AcpCraftsmanProbePort } from './acp-craftsman-probe-port.js';
import { AcpCraftsmanTailPort } from './acp-craftsman-tail-port.js';
import { AcpRuntimeRecoveryPort } from './acp-runtime-recovery-port.js';

describe('acp runtime-backed ports', () => {
  it('delegates craftsman input operations to the runtime', () => {
    const runtime = {
      sendText: vi.fn(),
      sendKeys: vi.fn(),
      submitChoice: vi.fn(),
    };
    const port = new AcpCraftsmanInputPort(runtime as never);
    const execution = {
      taskId: 'OC-INPUT-1',
      subtaskId: 'subtask-1',
      executionId: 'exec-1',
      adapter: 'claude',
      sessionId: 'acpx:session-1',
      workdir: '/tmp/project',
    };

    port.sendText(execution, 'Continue');
    port.sendKeys(execution, ['Escape']);
    port.submitChoice(execution, ['Enter']);

    expect(runtime.sendText).toHaveBeenCalledWith({
      agent: 'claude',
      cwd: '/tmp/project',
      sessionName: 'session-1',
      prompt: 'Continue',
    });
    expect(runtime.sendKeys).toHaveBeenCalledWith({
      agent: 'claude',
      cwd: '/tmp/project',
      sessionName: 'session-1',
    }, ['Escape']);
    expect(runtime.submitChoice).toHaveBeenCalledWith({
      agent: 'claude',
      cwd: '/tmp/project',
      sessionName: 'session-1',
    }, ['Enter']);
  });

  it('tails acp sessions and ignores unsupported adapters', () => {
    const runtime = {
      tailExecution: vi.fn(() => ({
        execution_id: 'exec-2',
        available: true,
        output: 'assistant: done',
        source: 'acpx',
      })),
    };
    const port = new AcpCraftsmanTailPort(runtime as never);

    expect(port.tail({
      executionId: 'exec-2',
      adapter: 'codex',
      sessionId: 'acpx:session-2',
      workdir: '/tmp/project',
      status: 'running',
    }, 20)).toEqual({
      execution_id: 'exec-2',
      available: true,
      output: 'assistant: done',
      source: 'acpx',
    });
    expect(port.tail({
      executionId: 'exec-3',
      adapter: 'tmux',
      sessionId: 'tmux:session-3',
      workdir: '/tmp/project',
      status: 'running',
    }, 20)).toBeNull();
  });

  it('maps probe responses into running and terminal craftsman callbacks', () => {
    const runtime = {
      probeExecution: vi
        .fn()
        .mockReturnValueOnce({
          sessionName: 'session-3',
          lifecycleState: 'alive',
          agentSessionId: 'runtime-3',
          summary: 'operator resumed',
          rawStatus: { action: 'status_snapshot', status: 'alive' },
        })
        .mockReturnValueOnce({
          sessionName: 'session-4',
          lifecycleState: 'dead',
          agentSessionId: 'runtime-4',
          summary: 'completed',
          rawStatus: { action: 'status_snapshot', status: 'dead', exitCode: 0, signal: null },
        }),
      tailExecution: vi.fn(() => ({
        execution_id: 'exec-4',
        available: true,
        output: 'assistant: finished cleanly',
        source: 'acpx',
      })),
    };
    const port = new AcpCraftsmanProbePort(runtime as never);

    expect(port.probe({
      executionId: 'exec-3',
      adapter: 'claude',
      sessionId: 'acpx:session-3',
      status: 'needs_input',
      workdir: '/tmp/project',
    })).toMatchObject({
      execution_id: 'exec-3',
      status: 'running',
      payload: {
        output: {
          summary: 'claude resumed after operator input',
        },
      },
    });
    expect(port.probe({
      executionId: 'exec-4',
      adapter: 'claude',
      sessionId: 'acpx:session-4',
      status: 'running',
      workdir: '/tmp/project',
    })).toMatchObject({
      execution_id: 'exec-4',
      status: 'succeeded',
      payload: {
        output: {
          text: 'assistant: finished cleanly',
        },
      },
    });
  });

  it('reports unsupported diagnosis/restart and stops valid acp executions', () => {
    const runtime = {
      stopExecution: vi.fn(),
    };
    const port = new AcpRuntimeRecoveryPort(runtime as never);

    expect(port.requestRuntimeDiagnosis({
      taskId: 'OC-1',
      agentRef: 'opus',
      runtimeProvider: 'openclaw',
      runtimeActorRef: 'runtime-opus',
    })).toMatchObject({
      operation: 'request_runtime_diagnosis',
      status: 'unsupported',
    });
    expect(port.restartCitizenRuntime({
      taskId: 'OC-1',
      agentRef: 'opus',
      runtimeProvider: 'openclaw',
      runtimeActorRef: 'runtime-opus',
    })).toMatchObject({
      operation: 'restart_citizen_runtime',
      status: 'unsupported',
    });
    expect(port.stopExecution({
      taskId: 'OC-1',
      subtaskId: 'sub-1',
      executionId: 'exec-5',
      adapter: 'claude',
      sessionId: 'acpx:session-5',
      workdir: '/tmp/project',
      reason: 'operator stop',
    })).toMatchObject({
      operation: 'stop_execution',
      status: 'accepted',
      execution_id: 'exec-5',
      detail: 'operator stop',
    });
    expect(port.stopExecution({
      taskId: 'OC-1',
      subtaskId: 'sub-2',
      executionId: 'exec-6',
      adapter: 'tmux',
      sessionId: null,
      workdir: null,
    })).toMatchObject({
      operation: 'stop_execution',
      status: 'unsupported',
      execution_id: 'exec-6',
    });
    expect(runtime.stopExecution).toHaveBeenCalledWith({
      agent: 'claude',
      cwd: '/tmp/project',
      sessionName: 'session-5',
    });
  });
});
