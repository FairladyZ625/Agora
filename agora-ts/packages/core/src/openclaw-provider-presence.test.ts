import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { OpenClawLogPresenceSource } from './openclaw-provider-presence.js';

const tempPaths: string[] = [];

function makeLogPath(contents: string) {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-presence-'));
  tempPaths.push(dir);
  const logPath = join(dir, 'gateway.log');
  writeFileSync(logPath, contents, 'utf8');
  return logPath;
}

afterEach(() => {
  while (tempPaths.length > 0) {
    const dir = tempPaths.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('openclaw provider presence', () => {
  it('parses latest online and disconnected provider events from gateway logs', () => {
    const source = new OpenClawLogPresenceSource({
      staleAfterMs: 5 * 60 * 1000,
      now: () => new Date('2026-03-08T07:40:00.000Z'),
      logPath: makeLogPath(`
2026-03-08T07:17:03.306Z [discord] [main] starting provider (@Codex Main)
2026-03-08T07:22:00.162Z [health-monitor] [discord:main] health-monitor: restarting (reason: stuck)
2026-03-08T07:27:01.292Z [discord] [sonnet] starting provider (@Sonnet)
      `.trim()),
    });

    expect(source.listPresence()).toEqual([
      {
        agent_id: 'main',
        presence: 'disconnected',
        reason: 'health_monitor_restart',
        provider: 'discord',
        account_id: 'main',
        last_seen_at: '2026-03-08T07:22:00.162Z',
      },
      {
        agent_id: 'sonnet',
        presence: 'stale',
        reason: 'stale_gateway_log',
        provider: 'discord',
        account_id: 'sonnet',
        last_seen_at: '2026-03-08T07:27:01.292Z',
      },
    ]);
  });
});
