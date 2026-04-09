import { describe, expect, it, vi } from 'vitest';
import { DirectAcpxRuntimePort } from './direct-acpx-runtime-port.js';

function ok(stdout: string) {
  return {
    status: 0,
    stdout,
    stderr: '',
    pid: 100,
    output: [null, stdout, ''],
    signal: null,
  };
}

describe('DirectAcpxRuntimePort', () => {
  it('ensures named sessions through acpx json commands', () => {
    const spawnSync = vi.fn(() => ok('{"action":"session_ensured","created":true,"agentSessionId":"runtime-123"}'));
    const port = new DirectAcpxRuntimePort({ spawnSync });

    const result = port.ensureSession({
      agent: 'claude',
      cwd: '/tmp/project',
      sessionName: 'exec-1',
      model: 'sonnet',
      timeoutSeconds: 180,
      ttlSeconds: 300,
    });

    expect(spawnSync).toHaveBeenCalledWith(
      'acpx',
      [
        '--cwd', '/tmp/project',
        '--approve-reads',
        '--format', 'json',
        '--json-strict',
        '--model', 'sonnet',
        '--timeout', '180',
        '--ttl', '300',
        'claude',
        'sessions',
        'ensure',
        '--name',
        'exec-1',
      ],
      expect.objectContaining({
        cwd: '/tmp/project',
        encoding: 'utf8',
      }),
    );
    expect(result).toEqual({
      sessionName: 'exec-1',
      created: true,
      agentSessionId: 'runtime-123',
    });
  });

  it('queues prompt execution after ensuring the session', () => {
    const spawnSync = vi
      .fn()
      .mockImplementationOnce(() => ok('{"action":"session_ensured","created":false,"agentSessionId":"runtime-456"}'))
      .mockImplementationOnce(() => ok('queued'));
    const port = new DirectAcpxRuntimePort({
      spawnSync,
      now: () => '2026-03-16T10:00:00.000Z',
    });

    const result = port.startExecution({
      executionId: 'exec-2',
      agent: 'codex',
      cwd: '/tmp/project',
      sessionName: 'exec-2',
      prompt: 'Investigate the adapter seam',
      permissionMode: 'deny_all',
    });

    expect(spawnSync).toHaveBeenNthCalledWith(
      2,
      'acpx',
      [
        '--cwd', '/tmp/project',
        '--deny-all',
        '--format', 'quiet',
        'codex',
        '-s',
        'exec-2',
        '--no-wait',
        'Investigate the adapter seam',
      ],
      expect.objectContaining({
        cwd: '/tmp/project',
      }),
    );
    expect(result).toEqual({
      executionId: 'exec-2',
      sessionName: 'exec-2',
      agentSessionId: 'runtime-456',
      queued: true,
      startedAt: '2026-03-16T10:00:00.000Z',
    });
  });

  it('parses acpx status snapshots into provider-neutral probe results', () => {
    const spawnSync = vi.fn(() => ok('{"action":"status_snapshot","status":"alive","summary":"queue owner healthy","lastPromptTime":"2026-03-16T10:01:00.000Z","agentSessionId":"runtime-789"}'));
    const port = new DirectAcpxRuntimePort({ spawnSync });

    expect(port.probeExecution({
      agent: 'gemini',
      cwd: '/tmp/project',
      sessionName: 'exec-3',
    })).toEqual({
      sessionName: 'exec-3',
      lifecycleState: 'alive',
      agentSessionId: 'runtime-789',
      summary: 'queue owner healthy',
      lastPromptTime: '2026-03-16T10:01:00.000Z',
      rawStatus: {
        action: 'status_snapshot',
        status: 'alive',
        summary: 'queue owner healthy',
        lastPromptTime: '2026-03-16T10:01:00.000Z',
        agentSessionId: 'runtime-789',
      },
    });
  });

  it('reads tail output from session history and reports acpx as the source', () => {
    const spawnSync = vi.fn(() => ok('assistant: latest result'));
    const port = new DirectAcpxRuntimePort({ spawnSync });

    expect(port.tailExecution({
      agent: 'codex',
      cwd: '/tmp/project',
      sessionName: 'exec-4',
    }, 25)).toEqual({
      execution_id: 'exec-4',
      available: true,
      output: 'assistant: latest result',
      source: 'acpx',
    });
  });

  it('cancels active sessions and rejects structured key transport for now', () => {
    const spawnSync = vi.fn(() => ok('cancelled'));
    const port = new DirectAcpxRuntimePort({ spawnSync });

    port.stopExecution({
      agent: 'claude',
      cwd: '/tmp/project',
      sessionName: 'exec-5',
      timeoutSeconds: 70,
    });

    expect(spawnSync).toHaveBeenCalledWith(
      'acpx',
      [
        '--cwd', '/tmp/project',
        '--approve-reads',
        '--format', 'quiet',
        '--timeout', '70',
        'claude',
        'cancel',
        '-s',
        'exec-5',
      ],
      expect.any(Object),
    );

    expect(() => port.sendKeys({
      agent: 'claude',
      cwd: '/tmp/project',
      sessionName: 'exec-5',
    }, ['Enter'])).toThrow(/does not support structured key input yet/i);
  });

  it('sends follow-up text prompts and maps no-session probe results', () => {
    const spawnSync = vi
      .fn()
      .mockImplementationOnce(() => ok('queued'))
      .mockImplementationOnce(() => ok('{"status":"no-session"}'));
    const port = new DirectAcpxRuntimePort({ spawnSync });

    port.sendText({
      agent: 'gemini',
      cwd: '/tmp/project',
      sessionName: 'exec-6',
      prompt: 'continue',
      permissionMode: 'approve_all',
    });

    expect(spawnSync).toHaveBeenNthCalledWith(
      1,
      'acpx',
      [
        '--cwd', '/tmp/project',
        '--approve-all',
        '--format', 'quiet',
        'gemini',
        '-s',
        'exec-6',
        '--no-wait',
        'continue',
      ],
      expect.objectContaining({ cwd: '/tmp/project' }),
    );

    expect(port.probeExecution({
      agent: 'gemini',
      cwd: '/tmp/project',
      sessionName: 'exec-6',
    })).toMatchObject({
      sessionName: 'exec-6',
      lifecycleState: 'no_session',
      agentSessionId: null,
      summary: null,
      lastPromptTime: null,
    });

    expect(() => port.submitChoice({
      agent: 'gemini',
      cwd: '/tmp/project',
      sessionName: 'exec-6',
    }, ['Enter'])).toThrow(/does not support choice-key submission yet/i);
  });
});
