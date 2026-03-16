import { describe, expect, it, vi } from 'vitest';
import { AcpCraftsmanAdapter } from './acp-craftsman-adapter.js';
import { AcpCraftsmanInputPort } from './acp-craftsman-input-port.js';
import { AcpCraftsmanProbePort } from './acp-craftsman-probe-port.js';
import { AcpCraftsmanTailPort } from './acp-craftsman-tail-port.js';
import { AcpRuntimeRecoveryPort } from './acp-runtime-recovery-port.js';

describe('ACP-backed craftsman transport', () => {
  it('dispatches interactive work through the ACP runtime and keeps a stable acpx session id', () => {
    const runtime = {
      startExecution: vi.fn(() => ({
        executionId: 'exec-1',
        sessionName: 'exec-1',
        agentSessionId: 'runtime-1',
        queued: true,
        startedAt: '2026-03-16T10:00:00.000Z',
      })),
    } as const;
    const adapter = new AcpCraftsmanAdapter('claude', {
      runtime: runtime as never,
      callbackUrl: 'http://127.0.0.1:18420/api/craftsmen/callback',
    });

    const result = adapter.dispatchTask({
      execution_id: 'exec-1',
      task_id: 'OC-1',
      stage_id: 'develop',
      subtask_id: 'sub-1',
      adapter: 'claude',
      mode: 'interactive',
      workdir: '/tmp/project',
      prompt: 'Review the auth flow',
      brief_path: null,
    });

    expect(runtime.startExecution).toHaveBeenCalledWith(expect.objectContaining({
      executionId: 'exec-1',
      sessionName: 'exec-1',
      prompt: 'Review the auth flow',
    }));
    expect(result).toMatchObject({
      status: 'running',
      session_id: 'acpx:exec-1',
      payload: expect.objectContaining({
        runtime_mode: 'acp',
        transport: 'acpx-session',
      }),
    });
  });

  it('routes text input, probe, tail, and stop through the ACP runtime', () => {
    const runtime = {
      sendText: vi.fn(),
      sendKeys: vi.fn(() => {
        throw new Error('unsupported');
      }),
      submitChoice: vi.fn(() => {
        throw new Error('unsupported');
      }),
      probeExecution: vi.fn(() => ({
        sessionName: 'exec-2',
        lifecycleState: 'dead',
        agentSessionId: 'runtime-2',
        summary: 'queue owner unavailable',
        lastPromptTime: null,
        rawStatus: { status: 'dead' },
      })),
      tailExecution: vi.fn(() => ({
        execution_id: 'exec-2',
        available: true,
        output: 'last output',
        source: 'acpx',
      })),
      stopExecution: vi.fn(),
    };

    const input = new AcpCraftsmanInputPort(runtime as never);
    input.sendText({
      executionId: 'exec-2',
      adapter: 'codex',
      sessionId: 'acpx:exec-2',
      workdir: '/tmp/project',
      taskId: 'OC-2',
      subtaskId: 'sub-2',
    }, 'Continue');
    expect(runtime.sendText).toHaveBeenCalledWith({
      agent: 'codex',
      cwd: '/tmp/project',
      sessionName: 'exec-2',
      prompt: 'Continue',
    });

    const probe = new AcpCraftsmanProbePort(runtime as never).probe({
      executionId: 'exec-2',
      adapter: 'codex',
      sessionId: 'acpx:exec-2',
      workdir: '/tmp/project',
      status: 'running',
    });
    expect(probe).toMatchObject({
      execution_id: 'exec-2',
      status: 'failed',
    });

    const tail = new AcpCraftsmanTailPort(runtime as never).tail({
      executionId: 'exec-2',
      adapter: 'codex',
      sessionId: 'acpx:exec-2',
      workdir: '/tmp/project',
      status: 'running',
    }, 20);
    expect(tail).toEqual({
      execution_id: 'exec-2',
      available: true,
      output: 'last output',
      source: 'acpx',
    });

    const stop = new AcpRuntimeRecoveryPort(runtime as never).stopExecution({
      taskId: 'OC-2',
      subtaskId: 'sub-2',
      executionId: 'exec-2',
      adapter: 'codex',
      sessionId: 'acpx:exec-2',
      workdir: '/tmp/project',
      reason: 'operator stop',
    });
    expect(runtime.stopExecution).toHaveBeenCalledWith({
      agent: 'codex',
      cwd: '/tmp/project',
      sessionName: 'exec-2',
    });
    expect(stop.status).toBe('accepted');
  });

  it('maps dead acpx sessions with clean exit codes to succeeded callbacks', () => {
    const runtime = {
      probeExecution: vi.fn(() => ({
        sessionName: 'exec-3',
        lifecycleState: 'dead',
        agentSessionId: 'runtime-3',
        summary: 'queue owner exited cleanly',
        lastPromptTime: '2026-03-16T10:02:00.000Z',
        rawStatus: { status: 'dead', exitCode: 0, signal: null },
      })),
      tailExecution: vi.fn(() => ({
        execution_id: 'exec-3',
        available: true,
        output: 'Implemented the adapter and tests',
        source: 'acpx',
      })),
    };

    const probe = new AcpCraftsmanProbePort(runtime as never).probe({
      executionId: 'exec-3',
      adapter: 'claude',
      sessionId: 'acpx:exec-3',
      workdir: '/tmp/project',
      status: 'running',
    });

    expect(probe).toMatchObject({
      execution_id: 'exec-3',
      status: 'succeeded',
      error: null,
      payload: {
        output: {
          summary: 'Implemented the adapter and tests',
          text: 'Implemented the adapter and tests',
          stderr: null,
        },
      },
    });
  });
});
