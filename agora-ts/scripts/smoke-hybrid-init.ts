#!/usr/bin/env tsx
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { Command } from 'commander';
import { createCliProgram } from '../apps/cli/src/index.js';
import { setupHybridRetrieval } from '../apps/cli/src/hybrid-retrieval-setup.js';
import { findAgoraProjectRoot, loadAgoraDotEnv } from '../packages/config/src/env.js';

export class BufferStream {
  chunks: string[] = [];

  write(chunk: string) {
    this.chunks.push(chunk);
  }

  toString() {
    return this.chunks.join('');
  }
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

export function requireOption(value: string | undefined, name: string) {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`${name} is required`);
  }
  return trimmed;
}

export function resolveHybridSmokeDefaults(startDir: string) {
  const projectRoot = findAgoraProjectRoot(startDir);
  const dotEnv = loadAgoraDotEnv(projectRoot);
  return {
    projectRoot,
    rootEnvPath: join(projectRoot, '.env'),
    apiKey: process.env.OPENAI_API_KEY ?? dotEnv.OPENAI_API_KEY ?? '',
    baseUrl: process.env.OPENAI_BASE_URL ?? dotEnv.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
    model: process.env.OPENAI_EMBEDDING_MODEL ?? dotEnv.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small',
    dimension: process.env.OPENAI_EMBEDDING_DIMENSION ?? dotEnv.OPENAI_EMBEDDING_DIMENSION ?? '',
    qdrantUrl: process.env.QDRANT_URL ?? dotEnv.QDRANT_URL ?? '',
    qdrantApiKey: process.env.QDRANT_API_KEY ?? dotEnv.QDRANT_API_KEY ?? '',
  };
}

export async function runSmokeHybridInitMain() {
  const envDefaults = resolveHybridSmokeDefaults(process.cwd());
  const program = new Command();
  program
    .option('--api-key <key>', 'embedding api key', envDefaults.apiKey)
    .option('--base-url <url>', 'embedding base url', envDefaults.baseUrl)
    .option('--model <model>', 'embedding model', envDefaults.model)
    .option('--dimension <dimension>', 'embedding dimension', envDefaults.dimension)
    .option('--qdrant-url <url>', 'qdrant url', envDefaults.qdrantUrl)
    .option('--qdrant-api-key <key>', 'qdrant api key', envDefaults.qdrantApiKey)
    .option('--keep-temp', 'keep temporary smoke dir', false)
    .parse(process.argv);

  const options = program.opts<{
    apiKey?: string;
    baseUrl: string;
    model: string;
    dimension?: string;
    qdrantUrl?: string;
    qdrantApiKey?: string;
    keepTemp: boolean;
  }>();

  const smokeRoot = mkdtempSync(join(tmpdir(), 'agora-hybrid-init-smoke-'));
  const configPath = join(smokeRoot, 'agora.json');
  const dbPath = join(smokeRoot, 'agora.db');
  const brainPackRoot = join(smokeRoot, 'agora-ai-brain');
  const projectRoot = envDefaults.projectRoot;
  const rootEnvPath = envDefaults.rootEnvPath;
  const originalEnv = existsSync(rootEnvPath) ? readFileSync(rootEnvPath, 'utf8') : null;
  process.env.AGORA_BRAIN_PACK_ROOT = brainPackRoot;
  process.env.AGORA_DB_PATH = dbPath;

  const cleanup = () => {
    if (originalEnv === null) {
      rmSync(rootEnvPath, { force: true });
    } else {
      writeFileSync(rootEnvPath, originalEnv, 'utf8');
    }
    delete process.env.AGORA_BRAIN_PACK_ROOT;
    delete process.env.AGORA_DB_PATH;
    if (!options.keepTemp) {
      rmSync(smokeRoot, { recursive: true, force: true });
    }
  };

  try {
    writeFileSync(configPath, JSON.stringify({
      db_path: dbPath,
      im: { provider: 'none' },
    }, null, 2));

    await setupHybridRetrieval({
      envPath: rootEnvPath,
      embedding: {
        apiKey: requireOption(options.apiKey, 'OPENAI_API_KEY'),
        baseUrl: requireOption(options.baseUrl, 'OPENAI_BASE_URL'),
        model: requireOption(options.model, 'OPENAI_EMBEDDING_MODEL'),
        dimension: options.dimension?.trim() ?? '',
      },
      qdrantUrl: options.qdrantUrl?.trim() || undefined,
      qdrantApiKey: options.qdrantApiKey?.trim() || undefined,
    });

    await runCli(['projects', 'create', '--id', 'proj-hybrid-init-smoke', '--name', 'Hybrid Init Smoke'], { configPath, dbPath });
    await runCli(['citizens', 'create', '--id', 'citizen-alpha', '--project', 'proj-hybrid-init-smoke', '--role', 'architect', '--name', 'Alpha Architect'], { configPath, dbPath });
    await runCli([
      'projects', 'brain', 'append',
      '--project', 'proj-hybrid-init-smoke',
      '--kind', 'decision',
      '--slug', 'runtime-boundary',
      '--title', 'Runtime Boundary',
      '--summary', 'Keep runtime adapters outside core.',
      '--body', 'Runtime adapters stay outside core and expose provider-neutral ports.',
    ], { configPath, dbPath });
    const createResult = await runCli([
      'create',
      'Hybrid init smoke task',
      '--type', 'coding',
      '--project-id', 'proj-hybrid-init-smoke',
      '--bind', 'architect=opus',
      '--bind', 'developer=citizen-alpha',
      '--bind', 'reviewer=gpt52',
      '--bind', 'craftsman=codex',
    ], { configPath, dbPath });
    const taskId = createResult.stdout.split('\n').find((line) => line.startsWith('任务已创建: '))?.replace('任务已创建: ', '').trim();
    if (!taskId) {
      throw new Error(`failed to parse task id from output:\n${createResult.stdout}`);
    }

    const rebuild = await runCli(['projects', 'brain', 'index', 'rebuild', '--project', 'proj-hybrid-init-smoke', '--json'], { configPath, dbPath });
    const query = await runCli([
      'projects', 'brain', 'query',
      '--task', taskId,
      '--audience', 'craftsman',
      '--query', 'provider neutral runtime boundary',
      '--mode', 'auto',
      '--json',
    ], { configPath, dbPath });
    const bootstrap = await runCli([
      'projects', 'brain', 'bootstrap-context',
      '--task', taskId,
      '--audience', 'craftsman',
      '--json',
    ], { configPath, dbPath });

    const queryJson = JSON.parse(query.stdout) as { retrieval_mode?: string; results?: Array<{ slug?: string }> };
    const bootstrapJson = JSON.parse(bootstrap.stdout) as { source_documents?: Array<{ kind?: string; slug?: string }> };
    process.stdout.write(JSON.stringify({
      smoke_root: smokeRoot,
      task_id: taskId,
      rebuild: JSON.parse(rebuild.stdout),
      query: {
        retrieval_mode: queryJson.retrieval_mode ?? null,
        top_hit: queryJson.results?.[0]?.slug ?? null,
      },
      bootstrap_source_documents: (bootstrapJson.source_documents ?? []).map((item) => `${item.kind}:${item.slug}`),
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
  void runSmokeHybridInitMain();
}
