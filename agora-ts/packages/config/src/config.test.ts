import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { agoraConfigSchema, defaultAgoraDbPath, parseAgoraConfig } from './index.js';

describe('agora-ts config contracts', () => {
  it('parses the legacy example config into a typed ts config object', () => {
    const raw = JSON.parse(
      readFileSync(resolve(process.cwd(), 'packages/config/agora.example.json'), 'utf8'),
    );

    const parsed = parseAgoraConfig(raw);

    expect(parsed.db_path).toBe(defaultAgoraDbPath());
    expect(parsed.db_busy_timeout_ms).toBe(5000);
    expect(parsed.api_auth.enabled).toBe(false);
    expect(parsed.permissions.archonUsers).toContain('lizeyu');
    expect(parsed.permissions.allowAgents.opus?.canAdvance).toBe(true);
  });

  it('fills defaults for optional config sections', () => {
    const parsed = agoraConfigSchema.parse({});

    expect(parsed.db_path).toBe(defaultAgoraDbPath());
    expect(parsed.db_busy_timeout_ms).toBe(5000);
    expect(parsed.api_auth.enabled).toBe(false);
    expect(parsed.permissions.archonUsers).toEqual([]);
    expect(parsed.permissions.allowAgents['*']?.canAdvance).toBe(false);
    expect(parsed.scheduler.enabled).toBe(true);
    expect(parsed.scheduler.scan_interval_sec).toBe(60);
    expect(parsed.scheduler.task_probe_controller_after_sec).toBe(300);
    expect(parsed.scheduler.task_probe_roster_after_sec).toBe(900);
    expect(parsed.scheduler.task_probe_inbox_after_sec).toBe(1800);
    expect(parsed.scheduler.craftsman_running_after_sec).toBe(300);
    expect(parsed.scheduler.craftsman_waiting_after_sec).toBe(120);
    expect(parsed.scheduler.startup_recovery_on_boot).toBe(true);
    expect(parsed.rate_limit.enabled).toBe(false);
    expect(parsed.dashboard_auth.enabled).toBe(false);
    expect(parsed.craftsmen.max_concurrent_running).toBe(8);
    expect(parsed.craftsmen.max_concurrent_per_agent).toBe(3);
    expect(parsed.craftsmen.host_memory_warning_utilization_limit).toBe(0.75);
    expect(parsed.craftsmen.host_memory_utilization_limit).toBe(0.9);
    expect(parsed.craftsmen.host_swap_warning_utilization_limit).toBe(0.75);
    expect(parsed.craftsmen.host_swap_utilization_limit).toBe(0.9);
    expect(parsed.craftsmen.host_load_per_cpu_warning_limit).toBe(1);
    expect(parsed.craftsmen.host_load_per_cpu_limit).toBe(1.5);
    expect(parsed.craftsmen.isolate_git_worktrees).toBe(false);
    expect(parsed.observability.ready_path).toBe('/ready');
  });

  it('parses explicit scheduler and security settings', () => {
    const parsed = parseAgoraConfig({
      scheduler: {
        enabled: true,
        scan_interval_sec: 30,
        task_probe_controller_after_sec: 120,
        task_probe_roster_after_sec: 240,
        task_probe_inbox_after_sec: 360,
        craftsman_running_after_sec: 90,
        craftsman_waiting_after_sec: 45,
        orphan_scan_on_boot: true,
        startup_recovery_on_boot: false,
      },
      rate_limit: {
        enabled: true,
        window_ms: 60000,
        max_requests: 120,
        write_max_requests: 30,
      },
      dashboard_auth: {
        enabled: true,
        method: 'basic',
        allowed_users: ['lizeyu'],
        session_ttl_hours: 24,
      },
      craftsmen: {
        max_concurrent_running: 3,
        max_concurrent_per_agent: 2,
        host_memory_warning_utilization_limit: 0.7,
        host_memory_utilization_limit: 0.85,
        host_swap_warning_utilization_limit: 0.65,
        host_swap_utilization_limit: 0.8,
        host_load_per_cpu_warning_limit: 0.9,
        host_load_per_cpu_limit: 1.2,
        isolate_git_worktrees: true,
        isolated_root: '/tmp/agora-isolated',
      },
      observability: {
        ready_path: '/ready',
        metrics_enabled: true,
        structured_logs: true,
      },
      db_busy_timeout_ms: 12000,
    });

    expect(parsed.scheduler.scan_interval_sec).toBe(30);
    expect(parsed.scheduler.task_probe_controller_after_sec).toBe(120);
    expect(parsed.scheduler.task_probe_roster_after_sec).toBe(240);
    expect(parsed.scheduler.task_probe_inbox_after_sec).toBe(360);
    expect(parsed.scheduler.craftsman_running_after_sec).toBe(90);
    expect(parsed.scheduler.craftsman_waiting_after_sec).toBe(45);
    expect(parsed.db_busy_timeout_ms).toBe(12000);
    expect(parsed.scheduler.startup_recovery_on_boot).toBe(false);
    expect(parsed.rate_limit.max_requests).toBe(120);
    expect(parsed.dashboard_auth.method).toBe('basic');
    expect(parsed.craftsmen.max_concurrent_running).toBe(3);
    expect(parsed.craftsmen.max_concurrent_per_agent).toBe(2);
    expect(parsed.craftsmen.host_memory_warning_utilization_limit).toBe(0.7);
    expect(parsed.craftsmen.host_memory_utilization_limit).toBe(0.85);
    expect(parsed.craftsmen.host_swap_warning_utilization_limit).toBe(0.65);
    expect(parsed.craftsmen.host_swap_utilization_limit).toBe(0.8);
    expect(parsed.craftsmen.host_load_per_cpu_warning_limit).toBe(0.9);
    expect(parsed.craftsmen.host_load_per_cpu_limit).toBe(1.2);
    expect(parsed.craftsmen.isolate_git_worktrees).toBe(true);
    expect(parsed.craftsmen.isolated_root).toBe('/tmp/agora-isolated');
    expect(parsed.observability.metrics_enabled).toBe(true);
  });

  it('expands db_path values rooted at the user home', () => {
    const parsed = parseAgoraConfig({
      db_path: '~/.agora/agora.db',
    });

    expect(parsed.db_path).toBe(defaultAgoraDbPath());
  });

  it('rejects invalid scheduler or dashboard auth values', () => {
    expect(() =>
      parseAgoraConfig({
        scheduler: {
          enabled: true,
          scan_interval_sec: 0,
        },
      }),
    ).toThrow();

    expect(() =>
      parseAgoraConfig({
        scheduler: {
          enabled: true,
          scan_interval_sec: 2,
        },
      }),
    ).toThrow(/scan_interval_sec/i);

    expect(() =>
      parseAgoraConfig({
        dashboard_auth: {
          enabled: true,
          method: 'oauth3',
        },
      }),
    ).toThrow();
  });

  it('parses session-based dashboard auth settings', () => {
    const parsed = parseAgoraConfig({
      dashboard_auth: {
        enabled: true,
        method: 'session',
        allowed_users: ['lizeyu'],
        session_ttl_hours: 12,
      },
    });

    expect(parsed.dashboard_auth.method).toBe('session');
    expect(parsed.dashboard_auth.session_ttl_hours).toBe(12);
  });
});
