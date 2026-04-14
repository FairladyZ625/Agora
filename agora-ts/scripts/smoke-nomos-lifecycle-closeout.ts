#!/usr/bin/env tsx
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { Command } from 'commander';
import { createCliProgram } from '../apps/cli/src/index.js';
import { ensureBundledAgoraAssetsInstalled } from '../packages/config/src/runtime-assets.js';

export class BufferStream {
  chunks: string[] = [];

  write(chunk: string) {
    this.chunks.push(chunk);
  }

  toString() {
    return this.chunks.join('');
  }
}

export function parseLineValue(output: string, prefix: string) {
  return output
    .split('\n')
    .find((line) => line.startsWith(prefix))
    ?.slice(prefix.length)
    .trim() ?? null;
}

export function requireLineValue(output: string, prefix: string) {
  const value = parseLineValue(output, prefix);
  if (!value) {
    throw new Error(`failed to parse "${prefix}" from output:\n${output}`);
  }
  return value;
}

export async function runCli(args: string[], options: { configPath: string; dbPath: string }) {
  const stdout = new BufferStream();
  const stderr = new BufferStream();
  const previousExitCode = process.exitCode;
  process.exitCode = 0;
  const program = createCliProgram({
    configPath: options.configPath,
    dbPath: options.dbPath,
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

export async function runSmokeNomosLifecycleCloseoutMain() {
  const program = new Command();
  program
    .option('--keep-temp', 'keep temporary smoke dir', false)
    .option('--project-id <projectId>', 'fixed project id', 'proj-nomos-lifecycle-smoke')
    .parse(process.argv);

  const options = program.opts<{
    keepTemp: boolean;
    projectId: string;
  }>();

  const smokeRoot = mkdtempSync(join(tmpdir(), 'agora-nomos-lifecycle-closeout-smoke-'));
  const homeDir = join(smokeRoot, 'home');
  const agoraHomeDir = join(homeDir, '.agora');
  const configPath = join(agoraHomeDir, 'agora.json');
  const dbPath = join(agoraHomeDir, 'agora.db');
  const repoRoot = join(smokeRoot, 'repo');

  const restoreEnv = {
    HOME: process.env.HOME,
    AGORA_HOME_DIR: process.env.AGORA_HOME_DIR,
    AGORA_DB_PATH: process.env.AGORA_DB_PATH,
    AGORA_CONFIG_PATH: process.env.AGORA_CONFIG_PATH,
  };

  process.env.HOME = homeDir;
  process.env.AGORA_HOME_DIR = agoraHomeDir;
  process.env.AGORA_DB_PATH = dbPath;
  process.env.AGORA_CONFIG_PATH = configPath;

  mkdirSync(homeDir, { recursive: true });
  mkdirSync(agoraHomeDir, { recursive: true });
  writeFileSync(configPath, JSON.stringify({
    db_path: dbPath,
    im: { provider: 'none' },
  }, null, 2));

  const cleanup = () => {
    process.env.HOME = restoreEnv.HOME;
    process.env.AGORA_HOME_DIR = restoreEnv.AGORA_HOME_DIR;
    process.env.AGORA_DB_PATH = restoreEnv.AGORA_DB_PATH;
    process.env.AGORA_CONFIG_PATH = restoreEnv.AGORA_CONFIG_PATH;
    if (!options.keepTemp) {
      rmSync(smokeRoot, { recursive: true, force: true });
    }
  };

  try {
    ensureBundledAgoraAssetsInstalled({
      projectRoot: join(process.cwd(), '..'),
      bundledSkillsDir: join(process.cwd(), '..', '.skills'),
      userAgoraDir: agoraHomeDir,
      userSkillDirs: [
        join(smokeRoot, 'agents-skills'),
        join(smokeRoot, 'codex-skills'),
      ],
    });

    const projectCreate = await runCli([
      'projects', 'create',
      '--id', options.projectId,
      '--name', 'Nomos Lifecycle Closeout Smoke',
      '--repo-path', repoRoot,
      '--new-repo',
    ], { configPath, dbPath });
    const projectStateRoot = requireLineValue(projectCreate.stdout, 'Project State: ');
    const bootstrapTaskId = requireLineValue(projectCreate.stdout, 'Bootstrap Task: ');

    await runCli(['cancel', bootstrapTaskId, '--reason', 'bootstrap closeout smoke'], { configPath, dbPath });

    const taskCreate = await runCli([
      'create',
      'Nomos lifecycle closeout smoke task',
      '--type', 'quick',
      '--project-id', options.projectId,
    ], { configPath, dbPath });
    const taskId = requireLineValue(taskCreate.stdout, '任务已创建: ');
    const workspaceRoot = join(projectStateRoot, 'tasks', taskId);
    const contextFiles = {
      controller: existsSync(join(workspaceRoot, '04-context', 'project-context-controller.md')),
      craftsman: existsSync(join(workspaceRoot, '04-context', 'project-context-craftsman.md')),
      citizen: existsSync(join(workspaceRoot, '04-context', 'project-context-citizen.md')),
    };

    await runCli(['advance', taskId, '--caller-id', 'archon'], { configPath, dbPath });

    const listed = await runCli(['archive', 'jobs', 'list', '--task-id', taskId, '--json'], { configPath, dbPath });
    const archiveJobs = JSON.parse(listed.stdout) as Array<Record<string, unknown>>;
    const archiveJob = archiveJobs[0];
    if (!archiveJob || typeof archiveJob.id !== 'number') {
      throw new Error(`failed to discover archive job for ${taskId}: ${listed.stdout}`);
    }
    const closeoutReview = archiveJob.payload && typeof archiveJob.payload === 'object'
      ? (archiveJob.payload as Record<string, unknown>).closeout_review as Record<string, unknown> | undefined
      : undefined;
    const harvestDraftPath = typeof closeoutReview?.harvest_draft_path === 'string'
      ? closeoutReview.harvest_draft_path
      : join(workspaceRoot, '07-outputs', 'project-harvest-draft.md');
    const harvestDraftPresent = existsSync(harvestDraftPath);

    await runCli([
      'archive', 'jobs', 'complete', String(archiveJob.id),
      '--commit-hash', 'nomos-lifecycle-closeout-smoke',
    ], { configPath, dbPath });
    const show = await runCli(['archive', 'jobs', 'show', String(archiveJob.id), '--json'], { configPath, dbPath });
    const syncedJob = JSON.parse(show.stdout) as Record<string, unknown>;
    const workspaceDestroyedAfterSync = !existsSync(workspaceRoot);

    const archiveProject = await runCli(['projects', 'archive', options.projectId], { configPath, dbPath });

    let deleteBlocked = false;
    try {
      await runCli(['projects', 'delete', options.projectId], { configPath, dbPath });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/tasks are still bound/i.test(message)) {
        deleteBlocked = true;
      } else {
        throw error;
      }
    }

    process.stdout.write(JSON.stringify({
      smoke_root: smokeRoot,
      project_id: options.projectId,
      bootstrap_task_id: bootstrapTaskId,
      task_id: taskId,
      context_files: contextFiles,
      archive_job_id: archiveJob.id,
      archive_job_status: syncedJob.status ?? null,
      harvest_draft_path: harvestDraftPath,
      harvest_draft_present: harvestDraftPresent,
      workspace_destroyed_after_sync: workspaceDestroyedAfterSync,
      project_archive_stdout: archiveProject.stdout.trim(),
      delete_blocked: deleteBlocked,
    }, null, 2));
    process.stdout.write('\n');
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.stderr.write(`smoke_root=${smokeRoot}\n`);
    process.exitCode = 1;
  } finally {
    cleanup();
  }
}

const isDirectExecution = process.argv[1]
  ? pathToFileURL(process.argv[1]).href === import.meta.url
  : false;

if (isDirectExecution) {
  void runSmokeNomosLifecycleCloseoutMain();
}
