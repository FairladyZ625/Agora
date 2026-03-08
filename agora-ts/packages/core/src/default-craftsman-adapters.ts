import type { CraftsmanAdapter } from './craftsman-adapter.js';
import { ShellCraftsmanAdapter, StubCraftsmanAdapter } from './craftsman-adapter.js';
import { ClaudeCraftsmanAdapter, CodexCraftsmanAdapter, GeminiCraftsmanAdapter } from './adapters/index.js';

export interface CreateDefaultCraftsmanAdaptersOptions {
  mode?: 'stub' | 'real';
}

export function createDefaultCraftsmanAdapters(
  options: CreateDefaultCraftsmanAdaptersOptions = {},
): Record<string, CraftsmanAdapter> {
  const mode = options.mode ?? 'stub';
  if (mode === 'real') {
    return {
      shell: new ShellCraftsmanAdapter(),
      codex: new CodexCraftsmanAdapter(),
      claude: new ClaudeCraftsmanAdapter(),
      gemini: new GeminiCraftsmanAdapter(),
    };
  }

  return {
    shell: new ShellCraftsmanAdapter(),
    codex: new StubCraftsmanAdapter('codex'),
    claude: new StubCraftsmanAdapter('claude'),
    gemini: new StubCraftsmanAdapter('gemini'),
  };
}
