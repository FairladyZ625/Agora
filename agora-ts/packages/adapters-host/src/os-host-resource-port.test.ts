import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OsHostResourcePort } from './os-host-resource-port.js';

vi.mock('node:os', () => ({
  default: {
    cpus: vi.fn(),
    loadavg: vi.fn(),
    totalmem: vi.fn(),
    freemem: vi.fn(),
  },
}));

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

import os from 'node:os';
import { execFileSync } from 'node:child_process';

describe('os host resource port', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-09T13:00:00.000Z'));
    vi.mocked(os.cpus).mockReturnValue([{ model: 'A', speed: 1, times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 } }] as unknown as ReturnType<typeof os.cpus>);
    vi.mocked(os.loadavg).mockReturnValue([2, 1, 1] as ReturnType<typeof os.loadavg>);
    vi.mocked(os.totalmem).mockReturnValue(100);
    vi.mocked(os.freemem).mockReturnValue(25);
    vi.mocked(execFileSync).mockImplementation((command: string) => {
      if (command === '/usr/sbin/sysctl') {
        return 'vm.swapusage: total = 2.00G  used = 512.00M  free = 1.50G';
      }
      if (command === '/usr/bin/memory_pressure') {
        return 'System-wide memory free percentage: 25%';
      }
      throw new Error(`unexpected command: ${command}`);
    });
  });

  it('reads darwin host resource signals and computes utilization ratios', () => {
    const originalPlatform = process.platform;
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
    const port = new OsHostResourcePort();

    expect(port.readSnapshot()).toEqual({
      observed_at: '2026-04-09T13:00:00.000Z',
      platform: 'darwin',
      cpu_count: 1,
      load_1m: 2,
      memory_total_bytes: 100,
      memory_used_bytes: 75,
      memory_utilization: 0.75,
      memory_pressure: 0.75,
      swap_total_bytes: 2147483648,
      swap_used_bytes: 536870912,
      swap_utilization: 0.25,
    });

    expect(originalPlatform).toBeDefined();
  });

  it('falls back to null swap and memory pressure when host commands fail or platform is not darwin', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('unavailable');
    });
    const port = new OsHostResourcePort();

    expect(port.readSnapshot()).toMatchObject({
      platform: 'linux',
      memory_total_bytes: 100,
      memory_used_bytes: 75,
      memory_utilization: 0.75,
      memory_pressure: null,
      swap_total_bytes: null,
      swap_used_bytes: null,
      swap_utilization: null,
    });
  });
});
