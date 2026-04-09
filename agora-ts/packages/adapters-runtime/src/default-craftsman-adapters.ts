import type { AcpRuntimePort, CraftsmanAdapter } from '@agora-ts/core';
import { ShellCraftsmanAdapter, StubCraftsmanAdapter } from '@agora-ts/core';
import { AcpCraftsmanAdapter, ClaudeCraftsmanAdapter, CodexCraftsmanAdapter, GeminiCraftsmanAdapter, WatchedProcessCraftsmanAdapter } from '@agora-ts/adapters-craftsman';
import { DirectAcpxRuntimePort } from './direct-acpx-runtime-port.js';
import { TmuxCraftsmanAdapter } from './tmux-craftsman-adapter.js';

export interface CreateDefaultCraftsmanAdaptersOptions {
  mode?: 'stub' | 'real' | 'watched' | 'tmux' | 'acp';
  callbackUrl?: string;
  apiToken?: string | null;
  acpRuntime?: AcpRuntimePort;
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
  if (mode === 'acp') {
    if (!options.callbackUrl) {
      throw new Error('acp adapter mode requires callbackUrl');
    }
    const runtime = options.acpRuntime ?? new DirectAcpxRuntimePort();
    return {
      shell: new ShellCraftsmanAdapter(),
      codex: new AcpCraftsmanAdapter('codex', {
        runtime,
        callbackUrl: options.callbackUrl,
        apiToken: options.apiToken ?? null,
      }),
      claude: new AcpCraftsmanAdapter('claude', {
        runtime,
        callbackUrl: options.callbackUrl,
        apiToken: options.apiToken ?? null,
      }),
      gemini: new AcpCraftsmanAdapter('gemini', {
        runtime,
        callbackUrl: options.callbackUrl,
        apiToken: options.apiToken ?? null,
      }),
    };
  }

  return {
    shell: new ShellCraftsmanAdapter(),
    codex: new StubCraftsmanAdapter('codex'),
    claude: new StubCraftsmanAdapter('claude'),
    gemini: new StubCraftsmanAdapter('gemini'),
  };
}
