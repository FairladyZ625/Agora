#!/usr/bin/env tsx
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { Command } from 'commander';
import { AcpCraftsmanAdapter } from '@agora-ts/adapters-craftsman';
import { AcpCraftsmanProbePort, AcpCraftsmanTailPort, DirectAcpxRuntimePort } from '@agora-ts/adapters-runtime';
import { createAgoraDatabase, runMigrations } from '@agora-ts/db';
import { createCraftsmanDispatcherFromDb, createTaskServiceFromDb } from '@agora-ts/testing';

function sleep(ms: number) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function main() {
  const program = new Command();
  program
    .option('--agent <agent>', 'claude|codex|gemini', 'claude')
    .option('--cwd <cwd>', 'working directory for the ACP session', process.cwd())
    .option('--prompt <prompt>', 'prompt text to send', 'Reply with exactly "ACPX smoke ok". Do not use tools.')
    .option('--model <model>', 'optional model override')
    .option('--timeout-seconds <seconds>', 'agent response timeout seconds', '120')
    .option('--ttl-seconds <seconds>', 'queue owner ttl seconds', '8')
    .option('--poll-ms <ms>', 'poll interval milliseconds', '2000')
    .option('--deadline-ms <ms>', 'overall deadline milliseconds', '90000')
    .option('--permission-mode <mode>', 'approve_all|approve_reads|deny_all', 'deny_all')
    .option('--keep-db', 'keep the temporary sqlite db and print its path', false)
    .parse(process.argv);

  const options = program.opts<{
    agent: 'claude' | 'codex' | 'gemini';
    cwd: string;
    prompt: string;
    model?: string;
    timeoutSeconds: string;
    ttlSeconds: string;
    pollMs: string;
    deadlineMs: string;
    permissionMode: 'approve_all' | 'approve_reads' | 'deny_all';
    keepDb: boolean;
  }>();

  const tempDir = mkdtempSync(join(tmpdir(), 'agora-acp-smoke-'));
  const dbPath = join(tempDir, 'smoke.db');
  const db = createAgoraDatabase({ dbPath });
  const runtime = new DirectAcpxRuntimePort();
  const dispatcher = createCraftsmanDispatcherFromDb(db, {
    executionIdGenerator: () => 'exec-acp-smoke-1',
    adapters: {
      [options.agent]: new AcpCraftsmanAdapter(options.agent, {
        runtime,
        callbackUrl: 'http://127.0.0.1:1/api/craftsmen/callback',
        sessionDefaults: {
          model: options.model ?? null,
          timeoutSeconds: Number(options.timeoutSeconds),
          ttlSeconds: Number(options.ttlSeconds),
          permissionMode: options.permissionMode,
        },
      }),
    },
  });
  let cleanedUp = false;

  const cleanup = () => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    db.close();
    if (!options.keepDb) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  };

  try {
    runMigrations(db);
    const taskService = createTaskServiceFromDb(db, {
      templatesDir: resolve(process.cwd(), 'templates'),
      taskIdGenerator: () => 'OC-ACP-SMOKE-1',
      craftsmanDispatcher: dispatcher,
      craftsmanExecutionProbePort: new AcpCraftsmanProbePort(runtime),
      craftsmanExecutionTailPort: new AcpCraftsmanTailPort(runtime),
    });

    taskService.createTask({
      title: 'ACPX smoke task',
      type: 'coding',
      creator: 'archon',
      description: 'validate ACPX-backed craftsman dispatch and probe settlement',
      priority: 'normal',
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'develop',
            mode: 'execute',
            execution_kind: 'craftsman_dispatch',
            allowed_actions: ['execute', 'dispatch_craftsman'],
            gate: { type: 'all_subtasks_done' },
          },
        ],
      },
    });

    const createResult = taskService.createSubtasks('OC-ACP-SMOKE-1', {
      caller_id: 'opus',
      subtasks: [
        {
          id: 'acp-smoke-subtask-1',
          title: `ACPX ${options.agent} smoke`,
          assignee: 'opus',
          execution_target: 'craftsman',
          craftsman: {
            adapter: options.agent,
            mode: 'interactive',
            interaction_expectation: 'needs_input',
            workdir: options.cwd,
            prompt: options.prompt,
          },
        },
      ],
    });

    const execution = createResult.dispatched_executions[0];
    if (!execution) {
      throw new Error('expected createSubtasks() to auto-dispatch an ACP execution');
    }

    const startedAt = Date.now();
    process.stdout.write(`task=OC-ACP-SMOKE-1 execution=${execution.execution_id} session=${execution.session_id ?? '-'}\n`);

    while (Date.now() - startedAt < Number(options.deadlineMs)) {
      const observe = taskService.observeCraftsmanExecutions({
        runningAfterMs: 0,
        waitingAfterMs: 0,
      });
      const currentExecution = taskService.getCraftsmanExecution(execution.execution_id);
      const subtask = taskService.listSubtasks('OC-ACP-SMOKE-1').find((item) => item.id === 'acp-smoke-subtask-1');
      const tail = taskService.getCraftsmanExecutionTail(execution.execution_id, 20);

      process.stdout.write(
        `[poll] observed=${observe.probed} progressed=${observe.progressed} execution_status=${currentExecution.status} subtask_status=${subtask?.status ?? '-'}\n`,
      );
      if (tail.available && tail.output) {
        const preview = tail.output.trim().split('\n').slice(-4).join('\n');
        process.stdout.write(`[tail]\n${preview}\n`);
      }

      if (currentExecution.status === 'succeeded' || currentExecution.status === 'failed' || currentExecution.status === 'cancelled') {
        process.stdout.write(`[result] execution_status=${currentExecution.status}\n`);
        process.stdout.write(`[result] subtask_status=${subtask?.status ?? '-'}\n`);
        process.stdout.write(`[result] subtask_output=${subtask?.output ?? ''}\n`);
        if (options.keepDb) {
          process.stdout.write(`[result] db_path=${dbPath}\n`);
        }
        cleanup();
        process.exit(currentExecution.status === 'succeeded' ? 0 : 1);
      }

      await sleep(Number(options.pollMs));
    }

    throw new Error(`deadline exceeded while waiting for ACPX execution ${execution.execution_id} to settle`);
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
    if (options.keepDb) {
      process.stderr.write(`db_path=${dbPath}\n`);
    }
    cleanup();
    process.exit(1);
  }
}

void main();
