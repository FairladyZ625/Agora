import { describe, expect, it } from 'vitest';
import { LiveSessionStore } from './live-session-store.js';

describe('live session store', () => {
  it('tracks active sessions and marks them closed when ended', () => {
    const store = new LiveSessionStore();

    store.upsert({
      source: 'openclaw',
      agent_id: 'main',
      session_key: 'agent:main:discord:channel:alerts',
      channel: 'discord',
      conversation_id: 'alerts',
      thread_id: 'thread-1',
      status: 'active',
      last_event: 'session_start',
      last_event_at: '2026-03-08T06:00:00.000Z',
      metadata: { trigger: 'user' },
    });

    expect(store.listActive()).toMatchObject([
      expect.objectContaining({
        agent_id: 'main',
        channel: 'discord',
        status: 'active',
      }),
    ]);

    store.end('agent:main:discord:channel:alerts', '2026-03-08T06:05:00.000Z', 'session_end');

    expect(store.listActive()).toEqual([]);
    expect(store.listAll()).toMatchObject([
      expect.objectContaining({
        session_key: 'agent:main:discord:channel:alerts',
        status: 'closed',
        last_event: 'session_end',
      }),
    ]);
  });
});
