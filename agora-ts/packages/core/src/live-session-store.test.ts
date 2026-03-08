import { describe, expect, it } from 'vitest';
import { LiveSessionStore } from './live-session-store.js';

describe('live session store', () => {
  it('tracks active sessions and marks them closed when ended', () => {
    const store = new LiveSessionStore({
      staleAfterMs: 60_000,
      now: () => new Date('2026-03-08T06:00:30.000Z'),
    });

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

  it('automatically closes stale sessions when their last event is beyond the ttl window', () => {
    const store = new LiveSessionStore({
      staleAfterMs: 60_000,
      now: () => new Date('2026-03-08T06:02:00.000Z'),
    });

    store.upsert({
      source: 'openclaw',
      agent_id: 'main',
      session_key: 'agent:main:discord:channel:alerts',
      channel: 'discord',
      conversation_id: 'alerts',
      thread_id: 'thread-1',
      status: 'active',
      last_event: 'message_received',
      last_event_at: '2026-03-08T06:00:00.000Z',
      metadata: { trigger: 'user' },
    });

    expect(store.listActive()).toEqual([]);
    expect(store.listAll()).toMatchObject([
      expect.objectContaining({
        session_key: 'agent:main:discord:channel:alerts',
        status: 'closed',
        last_event: 'stale_timeout',
      }),
    ]);
  });

  it('returns the number of stale sessions cleaned by manual cleanup', () => {
    const store = new LiveSessionStore({
      staleAfterMs: 60_000,
      now: () => new Date('2026-03-08T06:02:00.000Z'),
    });

    store.upsert({
      source: 'openclaw',
      agent_id: 'main',
      session_key: 'agent:main:discord:channel:alerts',
      channel: 'discord',
      conversation_id: 'alerts',
      thread_id: null,
      status: 'active',
      last_event: 'session_start',
      last_event_at: '2026-03-08T06:00:00.000Z',
      metadata: {},
    });
    store.upsert({
      source: 'openclaw',
      agent_id: 'review',
      session_key: 'agent:review:discord:channel:triage',
      channel: 'discord',
      conversation_id: 'triage',
      thread_id: null,
      status: 'active',
      last_event: 'session_start',
      last_event_at: '2026-03-08T06:01:45.000Z',
      metadata: {},
    });

    expect(store.cleanupStale()).toBe(1);
    expect(store.listAll()).toMatchObject([
      expect.objectContaining({
        session_key: 'agent:main:discord:channel:alerts',
        status: 'closed',
        last_event: 'stale_timeout',
      }),
      expect.objectContaining({
        session_key: 'agent:review:discord:channel:triage',
        status: 'active',
      }),
    ]);
  });
});
