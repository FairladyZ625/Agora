export interface HostResourceSnapshot {
  observed_at: string;
  cpu_count: number | null;
  load_1m: number | null;
  memory_total_bytes: number | null;
  memory_used_bytes: number | null;
  memory_utilization: number | null;
  swap_total_bytes: number | null;
  swap_used_bytes: number | null;
  swap_utilization: number | null;
}

export interface HostResourcePort {
  readSnapshot(): HostResourceSnapshot | null;
}
