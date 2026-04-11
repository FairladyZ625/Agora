#!/usr/bin/env tsx
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { buildApp } from '../apps/server/src/app.js';
import { createCliProgram } from '../apps/cli/src/index.js';
import { createAgoraDatabase, runMigrations } from '../packages/db/src/index.js';
import { createTaskServiceFromDb } from '../packages/testing/src/index.js';

class BufferStream {
  chunks: string[] = [];

  write(chunk: string) {
    this.chunks.push(chunk);
  }

  toString() {
    return this.chunks.join('');
  }
}

async function runCliCommand(args: string[], taskService: ReturnType<typeof createTaskServiceFromDb>) {
  const stdout = new BufferStream();
  const stderr = new BufferStream();
  const previousExitCode = process.exitCode;
  process.exitCode = 0;
  const program = createCliProgram({
    taskService,
    stdout,
    stderr,
  });
  await program.parseAsync(args, { from: 'user' });
  const result = {
    stdout: stdout.toString(),
    stderr: stderr.toString(),
    exitCode: process.exitCode ?? 0,
  };
  process.exitCode = previousExitCode;
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || result.stdout || `cli command failed: ${args.join(' ')}`);
  }
  return result;
}

async function main() {
  const smokeRoot = mkdtempSync(join(tmpdir(), 'agora-direct-create-smoke-'));
  const dbPath = join(smokeRoot, 'agora.db');
  const db = createAgoraDatabase({ dbPath });
  runMigrations(db);
  const taskIds = ['OC-SMOKE-REST', 'OC-SMOKE-CLI'];
  const taskService = createTaskServiceFromDb(db, {
    templatesDir: join(process.cwd(), 'templates'),
    taskIdGenerator: () => {
      const next = taskIds.shift();
      if (!next) {
        throw new Error('task id generator exhausted');
      }
      return next;
    },
  });

  try {
    const app = buildApp({ taskService });
    const restResponse = await app.inject({
      method: 'POST',
      url: '/api/orchestrator/direct-create',
      payload: {
        orchestrator_ref: 'agora-executive-controller',
        confirmation: {
          kind: 'conversation_confirmation',
          confirmation_mode: 'oral',
          confirmed_by: 'smoke-rest',
          confirmed_at: '2026-04-10T12:00:00.000Z',
          source: 'conversation',
          source_ref: 'smoke:rest',
        },
        create: {
          title: 'REST smoke direct create',
          type: 'coding',
          creator: 'agora-executive-controller',
          description: '',
          priority: 'normal',
        },
      },
    });
    if (restResponse.statusCode !== 200) {
      throw new Error(`rest smoke failed: ${restResponse.statusCode} ${restResponse.body}`);
    }

    const cliResult = await runCliCommand([
      'orchestrator',
      'direct-create',
      '--request-json',
      JSON.stringify({
        orchestrator_ref: 'agora-executive-controller',
        confirmation: {
          kind: 'conversation_confirmation',
          confirmation_mode: 'oral',
          confirmed_by: 'smoke-cli',
          confirmed_at: '2026-04-10T12:05:00.000Z',
          source: 'conversation',
          source_ref: 'smoke:cli',
        },
        create: {
          title: 'CLI smoke direct create',
          type: 'coding',
          creator: 'agora-executive-controller',
          description: '',
          priority: 'high',
        },
      }),
    ], taskService);

    const restTask = taskService.getTask('OC-SMOKE-REST');
    const cliTask = taskService.getTask('OC-SMOKE-CLI');
    if (!restTask?.control?.orchestrator_intake || !cliTask?.control?.orchestrator_intake) {
      throw new Error('orchestrator_intake metadata missing after smoke run');
    }

    process.stdout.write(JSON.stringify({
      smoke_root: smokeRoot,
      rest: {
        task_id: restTask.id,
        title: restTask.title,
        confirmed_by: restTask.control.orchestrator_intake.confirmed_by,
      },
      cli: {
        task_id: cliTask.id,
        title: cliTask.title,
        confirmed_by: cliTask.control.orchestrator_intake.confirmed_by,
        stdout: cliResult.stdout.trim().split('\n'),
      },
    }, null, 2));
    process.stdout.write('\n');

    await app.close();
    await taskService.drainBackgroundOperations();
  } finally {
    db.close();
    rmSync(smokeRoot, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
