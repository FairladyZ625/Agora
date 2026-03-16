export type CraftsmanRuntimeMode = 'stub' | 'real' | 'watched' | 'tmux' | 'acp';
export type CraftsmanRuntimeTarget = 'server' | 'cli';

const VALID_MODES = new Set<CraftsmanRuntimeMode>(['stub', 'real', 'watched', 'tmux', 'acp']);

export function resolveCraftsmanRuntimeMode(
  target: CraftsmanRuntimeTarget,
  env: NodeJS.ProcessEnv = process.env,
): CraftsmanRuntimeMode {
  const targetSpecific = target === 'server'
    ? env.AGORA_CRAFTSMAN_SERVER_MODE
    : env.AGORA_CRAFTSMAN_CLI_MODE;
  if (targetSpecific && VALID_MODES.has(targetSpecific as CraftsmanRuntimeMode)) {
    return targetSpecific as CraftsmanRuntimeMode;
  }
  const raw = env.AGORA_CRAFTSMAN_ADAPTER_MODE;
  if (raw && VALID_MODES.has(raw as CraftsmanRuntimeMode)) {
    return raw as CraftsmanRuntimeMode;
  }
  return 'acp';
}
