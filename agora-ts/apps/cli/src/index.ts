import { Command } from 'commander';
import { createAgoraDatabase, runMigrations } from '@agora-ts/db';
import { TaskService } from '@agora-ts/core';

type Writable = {
  write: (chunk: string) => void;
};

export interface CliDependencies {
  taskService?: TaskService;
  stdout?: Writable;
  stderr?: Writable;
}

function resolveTaskService() {
  const dbPath = process.env.AGORA_DB_PATH ?? 'tasks.db';
  const db = createAgoraDatabase({ dbPath });
  runMigrations(db);
  return new TaskService(db);
}

function writeLine(stream: Writable, message: string) {
  stream.write(`${message}\n`);
}

export function createCliProgram(deps: CliDependencies = {}) {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  const taskService = deps.taskService ?? resolveTaskService();
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
    .action((title: string, options: { type: string; priority: string; creator: string }) => {
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
    .action((taskId: string, options: { reason: string }) => {
      taskService.unblockTask(taskId, { reason: options.reason });
      writeLine(stdout, `任务 ${taskId} 已解除阻塞`);
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
