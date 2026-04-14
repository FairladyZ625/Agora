#!/usr/bin/env tsx
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { createCliProgram } from '../apps/cli/dist/index.js';

class BufferStream {
  private readonly chunks: string[] = [];

  write(chunk: string) {
    this.chunks.push(chunk);
  }

  toString() {
    return this.chunks.join('');
  }
}

async function runCli(args: string[], options: { configPath: string; dbPath: string }) {
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

async function main() {
  const root = mkdtempSync(join(tmpdir(), 'agora-nomos-shim-refresh-'));
  const homeDir = join(root, 'home');
  const agoraDir = join(homeDir, '.agora');
  const dbPath = join(agoraDir, 'agora.db');
  const configPath = join(agoraDir, 'agora.json');
  const repoRoot = join(root, 'repo');

  process.env.HOME = homeDir;
  process.env.AGORA_HOME_DIR = agoraDir;
  process.env.AGORA_DB_PATH = dbPath;

  try {
    await runCli([
      'projects', 'create',
      '--id', 'proj-shim-refresh',
      '--name', 'Shim Refresh Project',
      '--repo-path', repoRoot,
      '--new-repo',
    ], { configPath, dbPath });

    const agentsPath = join(repoRoot, 'AGENTS.md');
    const claudePath = join(repoRoot, 'CLAUDE.md');
    if (!existsSync(agentsPath) || !existsSync(claudePath)) {
      throw new Error('repo shim files were not created during project create');
    }
    const createAgents = readFileSync(agentsPath, 'utf8');
    const createClaude = readFileSync(claudePath, 'utf8');
    if (!createAgents.includes('agora/default@0.1.0')) {
      throw new Error('AGENTS.md did not reflect built-in active pack after project create');
    }
    if (!createClaude.includes('agora/default@0.1.0')) {
      throw new Error('CLAUDE.md did not reflect built-in active pack after project create');
    }

    await runCli([
      'nomos', 'activate-project',
      '--project-id', 'proj-shim-refresh',
      '--actor', 'archon',
    ], { configPath, dbPath });

    const activatedAgents = readFileSync(agentsPath, 'utf8');
    const activatedClaude = readFileSync(claudePath, 'utf8');
    if (!activatedAgents.includes('project/proj-shim-refresh')) {
      throw new Error('AGENTS.md did not refresh to active project pack');
    }
    if (!activatedClaude.includes('project/proj-shim-refresh')) {
      throw new Error('CLAUDE.md did not refresh to active project pack');
    }

    console.log(JSON.stringify({
      ok: true,
      repo_root: repoRoot,
      created_pack: 'agora/default@0.1.0',
      activated_pack: 'project/proj-shim-refresh',
      files: [agentsPath, claudePath],
    }, null, 2));
  } finally {
    if (process.env.KEEP_SMOKE_DIR !== '1') {
      rmSync(root, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
