import { existsSync, readFileSync } from 'node:fs';
import { z } from 'zod';
export * from './dev-start.js';

export const agentPermissionSchema = z.object({
  canCall: z.array(z.string()).default([]),
  canAdvance: z.boolean().default(false),
});
export type AgentPermission = z.infer<typeof agentPermissionSchema>;

export const apiAuthSchema = z.object({
  enabled: z.boolean().default(false),
  token: z.string().default('change-me'),
});
export type ApiAuthConfig = z.infer<typeof apiAuthSchema>;

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
