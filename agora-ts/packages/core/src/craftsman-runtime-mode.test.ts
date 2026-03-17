import { describe, expect, it } from 'vitest';
import { resolveCraftsmanRuntimeMode } from './craftsman-runtime-mode.js';

describe('craftsman runtime mode', () => {
  it('prefers explicit environment override when valid', () => {
    expect(resolveCraftsmanRuntimeMode('server', {
      AGORA_CRAFTSMAN_ADAPTER_MODE: 'tmux',
    })).toBe('tmux');
    expect(resolveCraftsmanRuntimeMode('cli', {
      AGORA_CRAFTSMAN_ADAPTER_MODE: 'real',
    })).toBe('real');
    expect(resolveCraftsmanRuntimeMode('cli', {
      AGORA_CRAFTSMAN_ADAPTER_MODE: 'acp',
    })).toBe('acp');
  });

  it('prefers target-specific overrides over the shared fallback', () => {
    expect(resolveCraftsmanRuntimeMode('server', {
      AGORA_CRAFTSMAN_ADAPTER_MODE: 'real',
      AGORA_CRAFTSMAN_SERVER_MODE: 'watched',
    })).toBe('watched');
    expect(resolveCraftsmanRuntimeMode('cli', {
      AGORA_CRAFTSMAN_ADAPTER_MODE: 'real',
      AGORA_CRAFTSMAN_CLI_MODE: 'tmux',
    })).toBe('tmux');
  });

  it('falls back to target-specific defaults when unset or invalid', () => {
    expect(resolveCraftsmanRuntimeMode('server', {})).toBe('acp');
    expect(resolveCraftsmanRuntimeMode('cli', {})).toBe('acp');
    expect(resolveCraftsmanRuntimeMode('server', {
      AGORA_CRAFTSMAN_ADAPTER_MODE: 'unknown',
    })).toBe('acp');
  });
});
