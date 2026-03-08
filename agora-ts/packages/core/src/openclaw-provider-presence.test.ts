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
2026-03-08T07:27:05.292Z [discord] gateway proxy enabled
2026-03-08T07:27:08.000Z [discord] logged in to discord as 1475474396008419490 (Sonnet)
2026-03-08T07:27:12.000Z [discord] gateway: WebSocket connection closed with code 1005
2026-03-08T07:27:20.000Z [whatsapp] [default] auto-restart attempt 1/10 in 5s
2026-03-08T07:27:30.000Z [whatsapp] Listening for personal WhatsApp inbound messages.
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

    expect(source.listHistory()).toEqual([
      {
        occurred_at: '2026-03-08T07:27:01.292Z',
        agent_id: 'sonnet',
        account_id: 'sonnet',
        presence: 'online',
        reason: 'provider_start',
      },
      {
        occurred_at: '2026-03-08T07:22:00.162Z',
        agent_id: 'main',
        account_id: 'main',
        presence: 'disconnected',
        reason: 'health_monitor_restart',
      },
      {
        occurred_at: '2026-03-08T07:17:03.306Z',
        agent_id: 'main',
        account_id: 'main',
        presence: 'online',
        reason: 'provider_start',
      },
    ]);

    expect(source.listSignals()).toEqual([
      {
        occurred_at: '2026-03-08T07:27:30.000Z',
        provider: 'whatsapp',
        agent_id: 'main',
        account_id: null,
        kind: 'inbound_ready',
        severity: 'info',
        detail: 'Listening for personal WhatsApp inbound messages.',
      },
      {
        occurred_at: '2026-03-08T07:27:20.000Z',
        provider: 'whatsapp',
        agent_id: 'main',
        account_id: null,
        kind: 'auto_restart_attempt',
        severity: 'warning',
        detail: '1/10 in 5s',
      },
      {
        occurred_at: '2026-03-08T07:27:12.000Z',
        provider: 'discord',
        agent_id: null,
        account_id: null,
        kind: 'transport_error',
        severity: 'error',
        detail: 'code 1005',
      },
      {
        occurred_at: '2026-03-08T07:27:08.000Z',
        provider: 'discord',
        agent_id: null,
        account_id: '1475474396008419490',
        kind: 'provider_ready',
        severity: 'info',
        detail: 'Sonnet',
      },
      {
        occurred_at: '2026-03-08T07:27:05.292Z',
        provider: 'discord',
        agent_id: null,
        account_id: null,
        kind: 'gateway_proxy_enabled',
        severity: 'info',
        detail: null,
      },
      {
        occurred_at: '2026-03-08T07:27:01.292Z',
        provider: 'discord',
        agent_id: 'sonnet',
        account_id: 'sonnet',
        kind: 'provider_start',
        severity: 'info',
        detail: '@Sonnet',
      },
      {
        occurred_at: '2026-03-08T07:22:00.162Z',
        provider: 'discord',
        agent_id: 'main',
        account_id: 'main',
        kind: 'health_restart',
        severity: 'error',
        detail: 'stuck',
      },
      {
        occurred_at: '2026-03-08T07:17:03.306Z',
        provider: 'discord',
        agent_id: 'main',
        account_id: 'main',
        kind: 'provider_start',
        severity: 'info',
        detail: '@Codex Main',
      },
    ]);
  });
});
