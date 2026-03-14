export const CLI_EXIT_CODES = {
  usage: 2,
  state: 3,
  environment: 4,
  integration: 5,
  unknown: 1,
} as const;

export type CliErrorKind = 'usage' | 'state' | 'environment' | 'integration' | 'unknown';

export class CliError extends Error {
  constructor(
    message: string,
    readonly kind: CliErrorKind,
    readonly exitCode: number,
    readonly hint?: string,
  ) {
    super(message);
    this.name = 'CliError';
  }
}

function firstArg(argv: string[]) {
  return argv.find((value) => value.length > 0 && !value.startsWith('-')) ?? null;
}

function helpHint(argv: string[]) {
  const command = firstArg(argv);
  return command ? `Try \`agora ${command} --help\`.` : 'Try `agora --help`.';
}

function looksLikeUsageError(message: string) {
  return [
    'invalid json',
    'invalid --bind value',
    'cannot apply --controller/--bind',
    'graph command requires --template or --file',
    'unknown stage id',
    'unknown --before target',
    'unknown --after target',
    'stage move requires --before or --after',
    'role not found',
    'template role',
    'craftsman spec is required',
    'craftsman spec must be omitted',
    'execution_target',
    'unsupported graph render format',
  ].some((needle) => message.includes(needle));
}

function looksLikeStateError(message: string) {
  return [
    "expected 'active'",
    'has no current_stage set',
    'requires controller ownership',
    'does not allow',
    'already terminal',
    'already promoted',
    'invalid transition',
    'is missing workflow stage',
    'execution_mode=',
    'is not waiting for input',
    'subtask id',
    'gate check failed',
    'max ',
    'memory utilization',
    'memory pressure',
    'load per cpu',
  ].some((needle) => message.includes(needle));
}

function looksLikeEnvironmentError(message: string) {
  return [
    'database is locked',
    'eaddrinuse',
    'eexist',
    '未找到 agora 项目根目录',
    'tmux craftsman input requires a tmux session id',
    'tmux craftsman input does not support adapter',
    'can\'t find window',
  ].some((needle) => message.includes(needle));
}

function looksLikeIntegrationError(message: string) {
  return [
    'not configured',
    'adapter',
    'discord',
    'callback',
    'provision',
    'session cookie missing',
    'watched adapter failed to start watcher',
  ].some((needle) => message.includes(needle));
}

export function classifyCliError(error: unknown, argv: string[] = []): CliError {
  if (error instanceof CliError) {
    return error;
  }
  const rawMessage = error instanceof Error ? error.message : String(error);
  const message = rawMessage.trim();
  const lower = message.toLowerCase();

  if (looksLikeUsageError(lower)) {
    return new CliError(message, 'usage', CLI_EXIT_CODES.usage, helpHint(argv));
  }
  if (looksLikeStateError(lower)) {
    return new CliError(
      message,
      'state',
      CLI_EXIT_CODES.state,
      'Check the current task/stage/execution state, then retry with the next valid action.',
    );
  }
  if (looksLikeEnvironmentError(lower)) {
    return new CliError(
      message,
      'environment',
      CLI_EXIT_CODES.environment,
      'Check local DB locks, ports, tmux/runtime processes, and filesystem state.',
    );
  }
  if (looksLikeIntegrationError(lower)) {
    return new CliError(
      message,
      'integration',
      CLI_EXIT_CODES.integration,
      'Check the relevant adapter/runtime configuration and live connectivity.',
    );
  }
  return new CliError(message, 'unknown', CLI_EXIT_CODES.unknown);
}

export function renderCliError(error: unknown, argv: string[] = []) {
  const classified = classifyCliError(error, argv);
  const title = {
    usage: 'Usage Error',
    state: 'State Error',
    environment: 'Environment Error',
    integration: 'Integration Error',
    unknown: 'CLI Error',
  }[classified.kind];

  return [
    `${title}: ${classified.message}`,
    ...(classified.hint ? [`Hint: ${classified.hint}`] : []),
  ].join('\n');
}

