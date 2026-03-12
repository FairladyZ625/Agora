import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { OpenClawAgentRegistry } from './agent-registry.js';

const tempDirs: string[] = [];

function makeConfigFile(payload: unknown) {
  const dir = mkdtempSync(join(tmpdir(), 'openclaw-registry-test-'));
  tempDirs.push(dir);
  const path = join(dir, 'openclaw.json');
  writeFileSync(path, JSON.stringify(payload, null, 2));
  return path;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('OpenClawAgentRegistry', () => {
  it('unions agents.list and channel accounts into one inventory', () => {
    const configPath = makeConfigFile({
      agents: {
        list: [
          {
            id: 'main',
            workspace: '/tmp/main',
            model: { primary: 'openai-codex/gpt-5.4' },
          },
          {
            id: 'sonnet',
            workspace: '/tmp/sonnet',
            model: { primary: 'gac/claude-sonnet-4-6' },
            agora: {
              managed: true,
            },
          },
        ],
      },
      channels: {
        discord: {
          accounts: {
            main: { token: 'main-token' },
            review: { token: 'review-token' },
            writer: { token: 'writer-token' },
            default: {},
          },
        },
      },
    });

    const registry = new OpenClawAgentRegistry({ configPath });

    expect(registry.listAgents()).toEqual([
      {
        id: 'main',
        host_framework: 'openclaw',
        channel_providers: ['discord'],
        inventory_sources: ['discord', 'openclaw'],
        primary_model: 'openai-codex/gpt-5.4',
        workspace_dir: '/tmp/main',
      },
      {
        id: 'review',
        host_framework: null,
        channel_providers: ['discord'],
        inventory_sources: ['discord'],
        primary_model: null,
        workspace_dir: null,
      },
      {
        id: 'sonnet',
        host_framework: 'openclaw',
        channel_providers: [],
        inventory_sources: ['openclaw'],
        primary_model: 'gac/claude-sonnet-4-6',
        workspace_dir: '/tmp/sonnet',
        agent_origin: 'agora_managed',
        briefing_mode: 'overlay_delta',
      },
      {
        id: 'writer',
        host_framework: null,
        channel_providers: ['discord'],
        inventory_sources: ['discord'],
        primary_model: null,
        workspace_dir: null,
      },
    ]);
  });

  it('returns an empty inventory when the config file is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'openclaw-registry-missing-'));
    tempDirs.push(dir);
    const registry = new OpenClawAgentRegistry({ configPath: join(dir, 'missing.json') });

    expect(registry.listAgents()).toEqual([]);
  });
});
