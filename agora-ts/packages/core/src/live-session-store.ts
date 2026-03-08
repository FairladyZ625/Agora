import type { LiveSessionDto } from '@agora-ts/contracts';

export class LiveSessionStore {
  private readonly sessions = new Map<string, LiveSessionDto>();

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
    return Array.from(this.sessions.values()).filter((session) => session.status !== 'closed');
  }

  listAll() {
    return Array.from(this.sessions.values()).sort((a, b) => a.session_key.localeCompare(b.session_key));
  }
}

