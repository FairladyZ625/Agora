import { describe, expect, it } from 'vitest';
import { ClaudeCraftsmanAdapter, CodexCraftsmanAdapter, GeminiCraftsmanAdapter } from './adapters/index.js';
import { createDefaultCraftsmanAdapters } from './default-craftsman-adapters.js';
import { ShellCraftsmanAdapter, StubCraftsmanAdapter } from './craftsman-adapter.js';

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
});
