export type CraftsmanRuntimeMode = 'stub' | 'real' | 'watched' | 'tmux';
export type CraftsmanRuntimeTarget = 'server' | 'cli';

const VALID_MODES = new Set<CraftsmanRuntimeMode>(['stub', 'real', 'watched', 'tmux']);

export function resolveCraftsmanRuntimeMode(
  target: CraftsmanRuntimeTarget,
  env: NodeJS.ProcessEnv = process.env,
): CraftsmanRuntimeMode {
  const raw = env.AGORA_CRAFTSMAN_ADAPTER_MODE;
  if (raw && VALID_MODES.has(raw as CraftsmanRuntimeMode)) {
    return raw as CraftsmanRuntimeMode;
  }
  return target === 'server' ? 'watched' : 'tmux';
}
