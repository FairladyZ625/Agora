import { describe, expect, it } from 'vitest';
import { ShellCraftsmanAdapter, StubCraftsmanAdapter } from '@agora-ts/core';
import { AcpCraftsmanAdapter, ClaudeCraftsmanAdapter, CodexCraftsmanAdapter, GeminiCraftsmanAdapter, WatchedProcessCraftsmanAdapter } from '@agora-ts/adapters-craftsman';
import { createDefaultCraftsmanAdapters } from './default-craftsman-adapters.js';
import { TmuxCraftsmanAdapter } from './tmux-craftsman-adapter.js';

describe('default craftsman adapters', () => {
  it('returns stub adapters by default', () => {
    const adapters = createDefaultCraftsmanAdapters();

    expect(adapters.shell).toBeInstanceOf(ShellCraftsmanAdapter);
    expect(adapters.codex).toBeInstanceOf(StubCraftsmanAdapter);
    expect(adapters.claude).toBeInstanceOf(StubCraftsmanAdapter);
    expect(adapters.gemini).toBeInstanceOf(StubCraftsmanAdapter);
  });

  it('returns real adapters when adapter mode is real', () => {
    const adapters = createDefaultCraftsmanAdapters({ mode: 'real' });

    expect(adapters.codex).toBeInstanceOf(CodexCraftsmanAdapter);
    expect(adapters.claude).toBeInstanceOf(ClaudeCraftsmanAdapter);
    expect(adapters.gemini).toBeInstanceOf(GeminiCraftsmanAdapter);
  });

  it('returns watched adapters when adapter mode is watched', () => {
    const adapters = createDefaultCraftsmanAdapters({
      mode: 'watched',
      callbackUrl: 'http://127.0.0.1:18420/api/craftsmen/callback',
    });

    expect(adapters.codex).toBeInstanceOf(WatchedProcessCraftsmanAdapter);
    expect(adapters.claude).toBeInstanceOf(WatchedProcessCraftsmanAdapter);
    expect(adapters.gemini).toBeInstanceOf(WatchedProcessCraftsmanAdapter);
  });

  it('returns tmux adapters when adapter mode is tmux', () => {
    const adapters = createDefaultCraftsmanAdapters({ mode: 'tmux' });

    expect(adapters.codex).toBeInstanceOf(TmuxCraftsmanAdapter);
    expect(adapters.claude).toBeInstanceOf(TmuxCraftsmanAdapter);
    expect(adapters.gemini).toBeInstanceOf(TmuxCraftsmanAdapter);
  });

  it('returns acp adapters when adapter mode is acp', () => {
    const adapters = createDefaultCraftsmanAdapters({
      mode: 'acp',
      callbackUrl: 'http://127.0.0.1:18420/api/craftsmen/callback',
    });

    expect(adapters.codex).toBeInstanceOf(AcpCraftsmanAdapter);
    expect(adapters.claude).toBeInstanceOf(AcpCraftsmanAdapter);
    expect(adapters.gemini).toBeInstanceOf(AcpCraftsmanAdapter);
  });
});
