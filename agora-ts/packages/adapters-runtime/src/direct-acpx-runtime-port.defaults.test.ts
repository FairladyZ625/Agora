import { describe, expect, it, vi } from 'vitest';

const { spawnSync } = vi.hoisted(() => ({
  spawnSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawnSync,
}));

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

describe('DirectAcpxRuntimePort defaults', () => {
  it('uses the default child-process transport and clock when options are omitted', () => {
    spawnSync
      .mockImplementationOnce(() => ok('{"action":"session_ensured","created":true,"agentSessionId":"runtime-default"}'))
      .mockImplementationOnce(() => ok('queued'));

    const port = new DirectAcpxRuntimePort();
    const before = Date.now();
    const result = port.startExecution({
      executionId: 'exec-default-acpx',
      agent: 'claude',
      cwd: '/tmp/default-acpx',
      sessionName: 'exec-default-acpx',
      prompt: 'run with defaults',
    });
    const after = Date.now();

    expect(spawnSync).toHaveBeenCalled();
    expect(result.sessionName).toBe('exec-default-acpx');
    expect(result.agentSessionId).toBe('runtime-default');
    expect(Date.parse(result.startedAt)).toBeGreaterThanOrEqual(before - 5);
    expect(Date.parse(result.startedAt)).toBeLessThanOrEqual(after + 5);
  });
});
