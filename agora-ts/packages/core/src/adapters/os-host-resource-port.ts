import { execFileSync } from 'node:child_process';
import os from 'node:os';
import type { HostResourcePort, HostResourceSnapshot } from '../host-resource-port.js';

function safeRatio(used: number | null, total: number | null) {
  if (used === null || total === null || total <= 0) {
    return null;
  }
  return used / total;
}

function parseDarwinSwapUsage(): { total: number | null; used: number | null } {
  try {
    const output = execFileSync('/usr/sbin/sysctl', ['vm.swapusage'], { encoding: 'utf8' });
    const totalMatch = output.match(/total = ([0-9.]+)([MG])?/i);
    const usedMatch = output.match(/used = ([0-9.]+)([MG])?/i);
    const toBytes = (raw: string | undefined, unit: string | undefined) => {
      if (!raw) {
        return null;
      }
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        return null;
      }
      if ((unit ?? '').toUpperCase() === 'G') {
        return Math.round(value * 1024 * 1024 * 1024);
      }
      return Math.round(value * 1024 * 1024);
    };
    return {
      total: toBytes(totalMatch?.[1], totalMatch?.[2]),
      used: toBytes(usedMatch?.[1], usedMatch?.[2]),
    };
  } catch {
    return { total: null, used: null };
  }
}

function parseDarwinMemoryPressure(): number | null {
  try {
    const output = execFileSync('/usr/bin/memory_pressure', [], { encoding: 'utf8' });
    const freePercentMatch = output.match(/System-wide memory free percentage:\s*([0-9.]+)%/i);
    if (!freePercentMatch) {
      return null;
    }
    const freePercent = Number(freePercentMatch[1]);
    if (!Number.isFinite(freePercent)) {
      return null;
    }
    const normalizedFree = Math.max(0, Math.min(100, freePercent));
    return 1 - normalizedFree / 100;
  } catch {
    return null;
  }
}

export class OsHostResourcePort implements HostResourcePort {
  readSnapshot(): HostResourceSnapshot {
    const cpuCount = os.cpus().length || null;
    const load1m = os.loadavg()[0] ?? null;
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const memoryTotal = Number.isFinite(totalMem) ? totalMem : null;
    const memoryUsed = Number.isFinite(totalMem - freeMem) ? totalMem - freeMem : null;
    const swap = process.platform === 'darwin'
      ? parseDarwinSwapUsage()
      : { total: null, used: null };
    const memoryPressure = process.platform === 'darwin'
      ? parseDarwinMemoryPressure()
      : null;

    return {
      observed_at: new Date().toISOString(),
      platform: process.platform,
      cpu_count: cpuCount,
      load_1m: Number.isFinite(load1m) ? load1m : null,
      memory_total_bytes: memoryTotal,
      memory_used_bytes: memoryUsed,
      memory_utilization: safeRatio(memoryUsed, memoryTotal),
      memory_pressure: memoryPressure,
      swap_total_bytes: swap.total,
      swap_used_bytes: swap.used,
      swap_utilization: safeRatio(swap.used, swap.total),
    };
  }
}
