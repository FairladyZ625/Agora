import { cliText, resolveCliLocale, type CliLocale } from './locale.js';

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

function helpHint(argv: string[], locale: CliLocale) {
  const command = firstArg(argv);
  return command
    ? cliText(locale, `试试 \`agora ${command} --help\`。`, `Try \`agora ${command} --help\`.`)
    : cliText(locale, '试试 `agora --help`。', 'Try `agora --help`.');
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

function subtasksCreateCraftsmanExample(locale: CliLocale) {
  return formatLines([
    cliText(locale, '可以按下面的 craftsman subtask payload 写：', 'Use a craftsman subtask payload like:'),
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
    cliText(
      locale,
      '如果你真的想创建纯手动 subtask，就必须显式写 `execution_target` 为 `manual`。',
      'If you really want a manual-only subtask, set `execution_target` to `manual` explicitly.',
    ),
  ]);
}

function craftsmanInputExample(argv: string[], locale: CliLocale) {
  const executionId = commandPath(argv)[2] ?? '<executionId>';
  return formatLines([
    cliText(locale, '继续 execution 时可以直接用这些命令：', 'Use one of these continuation commands:'),
    `- agora craftsman input-text ${executionId} "Continue"`,
    `- agora craftsman input-keys ${executionId} Down Enter`,
    `- agora craftsman submit-choice ${executionId} Down`,
    `- agora craftsman probe ${executionId}`,
  ]);
}

function approvalExample(argv: string[], locale: CliLocale) {
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
  return cliText(
    locale,
    `示例：agora advance ${taskId} --caller-id opus`,
    `Example: agora advance ${taskId} --caller-id opus`,
  );
}

function stateRecoveryHint(message: string, argv: string[], locale: CliLocale) {
  const path = commandPath(argv);
  if (path[0] === 'subtasks' && path[1] === 'create') {
    if (message.includes("execution_target='manual'")) {
      return formatLines([
        cliText(locale, '当前阶段允许 craftsman dispatch，smoke mode 下必须显式声明 craftsman run。', 'This stage is craftsman-capable and smoke mode requires an explicit craftsman run.'),
        subtasksCreateCraftsmanExample(locale),
        cliText(locale, '见 `agora subtasks create --help`。', 'See `agora subtasks create --help`.'),
      ]);
    }
    if (message.includes('requires controller ownership')) {
      return formatLines([
        cliText(locale, '请用当前 controller 作为 `--caller-id` 重试。', 'Retry with the current controller as `--caller-id`.'),
        cliText(locale, '如果你不确定当前 controller 是谁，先运行：', 'If you are unsure who controls the task, run:'),
        `- agora status ${path[2] ?? '<taskId>'}`,
      ]);
    }
    if (message.includes('does not allow craftsman dispatch') || message.includes('does not allow execute-mode subtasks')) {
      return formatLines([
        cliText(locale, '当前阶段不支持这种 subtask。', 'The current stage does not support this subtask type.'),
        cliText(locale, `- 先查看当前状态：agora status ${path[2] ?? '<taskId>'}`, `- Check current state: agora status ${path[2] ?? '<taskId>'}`),
        cliText(locale, `- 条件满足后推进：agora advance ${path[2] ?? '<taskId>'} --caller-id <controllerId>`, `- Advance when ready: agora advance ${path[2] ?? '<taskId>'} --caller-id <controllerId>`),
      ]);
    }
  }

  if (path[0] === 'craftsman' && ['input-text', 'input-keys', 'submit-choice', 'probe'].includes(path[1] ?? '')) {
    return formatLines([
      cliText(locale, '当前 execution 不在可输入或可 probe 的状态。', 'The execution is not in an input-waiting or probeable state for this action.'),
      craftsmanInputExample(argv, locale),
      cliText(locale, '先用 `agora craftsman status <executionId>` 看实时状态。', 'Check the live state first with `agora craftsman status <executionId>`.'),
    ]);
  }

  if (['advance', 'approve', 'reject', 'archon-approve', 'archon-reject'].includes(path[0] ?? '')) {
    return formatLines([
      cliText(locale, '当前 task 状态不允许这个动作。', 'The task is not in the expected state for this action.'),
      approvalExample(argv, locale),
      cliText(locale, `- 先检查 task：agora status ${path[1] ?? '<taskId>'}`, `- Inspect the task first: agora status ${path[1] ?? '<taskId>'}`),
    ]);
  }

  if (message.includes('memory pressure') || message.includes('memory utilization') || message.includes('load per cpu') || message.includes('max ')) {
    return formatLines([
      cliText(locale, 'Craftsman 治理门阻止了这次 dispatch。', 'Craftsman governance blocked this dispatch.'),
      cliText(locale, '- 先看治理快照：agora craftsman governance', '- Inspect governance: agora craftsman governance'),
      cliText(locale, '- 释放资源或降低并发后再重试。', '- Free resources or reduce concurrency before retrying.'),
    ]);
  }

  return cliText(
    locale,
    '请先检查当前 task/stage/execution 状态，再执行下一步合法动作。',
    'Check the current task/stage/execution state, then retry with the next valid action.',
  );
}

function usageRecoveryHint(message: string, argv: string[], locale: CliLocale) {
  const path = commandPath(argv);
  if (path[0] === 'subtasks' && path[1] === 'create') {
    if (message.includes('execution_target') || message.includes('craftsman spec is required') || message.includes('craftsman spec must be omitted')) {
      return formatLines([
        cliText(locale, '每个 subtask 都必须显式声明 `execution_target`。', 'Every subtask must declare `execution_target` explicitly.'),
        subtasksCreateCraftsmanExample(locale),
        cliText(locale, '见 `agora subtasks create --help`。', 'See `agora subtasks create --help`.'),
      ]);
    }
    return formatLines([
      cliText(locale, '预期的 JSON 文件格式如下：', 'Expected a JSON file like:'),
      '{',
      '  "subtasks": [',
      '    { "id": "smoke-build", "title": "Smoke build", "assignee": "opus", "execution_target": "manual" }',
      '  ]',
      '}',
      cliText(locale, '见 `agora subtasks create --help`。', 'See `agora subtasks create --help`.'),
    ]);
  }

  if (path[0] === 'craftsman' && path[1] === 'dispatch') {
    return formatLines([
      cliText(locale, 'Dispatch 需要 adapter、execution mode 和 interaction expectation 互相匹配。', 'Dispatch requires an adapter, execution mode, and interaction expectation that agree.'),
      cliText(locale, `示例：agora craftsman dispatch <taskId> <subtaskId> --caller-id opus --adapter claude --mode one_shot --interaction one_shot`, `Example: agora craftsman dispatch <taskId> <subtaskId> --caller-id opus --adapter claude --mode one_shot --interaction one_shot`),
      cliText(locale, '如果要持续交互，请用 `--mode interactive --interaction needs_input`。', 'Use `--mode interactive --interaction needs_input` for continued input loops.'),
    ]);
  }

  if (path[0] === 'craftsman' && ['input-text', 'input-keys', 'submit-choice'].includes(path[1] ?? '')) {
    return formatLines([
      craftsmanInputExample(argv, locale),
      cliText(locale, `见 \`agora craftsman ${path[1]} --help\`。`, `See \`agora craftsman ${path[1]} --help\`.`),
    ]);
  }

  return helpHint(argv, locale);
}

function environmentRecoveryHint(message: string, argv: string[], locale: CliLocale) {
  if (message.includes('database is locked')) {
    return formatLines([
      cliText(locale, '还有其他本地进程持有 SQLite 写锁。', 'Another local process still holds the SQLite write lock.'),
      cliText(locale, '- 先停掉重叠的 `agora start` / test / script writer。', '- Stop overlapping `agora start` / test / script writers.'),
      cliText(locale, '- 然后重试当前命令。', '- Then retry the command.'),
      helpHint(argv, locale),
    ]);
  }
  if (message.includes('eaddrinuse')) {
    return formatLines([
      cliText(locale, '需要的本地端口已经被占用。', 'A required local port is already in use.'),
      cliText(locale, '- 停掉旧的 dev server，或者改端口配置。', '- Stop the old dev server or change the configured port.'),
      cliText(locale, '- 然后重新执行命令。', '- Then rerun the command.'),
    ]);
  }
  if (message.includes('tmux craftsman input requires a tmux session id') || message.includes("can't find window")) {
    return formatLines([
      cliText(locale, '本地 tmux craftsman session 丢了。', 'The local tmux craftsman session is missing.'),
      cliText(locale, '- 先检查 execution：agora craftsman status <executionId>', '- Check live executions: agora craftsman status <executionId>'),
      cliText(locale, '- 如果 session 已经没了，就重新 dispatch。', '- Re-dispatch if the session is gone.'),
    ]);
  }
  return cliText(locale, '请检查本地 DB 锁、端口、tmux/runtime 进程和文件系统状态。', 'Check local DB locks, ports, tmux/runtime processes, and filesystem state.');
}

function integrationRecoveryHint(message: string, locale: CliLocale) {
  if (message.includes('adapter')) {
    return formatLines([
      cliText(locale, '当前开发环境支持的 craftsman adapter 是 `codex`、`claude`、`gemini`。', 'Supported craftsman adapters in the current dev setup are `codex`, `claude`, and `gemini`.'),
      cliText(locale, '如果你写了 `claude_code` 或 `gemini_cli` 这种 alias，core 会自动归一化。', 'If you have an alias like `claude_code` or `gemini_cli`, the core will normalize it automatically.'),
    ]);
  }
  return cliText(locale, '请检查相关 adapter/runtime 的配置和在线连通性。', 'Check the relevant adapter/runtime configuration and live connectivity.');
}

export function classifyCliError(error: unknown, argv: string[] = []): CliError {
  if (error instanceof CliError) {
    return error;
  }
  const rawMessage = error instanceof Error ? error.message : String(error);
  const message = rawMessage.trim();
  const lower = message.toLowerCase();
  const path = commandPath(argv);
  const locale = resolveCliLocale();

  if (lower.includes('enoent: no such file or directory') && argv.includes('--file')) {
    return new CliError(
      message,
      'usage',
      CLI_EXIT_CODES.usage,
      formatLines([
        cliText(locale, '`--file` 指向的路径不存在或不可读。', 'The `--file` path does not exist or is unreadable.'),
        cliText(locale, '- 请检查文件路径后重试。', '- Check the file path and retry.'),
        path[0] === 'subtasks' && path[1] === 'create'
          ? cliText(locale, '预期 JSON 顶层为 `subtasks` 数组。', 'Expected a JSON file with a top-level `subtasks` array.')
          : helpHint(argv, locale),
      ]),
    );
  }

  if (lower.includes('craftsman execution') && lower.includes('not found')) {
    return new CliError(
      message,
      'state',
      CLI_EXIT_CODES.state,
      formatLines([
        cliText(locale, '当前数据库里没有这个 execution id。', 'The execution id is unknown in the current database.'),
        cliText(locale, '- 请检查 task conversation，或运行 `agora craftsman history <taskId> <subtaskId>`。', '- Check the task conversation or `agora craftsman history <taskId> <subtaskId>`.'),
        cliText(locale, '- 如果你刚重建了 `~/.agora/agora.db`，旧 execution id 消失是正常现象。', '- If you reset `~/.agora/agora.db`, old execution ids are expected to disappear.'),
      ]),
    );
  }

  if (looksLikeUsageError(lower)) {
    return new CliError(message, 'usage', CLI_EXIT_CODES.usage, usageRecoveryHint(lower, argv, locale));
  }
  if (looksLikeStateError(lower)) {
    return new CliError(message, 'state', CLI_EXIT_CODES.state, stateRecoveryHint(lower, argv, locale));
  }
  if (looksLikeEnvironmentError(lower)) {
    return new CliError(message, 'environment', CLI_EXIT_CODES.environment, environmentRecoveryHint(lower, argv, locale));
  }
  if (looksLikeIntegrationError(lower)) {
    return new CliError(message, 'integration', CLI_EXIT_CODES.integration, integrationRecoveryHint(lower, locale));
  }
  return new CliError(message, 'unknown', CLI_EXIT_CODES.unknown);
}

export function renderCliError(error: unknown, argv: string[] = []) {
  const classified = classifyCliError(error, argv);
  const locale = resolveCliLocale();
  const title = {
    usage: cliText(locale, '用法错误', 'Usage Error'),
    state: cliText(locale, '状态错误', 'State Error'),
    environment: cliText(locale, '环境错误', 'Environment Error'),
    integration: cliText(locale, '集成错误', 'Integration Error'),
    unknown: cliText(locale, 'CLI 错误', 'CLI Error'),
  }[classified.kind];

  return [
    `${title}: ${classified.message}`,
    ...(classified.hint ? [`${cliText(locale, '提示', 'Hint')}: ${classified.hint}`] : []),
  ].join('\n');
}
