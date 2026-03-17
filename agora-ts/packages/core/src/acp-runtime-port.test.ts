import { describe, expect, it } from 'vitest';
import type { AcpRuntimePort } from './acp-runtime-port.js';

describe('AcpRuntimePort', () => {
  it('supports a provider-neutral runtime shape for acp-backed craftsman transport', () => {
    const runtime: AcpRuntimePort = {
      ensureSession: () => ({ sessionName: 'exec-1', created: true, agentSessionId: 'runtime-1' }),
      startExecution: () => ({
        executionId: 'exec-1',
        sessionName: 'exec-1',
        agentSessionId: 'runtime-1',
        queued: true,
        startedAt: '2026-03-16T00:00:00.000Z',
      }),
      probeExecution: () => ({
        sessionName: 'exec-1',
        lifecycleState: 'alive',
        agentSessionId: 'runtime-1',
        summary: 'queue owner healthy',
        lastPromptTime: null,
        rawStatus: { status: 'alive' },
      }),
      tailExecution: () => ({
        execution_id: 'exec-1',
        available: true,
        output: 'latest output',
        source: 'acpx',
      }),
      sendText: () => undefined,
      sendKeys: () => undefined,
      submitChoice: () => undefined,
      stopExecution: () => undefined,
    };

    expect(runtime.ensureSession({ agent: 'codex', cwd: '/tmp/project', sessionName: 'exec-1' })).toEqual({
      sessionName: 'exec-1',
      created: true,
      agentSessionId: 'runtime-1',
    });
    expect(runtime.tailExecution({ agent: 'codex', cwd: '/tmp/project', sessionName: 'exec-1' }, 20).source).toBe('acpx');
  });
});
