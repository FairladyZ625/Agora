import type { LiveSessionDto } from '@agora-ts/contracts';

export interface LiveSessionStoreOptions {
  staleAfterMs?: number;
  now?: () => Date;
}

export class LiveSessionStore {
  private readonly sessions = new Map<string, LiveSessionDto>();
  private readonly staleAfterMs: number;
  private readonly now: () => Date;

  constructor(options: LiveSessionStoreOptions = {}) {
    this.staleAfterMs = options.staleAfterMs ?? 15 * 60 * 1000;
    this.now = options.now ?? (() => new Date());
  }

  upsert(session: LiveSessionDto) {
    this.sessions.set(session.session_key, session);
    return session;
  }

  end(sessionKey: string, endedAt: string, event = 'session_end') {
    const current = this.sessions.get(sessionKey);
    if (!current) {
      return null;
    }
    const next: LiveSessionDto = {
      ...current,
      status: 'closed',
      last_event: event,
      last_event_at: endedAt,
    };
    this.sessions.set(sessionKey, next);
    return next;
  }

  listActive() {
    this.cleanupStale();
    return Array.from(this.sessions.values()).filter((session) => session.status !== 'closed');
  }

  listAll() {
    this.cleanupStale();
    return Array.from(this.sessions.values()).sort((a, b) => a.session_key.localeCompare(b.session_key));
  }

  cleanupStale() {
    let cleaned = 0;
    for (const session of this.sessions.values()) {
      if (session.status === 'closed') {
        continue;
      }
      const ageMs = this.now().getTime() - new Date(session.last_event_at).getTime();
      if (!Number.isFinite(ageMs) || ageMs < this.staleAfterMs) {
        continue;
      }
      this.sessions.set(session.session_key, {
        ...session,
        status: 'closed',
        last_event: 'stale_timeout',
        last_event_at: this.now().toISOString(),
      });
      cleaned += 1;
    }
    return cleaned;
  }
}
