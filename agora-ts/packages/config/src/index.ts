import { existsSync, readFileSync } from 'node:fs';
import { z } from 'zod';
export * from './dev-start.js';
export * from './env.js';

export const agentPermissionSchema = z.object({
  canCall: z.array(z.string()).default([]),
  canAdvance: z.boolean().default(false),
});
export type AgentPermission = z.infer<typeof agentPermissionSchema>;

export const apiAuthSchema = z.object({
  enabled: z.boolean().default(false),
  token: z.string().min(1).default('change-me'),
});
export type ApiAuthConfig = z.infer<typeof apiAuthSchema>;

export const schedulerConfigSchema = z.object({
  enabled: z.boolean().default(true),
  scan_interval_sec: z.number().int().min(5, 'scheduler.scan_interval_sec must be >= 5').default(60),
  orphan_scan_on_boot: z.boolean().default(false),
  startup_recovery_on_boot: z.boolean().default(true),
});
export type SchedulerConfig = z.infer<typeof schedulerConfigSchema>;

export const rateLimitSchema = z.object({
  enabled: z.boolean().default(false),
  window_ms: z.number().int().positive().default(60_000),
  max_requests: z.number().int().positive().default(120),
  write_max_requests: z.number().int().positive().default(30),
});
export type RateLimitConfig = z.infer<typeof rateLimitSchema>;

export const dashboardAuthSchema = z.object({
  enabled: z.boolean().default(false),
  method: z.enum(['basic', 'oauth2']).default('basic'),
  allowed_users: z.array(z.string().min(1)).default([]),
  session_ttl_hours: z.number().int().positive().default(24),
});
export type DashboardAuthConfig = z.infer<typeof dashboardAuthSchema>;

export const craftsmenConfigSchema = z.object({
  max_concurrent_running: z.number().int().positive().default(8),
  isolate_git_worktrees: z.boolean().default(false),
  isolated_root: z.string().default('.agora-ts/craftsman-workdirs'),
});
export type CraftsmenConfig = z.infer<typeof craftsmenConfigSchema>;

export const observabilityConfigSchema = z.object({
  ready_path: z.string().startsWith('/').default('/ready'),
  metrics_enabled: z.boolean().default(false),
  structured_logs: z.boolean().default(false),
});
export type ObservabilityConfig = z.infer<typeof observabilityConfigSchema>;

export const permissionsSchema = z.object({
  allowAgents: z.record(z.string(), agentPermissionSchema).default({
    '*': { canCall: [], canAdvance: false },
  }),
  archonUsers: z.array(z.string()).default([]),
}).transform((value) => ({
  ...value,
  allowAgents: value.allowAgents['*']
    ? value.allowAgents
    : { ...value.allowAgents, '*': { canCall: [], canAdvance: false } },
}));
export type PermissionsConfig = z.infer<typeof permissionsSchema>;

export const agoraConfigSchema = z.object({
  db_path: z.string().default('tasks.db'),
  api_auth: apiAuthSchema.default({ enabled: false, token: 'change-me' }),
  permissions: permissionsSchema.default({
    allowAgents: { '*': { canCall: [], canAdvance: false } },
    archonUsers: [],
  }),
  scheduler: schedulerConfigSchema.default({
    enabled: true,
    scan_interval_sec: 60,
    orphan_scan_on_boot: false,
    startup_recovery_on_boot: true,
  }),
  rate_limit: rateLimitSchema.default({
    enabled: false,
    window_ms: 60_000,
    max_requests: 120,
    write_max_requests: 30,
  }),
  dashboard_auth: dashboardAuthSchema.default({
    enabled: false,
    method: 'basic',
    allowed_users: [],
    session_ttl_hours: 24,
  }),
  craftsmen: craftsmenConfigSchema.default({
    max_concurrent_running: 8,
    isolate_git_worktrees: false,
    isolated_root: '.agora-ts/craftsman-workdirs',
  }),
  observability: observabilityConfigSchema.default({
    ready_path: '/ready',
    metrics_enabled: false,
    structured_logs: false,
  }),
});
export type AgoraConfig = z.infer<typeof agoraConfigSchema>;

export function parseAgoraConfig(raw: unknown): AgoraConfig {
  return agoraConfigSchema.parse(raw);
}

export function loadAgoraConfig(path: string): AgoraConfig {
  if (!existsSync(path)) {
    return agoraConfigSchema.parse({});
  }
  return parseAgoraConfig(JSON.parse(readFileSync(path, 'utf8')));
}
