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

function commandPath(argv: string[]) {
  return argv.filter((value) => value.length > 0 && !value.startsWith('-'));
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
    'enoent: no such file or directory',
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
    ' not found',
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

function formatLines(lines: string[]) {
  return lines.join('\n');
}

function subtasksCreateCraftsmanExample() {
  return formatLines([
    'Use a craftsman subtask payload like:',
    '{',
    '  "caller_id": "opus",',
    '  "subtasks": [',
    '    {',
    '      "id": "smoke-build",',
    '      "title": "Smoke build",',
    '      "assignee": "opus",',
    '      "execution_target": "craftsman",',
    '      "craftsman": {',
    '        "adapter": "claude",',
    '        "mode": "one_shot",',
    '        "interaction_expectation": "one_shot",',
    '        "prompt": "Reply with SMOKE_OK and exit.",',
    '        "workdir": "/Users/lizeyu/Projects/Agora"',
    '      }',
    '    }',
    '  ]',
    '}',
    'If you really want a manual-only subtask, set `execution_target` to `manual` explicitly.',
  ]);
}

function craftsmanInputExample(argv: string[]) {
  const executionId = commandPath(argv)[2] ?? '<executionId>';
  return formatLines([
    'Use one of these continuation commands:',
    `- agora craftsman input-text ${executionId} "Continue"`,
    `- agora craftsman input-keys ${executionId} Down Enter`,
    `- agora craftsman submit-choice ${executionId} Down`,
    `- agora craftsman probe ${executionId}`,
  ]);
}

function approvalExample(argv: string[]) {
  const path = commandPath(argv);
  const taskId = path[1] ?? '<taskId>';
  if (path[0] === 'approve') {
    return `Example: agora approve ${taskId} --approver-id admin --comment "ship it"`;
  }
  if (path[0] === 'reject') {
    return `Example: agora reject ${taskId} --rejector-id admin --reason "needs rework"`;
  }
  if (path[0] === 'archon-approve') {
    return `Example: agora archon-approve ${taskId} --reviewer-id admin --comment "ok"`;
  }
  if (path[0] === 'archon-reject') {
    return `Example: agora archon-reject ${taskId} --reviewer-id admin --reason "missing artifact"`;
  }
  return `Example: agora advance ${taskId} --caller-id opus`;
}

function stateRecoveryHint(message: string, argv: string[]) {
  const path = commandPath(argv);
  if (path[0] === 'subtasks' && path[1] === 'create') {
    if (message.includes("execution_target='manual'")) {
      return formatLines([
        'This stage is craftsman-capable and smoke mode requires an explicit craftsman run.',
        subtasksCreateCraftsmanExample(),
        'See `agora subtasks create --help`.',
      ]);
    }
    if (message.includes('requires controller ownership')) {
      return formatLines([
        'Retry with the current controller as `--caller-id`.',
        'If you are unsure who controls the task, run:',
        `- agora status ${path[2] ?? '<taskId>'}`,
      ]);
    }
    if (message.includes('does not allow craftsman dispatch') || message.includes('does not allow execute-mode subtasks')) {
      return formatLines([
        'The current stage does not support this subtask type.',
        `- Check current state: agora status ${path[2] ?? '<taskId>'}`,
        `- Advance when ready: agora advance ${path[2] ?? '<taskId>'} --caller-id <controllerId>`,
      ]);
    }
  }

  if (path[0] === 'craftsman' && ['input-text', 'input-keys', 'submit-choice', 'probe'].includes(path[1] ?? '')) {
    return formatLines([
      'The execution is not in an input-waiting or probeable state for this action.',
      craftsmanInputExample(argv),
      'Check the live state first with `agora craftsman status <executionId>`.',
    ]);
  }

  if (['advance', 'approve', 'reject', 'archon-approve', 'archon-reject'].includes(path[0] ?? '')) {
    return formatLines([
      'The task is not in the expected state for this action.',
      approvalExample(argv),
      `- Inspect the task first: agora status ${path[1] ?? '<taskId>'}`,
    ]);
  }

  if (message.includes('memory pressure') || message.includes('memory utilization') || message.includes('load per cpu') || message.includes('max ')) {
    return formatLines([
      'Craftsman governance blocked this dispatch.',
      '- Inspect governance: agora craftsman governance',
      '- Free resources or reduce concurrency before retrying.',
    ]);
  }

  return 'Check the current task/stage/execution state, then retry with the next valid action.';
}

function usageRecoveryHint(message: string, argv: string[]) {
  const path = commandPath(argv);
  if (path[0] === 'subtasks' && path[1] === 'create') {
    if (message.includes('execution_target') || message.includes('craftsman spec is required') || message.includes('craftsman spec must be omitted')) {
      return formatLines([
        'Every subtask must declare `execution_target` explicitly.',
        subtasksCreateCraftsmanExample(),
        'See `agora subtasks create --help`.',
      ]);
    }
    return formatLines([
      'Expected a JSON file like:',
      '{',
      '  "subtasks": [',
      '    { "id": "smoke-build", "title": "Smoke build", "assignee": "opus", "execution_target": "manual" }',
      '  ]',
      '}',
      'See `agora subtasks create --help`.',
    ]);
  }

  if (path[0] === 'craftsman' && path[1] === 'dispatch') {
    return formatLines([
      'Dispatch requires an adapter, execution mode, and interaction expectation that agree.',
      `Example: agora craftsman dispatch <taskId> <subtaskId> --caller-id opus --adapter claude --mode one_shot --interaction one_shot`,
      'Use `--mode interactive --interaction needs_input` for continued input loops.',
    ]);
  }

  if (path[0] === 'craftsman' && ['input-text', 'input-keys', 'submit-choice'].includes(path[1] ?? '')) {
    return formatLines([
      craftsmanInputExample(argv),
      `See \`agora craftsman ${path[1]} --help\`.`,
    ]);
  }

  return helpHint(argv);
}

function environmentRecoveryHint(message: string, argv: string[]) {
  if (message.includes('database is locked')) {
    return formatLines([
      'Another local process still holds the SQLite write lock.',
      '- Stop overlapping `agora start` / test / script writers.',
      '- Then retry the command.',
      helpHint(argv),
    ]);
  }
  if (message.includes('eaddrinuse')) {
    return formatLines([
      'A required local port is already in use.',
      '- Stop the old dev server or change the configured port.',
      '- Then rerun the command.',
    ]);
  }
  if (message.includes('tmux craftsman input requires a tmux session id') || message.includes("can't find window")) {
    return formatLines([
      'The local tmux craftsman session is missing.',
      '- Check live executions: agora craftsman status <executionId>',
      '- Re-dispatch if the session is gone.',
    ]);
  }
  return 'Check local DB locks, ports, tmux/runtime processes, and filesystem state.';
}

function integrationRecoveryHint(message: string) {
  if (message.includes('adapter')) {
    return formatLines([
      'Supported craftsman adapters in the current dev setup are `codex`, `claude`, and `gemini`.',
      'If you have an alias like `claude_code` or `gemini_cli`, the core will normalize it automatically.',
    ]);
  }
  return 'Check the relevant adapter/runtime configuration and live connectivity.';
}

export function classifyCliError(error: unknown, argv: string[] = []): CliError {
  if (error instanceof CliError) {
    return error;
  }
  const rawMessage = error instanceof Error ? error.message : String(error);
  const message = rawMessage.trim();
  const lower = message.toLowerCase();
  const path = commandPath(argv);

  if (lower.includes('enoent: no such file or directory') && argv.includes('--file')) {
    return new CliError(
      message,
      'usage',
      CLI_EXIT_CODES.usage,
      formatLines([
        'The `--file` path does not exist or is unreadable.',
        `- Check the file path and retry.`,
        path[0] === 'subtasks' && path[1] === 'create'
          ? 'Expected a JSON file with a top-level `subtasks` array.'
          : helpHint(argv),
      ]),
    );
  }

  if (lower.includes('craftsman execution') && lower.includes('not found')) {
    return new CliError(
      message,
      'state',
      CLI_EXIT_CODES.state,
      formatLines([
        'The execution id is unknown in the current database.',
        '- Check the task conversation or `agora craftsman history <taskId> <subtaskId>`.',
        '- If you reset `~/.agora/agora.db`, old execution ids are expected to disappear.',
      ]),
    );
  }

  if (looksLikeUsageError(lower)) {
    return new CliError(message, 'usage', CLI_EXIT_CODES.usage, usageRecoveryHint(lower, argv));
  }
  if (looksLikeStateError(lower)) {
    return new CliError(message, 'state', CLI_EXIT_CODES.state, stateRecoveryHint(lower, argv));
  }
  if (looksLikeEnvironmentError(lower)) {
    return new CliError(message, 'environment', CLI_EXIT_CODES.environment, environmentRecoveryHint(lower, argv));
  }
  if (looksLikeIntegrationError(lower)) {
    return new CliError(message, 'integration', CLI_EXIT_CODES.integration, integrationRecoveryHint(lower));
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
