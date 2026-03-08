import type { CraftsmanAdapter } from './craftsman-adapter.js';
import { ShellCraftsmanAdapter, StubCraftsmanAdapter } from './craftsman-adapter.js';
import { ClaudeCraftsmanAdapter, CodexCraftsmanAdapter, GeminiCraftsmanAdapter, TmuxCraftsmanAdapter, WatchedProcessCraftsmanAdapter } from './adapters/index.js';

export interface CreateDefaultCraftsmanAdaptersOptions {
  mode?: 'stub' | 'real' | 'watched' | 'tmux';
  callbackUrl?: string;
  apiToken?: string | null;
}

export function createDefaultCraftsmanAdapters(
  options: CreateDefaultCraftsmanAdaptersOptions = {},
): Record<string, CraftsmanAdapter> {
  const mode = options.mode ?? 'stub';
  if (mode === 'watched') {
    if (!options.callbackUrl) {
      throw new Error('watched adapter mode requires callbackUrl');
    }
    return {
      shell: new ShellCraftsmanAdapter(),
      codex: new WatchedProcessCraftsmanAdapter(new CodexCraftsmanAdapter(), {
        callbackUrl: options.callbackUrl,
        apiToken: options.apiToken ?? null,
      }),
      claude: new WatchedProcessCraftsmanAdapter(new ClaudeCraftsmanAdapter(), {
        callbackUrl: options.callbackUrl,
        apiToken: options.apiToken ?? null,
      }),
      gemini: new WatchedProcessCraftsmanAdapter(new GeminiCraftsmanAdapter(), {
        callbackUrl: options.callbackUrl,
        apiToken: options.apiToken ?? null,
      }),
    };
  }
  if (mode === 'real') {
    return {
      shell: new ShellCraftsmanAdapter(),
      codex: new CodexCraftsmanAdapter(),
      claude: new ClaudeCraftsmanAdapter(),
      gemini: new GeminiCraftsmanAdapter(),
    };
  }
  if (mode === 'tmux') {
    return {
      shell: new ShellCraftsmanAdapter(),
      codex: new TmuxCraftsmanAdapter(new CodexCraftsmanAdapter()),
      claude: new TmuxCraftsmanAdapter(new ClaudeCraftsmanAdapter()),
      gemini: new TmuxCraftsmanAdapter(new GeminiCraftsmanAdapter()),
    };
  }

  return {
    shell: new ShellCraftsmanAdapter(),
    codex: new StubCraftsmanAdapter('codex'),
    claude: new StubCraftsmanAdapter('claude'),
    gemini: new StubCraftsmanAdapter('gemini'),
  };
}
