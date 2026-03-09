import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { agoraConfigSchema, parseAgoraConfig } from './index.js';

describe('agora-ts config contracts', () => {
  it('parses the legacy example config into a typed ts config object', () => {
    const raw = JSON.parse(
      readFileSync(resolve(process.cwd(), '../agora/config/agora.example.json'), 'utf8'),
    );

    const parsed = parseAgoraConfig(raw);

    expect(parsed.db_path).toBe('tasks.db');
    expect(parsed.api_auth.enabled).toBe(false);
    expect(parsed.permissions.archonUsers).toContain('lizeyu');
    expect(parsed.permissions.allowAgents.opus?.canAdvance).toBe(true);
  });

  it('fills defaults for optional config sections', () => {
    const parsed = agoraConfigSchema.parse({});

    expect(parsed.db_path).toBe('tasks.db');
    expect(parsed.api_auth.enabled).toBe(false);
    expect(parsed.permissions.archonUsers).toEqual([]);
    expect(parsed.permissions.allowAgents['*']?.canAdvance).toBe(false);
    expect(parsed.scheduler.enabled).toBe(true);
    expect(parsed.scheduler.scan_interval_sec).toBe(60);
    expect(parsed.scheduler.startup_recovery_on_boot).toBe(true);
    expect(parsed.rate_limit.enabled).toBe(false);
    expect(parsed.dashboard_auth.enabled).toBe(false);
    expect(parsed.craftsmen.max_concurrent_running).toBe(8);
    expect(parsed.craftsmen.isolate_git_worktrees).toBe(false);
    expect(parsed.observability.ready_path).toBe('/ready');
  });

  it('parses explicit scheduler and security settings', () => {
    const parsed = parseAgoraConfig({
      scheduler: {
        enabled: true,
        scan_interval_sec: 30,
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
        isolate_git_worktrees: true,
        isolated_root: '/tmp/agora-isolated',
      },
      observability: {
        ready_path: '/ready',
        metrics_enabled: true,
        structured_logs: true,
      },
    });

    expect(parsed.scheduler.scan_interval_sec).toBe(30);
    expect(parsed.scheduler.startup_recovery_on_boot).toBe(false);
    expect(parsed.rate_limit.max_requests).toBe(120);
    expect(parsed.dashboard_auth.method).toBe('basic');
    expect(parsed.craftsmen.max_concurrent_running).toBe(3);
    expect(parsed.craftsmen.isolate_git_worktrees).toBe(true);
    expect(parsed.craftsmen.isolated_root).toBe('/tmp/agora-isolated');
    expect(parsed.observability.metrics_enabled).toBe(true);
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
});
