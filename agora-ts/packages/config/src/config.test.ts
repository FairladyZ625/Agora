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
  });
});
