import { Command } from 'commander';
import type { CliCompositionFactories } from './composition.js';
import { createCliComposition } from './composition.js';
import type { DashboardSessionClient } from './dashboard-session-client.js';
import type { TaskService, TmuxRuntimeService } from '@agora-ts/core';
import type {
  CraftsmanCallbackRequestDto,
  CraftsmanExecutionStatusDto,
  CraftsmanRuntimeIdentitySourceDto,
  TaskPriority,
} from '@agora-ts/contracts';
import { runInitCommand } from './init-command.js';

type Writable = {
  write: (chunk: string) => void;
};

export interface CliDependencies {
  taskService?: TaskService;
  tmuxRuntimeService?: TmuxRuntimeServiceLike;
  dashboardSessionClient?: DashboardSessionClient;
  factories?: Partial<CliCompositionFactories>;
  configPath?: string;
  dbPath?: string;
  stdout?: Writable;
  stderr?: Writable;
}

type TmuxRuntimeServiceLike = Pick<TmuxRuntimeService, 'up' | 'status' | 'send' | 'start' | 'resume' | 'task' | 'tail' | 'doctor' | 'down' | 'recordIdentity'>;

function writeLine(stream: Writable, message: string) {
  stream.write(`${message}\n`);
}

function parseJsonOption(raw?: string): Record<string, unknown> | null {
  if (!raw) {
    return null;
  }
  return JSON.parse(raw) as Record<string, unknown>;
}

export function createCliProgram(deps: CliDependencies = {}) {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  const composition = !deps.taskService || !deps.tmuxRuntimeService || !deps.dashboardSessionClient
    ? createCliComposition({
      ...(deps.configPath ? { configPath: deps.configPath } : {}),
      ...(deps.dbPath ? { dbPath: deps.dbPath } : {}),
    }, deps.factories)
    : null;
  const taskService = deps.taskService ?? composition?.taskService;
  const tmuxRuntimeService = deps.tmuxRuntimeService ?? composition?.tmuxRuntimeService;
  const dashboardSessionClient = deps.dashboardSessionClient ?? composition?.dashboardSessionClient;
  if (!taskService || !tmuxRuntimeService || !dashboardSessionClient) {
    throw new Error('CLI runtime composition is incomplete');
  }
  const program = new Command();

  program
    .name('agora-ts')
    .description('Agora v2 TypeScript CLI')
    .version('0.0.0');

  program.configureOutput({
    writeOut: (text) => stdout.write(text),
    writeErr: (text) => stderr.write(text),
  });

  program
    .command('health')
    .description('Print the bootstrap health marker')
    .action(() => {
      writeLine(stdout, 'agora-ts bootstrap ok');
    });

  program
    .command('create')
    .description('创建新任务')
    .argument('<title>', '任务标题')
    .option('-t, --type <type>', '任务类型', 'coding')
    .option('-p, --priority <priority>', '优先级', 'normal')
    .option('-c, --creator <creator>', '创建者', 'archon')
    .action((title: string, options: { type: string; priority: TaskPriority; creator: string }) => {
      const task = taskService.createTask({
        title,
        type: options.type,
        creator: options.creator,
        description: '',
        priority: options.priority,
      });
      writeLine(stdout, `任务已创建: ${task.id}`);
      writeLine(stdout, `标题: ${task.title}`);
      writeLine(stdout, `类型: ${task.type}`);
      writeLine(stdout, `状态: ${task.state}`);
      writeLine(stdout, `阶段: ${task.current_stage ?? '-'}`);
    });

  program
    .command('status')
    .description('查看任务状态详情')
    .argument('<taskId>', '任务 ID')
    .action((taskId: string) => {
      const status = taskService.getTaskStatus(taskId);
      const task = status.task;
      writeLine(stdout, `${task.id} — ${task.title}`);
      writeLine(stdout, `类型: ${task.type}`);
      writeLine(stdout, `优先级: ${task.priority}`);
      writeLine(stdout, `状态: ${task.state}`);
      writeLine(stdout, `阶段: ${task.current_stage ?? '-'}`);
      writeLine(stdout, `Flow Log: ${status.flow_log.length}`);
    });

  program
    .command('list')
    .description('列出任务')
    .option('-s, --state <state>', '按状态筛选')
    .action((options: { state?: string }) => {
      const tasks = taskService.listTasks(options.state);
      if (tasks.length === 0) {
        writeLine(stdout, '没有找到任务');
        return;
      }
      for (const task of tasks) {
        writeLine(
          stdout,
          `${task.id}\t${task.title}\t${task.type}\t${task.state}\t${task.current_stage ?? '-'}`,
        );
      }
    });

  program
    .command('advance')
    .description('推进任务到下一阶段')
    .argument('<taskId>', '任务 ID')
    .requiredOption('--caller-id <callerId>', '调用者 ID')
    .action((taskId: string, options: { callerId: string }) => {
      const task = taskService.advanceTask(taskId, { callerId: options.callerId });
      if (task.state === 'done') {
        writeLine(stdout, `任务 ${taskId} 已完成`);
      } else {
        writeLine(stdout, `任务 ${taskId} 已推进到阶段: ${task.current_stage ?? '-'}`);
      }
    });

  program
    .command('approve')
    .description('审批通过当前阶段')
    .argument('<taskId>', '任务 ID')
    .requiredOption('--approver-id <approverId>', '审批者 ID')
    .option('--comment <comment>', '审批备注', '')
    .action((taskId: string, options: { approverId: string; comment: string }) => {
      taskService.approveTask(taskId, {
        approverId: options.approverId,
        comment: options.comment,
      });
      writeLine(stdout, `任务 ${taskId} 已审批通过`);
    });

  program
    .command('reject')
    .description('驳回当前阶段')
    .argument('<taskId>', '任务 ID')
    .requiredOption('--rejector-id <rejectorId>', '驳回者 ID')
    .option('--reason <reason>', '驳回原因', '')
    .action((taskId: string, options: { rejectorId: string; reason: string }) => {
      taskService.rejectTask(taskId, {
        rejectorId: options.rejectorId,
        reason: options.reason,
      });
      writeLine(stdout, `任务 ${taskId} 已驳回`);
    });

  program
    .command('archon-approve')
    .description('Archon 审批通过当前阶段')
    .argument('<taskId>', '任务 ID')
    .requiredOption('--reviewer-id <reviewerId>', 'Archon ID')
    .option('--comment <comment>', '备注', '')
    .action((taskId: string, options: { reviewerId: string; comment: string }) => {
      taskService.archonApproveTask(taskId, {
        reviewerId: options.reviewerId,
        comment: options.comment,
      });
      writeLine(stdout, `任务 ${taskId} 已 Archon 审批通过`);
    });

  program
    .command('archon-reject')
    .description('Archon 驳回当前阶段')
    .argument('<taskId>', '任务 ID')
    .requiredOption('--reviewer-id <reviewerId>', 'Archon ID')
    .option('--reason <reason>', '原因', '')
    .action((taskId: string, options: { reviewerId: string; reason: string }) => {
      taskService.archonRejectTask(taskId, {
        reviewerId: options.reviewerId,
        reason: options.reason,
      });
      writeLine(stdout, `任务 ${taskId} 已 Archon 驳回`);
    });

  program
    .command('confirm')
    .description('记录 quorum 投票')
    .argument('<taskId>', '任务 ID')
    .requiredOption('--voter-id <voterId>', '投票者 ID')
    .option('--vote <vote>', '投票结果', 'approve')
    .option('--comment <comment>', '备注', '')
    .action((taskId: string, options: { voterId: string; vote: 'approve' | 'reject'; comment: string }) => {
      const result = taskService.confirmTask(taskId, {
        voterId: options.voterId,
        vote: options.vote,
        comment: options.comment,
      });
      writeLine(stdout, `任务 ${taskId} 已记录投票，当前票数: approved=${result.quorum.approved} total=${result.quorum.total}`);
    });

  program
    .command('subtask-done')
    .description('完成子任务')
    .argument('<taskId>', '任务 ID')
    .requiredOption('--subtask-id <subtaskId>', '子任务 ID')
    .requiredOption('--caller-id <callerId>', '调用者 ID')
    .option('--output <output>', '输出', '')
    .action((taskId: string, options: { subtaskId: string; callerId: string; output: string }) => {
      taskService.completeSubtask(taskId, {
        subtaskId: options.subtaskId,
        callerId: options.callerId,
        output: options.output,
      });
      writeLine(stdout, `任务 ${taskId} 的子任务 ${options.subtaskId} 已完成`);
    });

  program
    .command('force-advance')
    .description('强制推进任务')
    .argument('<taskId>', '任务 ID')
    .option('--reason <reason>', '原因', '')
    .action((taskId: string, options: { reason: string }) => {
      const task = taskService.forceAdvanceTask(taskId, { reason: options.reason });
      writeLine(stdout, `任务 ${taskId} 已强制推进到阶段: ${task.current_stage ?? '-'}`);
    });

  program
    .command('pause')
    .description('暂停任务')
    .argument('<taskId>', '任务 ID')
    .option('--reason <reason>', '原因', '')
    .action((taskId: string, options: { reason: string }) => {
      taskService.pauseTask(taskId, { reason: options.reason });
      writeLine(stdout, `任务 ${taskId} 已暂停`);
    });

  program
    .command('resume')
    .description('恢复任务')
    .argument('<taskId>', '任务 ID')
    .action((taskId: string) => {
      taskService.resumeTask(taskId);
      writeLine(stdout, `任务 ${taskId} 已恢复`);
    });

  program
    .command('cancel')
    .description('取消任务')
    .argument('<taskId>', '任务 ID')
    .option('--reason <reason>', '原因', '')
    .action((taskId: string, options: { reason: string }) => {
      taskService.cancelTask(taskId, { reason: options.reason });
      writeLine(stdout, `任务 ${taskId} 已取消`);
    });

  program
    .command('unblock')
    .description('解除阻塞')
    .argument('<taskId>', '任务 ID')
    .option('--reason <reason>', '原因', '')
    .option('--action <action>', '恢复策略（当前支持 retry|skip|reassign）')
    .option('--assignee <assignee>', 'reassign 时的新 assignee')
    .option('--craftsman-type <craftsmanType>', 'reassign 时的新 craftsman type')
    .action((taskId: string, options: {
      reason: string;
      action?: 'retry' | 'skip' | 'reassign';
      assignee?: string;
      craftsmanType?: string;
    }) => {
      taskService.unblockTask(
        taskId,
        options.action
          ? {
            reason: options.reason,
            action: options.action,
            ...(options.assignee ? { assignee: options.assignee } : {}),
            ...(options.craftsmanType ? { craftsman_type: options.craftsmanType } : {}),
          }
          : { reason: options.reason },
      );
      writeLine(stdout, `任务 ${taskId} 已解除阻塞`);
    });

  program
    .command('cleanup')
    .description('清理 orphaned 任务')
    .option('--task-id <taskId>', '指定任务 ID')
    .action((options: { taskId?: string }) => {
      const cleaned = taskService.cleanupOrphaned(options.taskId);
      writeLine(stdout, `已清理 orphaned 任务: ${cleaned}`);
    });

  const craftsman = program
    .command('craftsman')
    .description('craftsman execution commands');
  const dashboard = program
    .command('dashboard')
    .description('dashboard auth commands');

  craftsman
    .command('dispatch')
    .description('派发 craftsmen 子任务')
    .argument('<taskId>', '任务 ID')
    .argument('<subtaskId>', '子任务 ID')
    .requiredOption('--adapter <adapter>', 'adapter 名称')
    .option('--mode <mode>', '执行模式', 'task')
    .option('--workdir <workdir>', '工作目录')
    .option('--brief-path <briefPath>', 'brief 路径')
    .action((taskId: string, subtaskId: string, options: {
      adapter: string;
      mode: 'task' | 'continuous';
      workdir?: string;
      briefPath?: string;
    }) => {
      const result = taskService.dispatchCraftsman({
        task_id: taskId,
        subtask_id: subtaskId,
        adapter: options.adapter,
        mode: options.mode,
        workdir: options.workdir ?? null,
        brief_path: options.briefPath ?? null,
      });
      writeLine(stdout, `craftsman execution 已派发: ${result.execution.execution_id}`);
      writeLine(stdout, `adapter: ${result.execution.adapter}`);
      writeLine(stdout, `status: ${result.execution.status}`);
    });

  craftsman
    .command('status')
    .description('查看 craftsmen execution 状态')
    .argument('<executionId>', 'execution ID')
    .action((executionId: string) => {
      const execution = taskService.getCraftsmanExecution(executionId);
      writeLine(stdout, `${execution.execution_id}`);
      writeLine(stdout, `adapter: ${execution.adapter}`);
      writeLine(stdout, `status: ${execution.status}`);
    });

  craftsman
    .command('history')
    .description('查看某个 subtask 的 craftsmen execution 历史')
    .argument('<taskId>', '任务 ID')
    .argument('<subtaskId>', '子任务 ID')
    .action((taskId: string, subtaskId: string) => {
      const executions = taskService.listCraftsmanExecutions(taskId, subtaskId);
      if (executions.length === 0) {
        writeLine(stdout, '没有找到 craftsmen execution 历史');
        return;
      }
      for (const execution of executions) {
        writeLine(
          stdout,
          `${execution.execution_id}\t${execution.adapter}\t${execution.status}\t${execution.session_id ?? '-'}\t${execution.started_at ?? '-'}`,
        );
      }
    });

  craftsman
    .command('callback')
    .description('提交 craftsmen callback')
    .argument('<executionId>', 'execution ID')
    .requiredOption('--status <status>', '回调状态')
    .option('--session-id <sessionId>', 'session ID')
    .option('--payload <payload>', 'JSON payload')
    .option('--error <error>', 'error message')
    .option('--finished-at <finishedAt>', 'finished timestamp')
    .action((executionId: string, options: {
      status: CraftsmanExecutionStatusDto;
      sessionId?: string;
      payload?: string;
      error?: string;
      finishedAt?: string;
    }) => {
      const result = taskService.handleCraftsmanCallback({
        execution_id: executionId,
        status: options.status as CraftsmanCallbackRequestDto['status'],
        session_id: options.sessionId ?? null,
        payload: parseJsonOption(options.payload),
        error: options.error ?? null,
        finished_at: options.finishedAt ?? null,
      });
      writeLine(stdout, `craftsman callback 已处理: ${result.execution.execution_id}`);
      writeLine(stdout, `status: ${result.execution.status}`);
      writeLine(stdout, `${result.subtask.output ?? ''}`);
    });

  const tmux = craftsman
    .command('tmux')
    .description('tmux runtime commands for craftsmen panes');

  const runtime = craftsman
    .command('runtime')
    .description('generic runtime identity and observability commands');
  const dashboardSession = dashboard
    .command('session')
    .description('dashboard session auth commands');

  tmux
    .command('up')
    .description('初始化 tmux craftsmen session')
    .action(() => {
      const result = tmuxRuntimeService.up();
      writeLine(stdout, `tmux session 已就绪: ${result.session}`);
      for (const pane of result.panes) {
        writeLine(stdout, `${pane.id}\t${pane.title}\t${pane.currentCommand}\t${pane.active ? 'active' : 'idle'}`);
      }
    });

  tmux
    .command('status')
    .description('查看 tmux pane 状态')
    .action(() => {
      const result = tmuxRuntimeService.status();
      for (const pane of result.panes) {
        writeLine(
          stdout,
          `${pane.id}\t${pane.title}\t${pane.currentCommand}\t${pane.active ? 'active' : 'idle'}\t${pane.continuityBackend}\t${pane.identitySource}\t${pane.sessionReference ?? '-'}\t${pane.identityPath ?? '-'}\t${pane.sessionObservedAt ?? '-'}`,
        );
      }
    });

  tmux
    .command('send')
    .description('向指定 tmux pane 发送原始命令')
    .argument('<agent>', 'agent pane name')
    .argument('<command>', 'raw shell command')
    .action((agent: string, command: string) => {
      tmuxRuntimeService.send(agent, command);
      writeLine(stdout, `tmux command 已发送: ${agent}`);
    });

  tmux
    .command('start')
    .description('启动指定 agent 的 interactive runtime')
    .argument('<agent>', 'agent pane name')
    .action((agent: string) => {
      const result = tmuxRuntimeService.start(agent, process.cwd());
      writeLine(stdout, `tmux runtime 已启动: ${agent}`);
      writeLine(stdout, `pane: ${result.pane ?? '-'}`);
      writeLine(stdout, `mode: ${result.recoveryMode}`);
      writeLine(stdout, `command: ${result.command}`);
    });

  tmux
    .command('resume')
    .description('恢复指定 agent 的 interactive runtime')
    .argument('<agent>', 'agent pane name')
    .argument('[sessionReference]', 'resume session reference')
    .action((agent: string, sessionReference?: string) => {
      const result = tmuxRuntimeService.resume(agent, sessionReference ?? null, process.cwd());
      writeLine(stdout, `tmux runtime 已恢复: ${agent}`);
      writeLine(stdout, `pane: ${result.pane ?? '-'}`);
      writeLine(stdout, `mode: ${result.recoveryMode}`);
      writeLine(stdout, `command: ${result.command}`);
    });

  tmux
    .command('task')
    .description('通过 tmux pane 派发一条简短 CLI 任务')
    .argument('<agent>', 'agent pane name')
    .argument('<prompt>', 'prompt')
    .option('--workdir <workdir>', '工作目录')
    .action((agent: string, prompt: string, options: { workdir?: string }) => {
      const result = tmuxRuntimeService.task(agent, {
        execution_id: `tmux-${Date.now()}`,
        task_id: 'TMUX',
        stage_id: 'dispatch',
        subtask_id: `${agent}-tmux-task`,
        adapter: agent,
        mode: 'task',
        workdir: options.workdir ?? process.cwd(),
        prompt,
        brief_path: null,
      });
      writeLine(stdout, `tmux task 已派发: ${result.session_id ?? '-'}`);
    });

  tmux
    .command('tail')
    .description('查看 tmux pane 最近输出')
    .argument('<agent>', 'agent pane name')
    .option('--lines <lines>', '输出行数', '40')
    .action((agent: string, options: { lines: string }) => {
      writeLine(stdout, tmuxRuntimeService.tail(agent, Number(options.lines)));
    });

  tmux
    .command('doctor')
    .description('查看 tmux pane readiness')
    .action(() => {
      const result = tmuxRuntimeService.doctor();
      for (const pane of result.panes) {
        writeLine(
          stdout,
          `${pane.agent}\t${pane.pane ?? '-'}\t${pane.command ?? '-'}\t${pane.ready ? 'ready' : 'missing'}\t${pane.continuityBackend}\t${pane.identitySource}\t${pane.sessionReference ?? '-'}\t${pane.identityPath ?? '-'}\t${pane.sessionObservedAt ?? '-'}`,
        );
      }
    });

  tmux
    .command('down')
    .description('关闭 tmux craftsmen session')
    .action(() => {
      const result = tmuxRuntimeService.status();
      tmuxRuntimeService.down();
      writeLine(stdout, `tmux session 已关闭: ${result.session}`);
    });

  runtime
    .command('identity')
    .description('回填运行时 identity 元数据')
    .argument('<agent>', 'agent pane name')
    .requiredOption('--identity-source <identitySource>', 'identity source')
    .option('--session-reference <sessionReference>', 'session reference')
    .option('--identity-path <identityPath>', 'identity file path')
    .option('--session-observed-at <sessionObservedAt>', 'identity observed timestamp')
    .option('--workspace-root <workspaceRoot>', 'workspace root')
    .action((agent: string, options: {
      identitySource: CraftsmanRuntimeIdentitySourceDto;
      sessionReference?: string;
      identityPath?: string;
      sessionObservedAt?: string;
      workspaceRoot?: string;
    }) => {
      const result = tmuxRuntimeService.recordIdentity(agent, {
        sessionReference: options.sessionReference ?? null,
        identitySource: options.identitySource,
        identityPath: options.identityPath ?? null,
        sessionObservedAt: options.sessionObservedAt ?? null,
        workspaceRoot: options.workspaceRoot ?? null,
      });
      writeLine(stdout, `runtime identity 已回填: ${agent}`);
      writeLine(stdout, `source: ${result.identitySource}`);
      writeLine(stdout, `session: ${result.sessionReference ?? '-'}`);
    });

  dashboardSession
    .command('login')
    .description('登录 dashboard session 并缓存 cookie')
    .requiredOption('--username <username>', '用户名')
    .requiredOption('--password <password>', '密码')
    .action(async (options: { username: string; password: string }) => {
      const result = await dashboardSessionClient.login({
        username: options.username,
        password: options.password,
      });
      writeLine(stdout, `dashboard session 已建立: ${result.username}`);
      writeLine(stdout, `method: ${result.method}`);
      writeLine(stdout, `session file: ${dashboardSessionClient.sessionFilePath}`);
    });

  dashboardSession
    .command('status')
    .description('查看当前 dashboard session 状态')
    .action(async () => {
      const result = await dashboardSessionClient.status();
      writeLine(stdout, `authenticated: ${result.authenticated}`);
      writeLine(stdout, `method: ${result.method ?? '-'}`);
      writeLine(stdout, `username: ${result.username ?? '-'}`);
      writeLine(stdout, `session file: ${dashboardSessionClient.sessionFilePath}`);
    });

  dashboardSession
    .command('logout')
    .description('退出当前 dashboard session 并清理本地 cookie')
    .action(async () => {
      await dashboardSessionClient.logout();
      writeLine(stdout, 'dashboard session 已清除');
      writeLine(stdout, `session file: ${dashboardSessionClient.sessionFilePath}`);
    });

  program
    .command('init')
    .description('交互式配置向导（配置 Discord 等 IM 集成）')
    .action(async () => {
      await runInitCommand();
    });

  return program;
}

export async function runCli(argv: string[]) {
  const program = createCliProgram();
  await program.parseAsync(argv, { from: 'user' });
}

const isEntrypoint = process.argv[1] ? import.meta.url === new URL(`file://${process.argv[1]}`).href : false;

if (isEntrypoint) {
  runCli(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
