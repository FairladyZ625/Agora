#!/usr/bin/env tsx
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { prepareProjectNomosInstall } from '../packages/config/src/nomos.js';
import { createAgoraDatabase, runMigrations } from '../packages/db/src/index.js';
import { createProjectServiceFromDb } from '../packages/testing/src/index.js';
import { ContextMaterializationService } from '../packages/core/src/index.js';
import { RuntimeRepoShimMaterializer, RuntimeRepoShimWritebackService } from '../packages/adapters-materialization/src/index.js';
import { buildApp } from '../apps/server/src/app.js';
import { createCliProgram } from '../apps/cli/src/index.js';

class BufferStream {
  chunks: string[] = [];

  write(chunk: string) {
    this.chunks.push(chunk);
  }

  toString() {
    return this.chunks.join('');
  }
}

async function runCliCommand(args: string[], options: Parameters<typeof createCliProgram>[0]) {
  const stdout = new BufferStream();
  const stderr = new BufferStream();
  const previousExitCode = process.exitCode;
  process.exitCode = 0;
  const program = createCliProgram({
    ...options,
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
  const smokeRoot = mkdtempSync(join(tmpdir(), 'agora-context-write-repo-shim-'));
  const previousAgoraHomeDir = process.env.AGORA_HOME_DIR;
  const agoraHomeDir = join(smokeRoot, 'agora-home');
  process.env.AGORA_HOME_DIR = agoraHomeDir;
  const dbPath = join(smokeRoot, 'agora.db');
  const repoRoot = join(smokeRoot, 'repo');
  const db = createAgoraDatabase({ dbPath });
  runMigrations(db);

  try {
    const projectService = createProjectServiceFromDb(db);
    projectService.createProject({
      id: 'proj-shim-smoke',
      name: 'Repo Shim Smoke',
      owner: 'archon',
    });

    const preparedNomos = prepareProjectNomosInstall({
      projectId: 'proj-shim-smoke',
      projectName: 'Repo Shim Smoke',
      projectOwner: 'archon',
      metadata: {},
      repoPath: repoRoot,
      initializeRepo: true,
      writeRepoShim: false,
      userAgoraDir: agoraHomeDir,
    });
    projectService.updateProjectMetadata('proj-shim-smoke', preparedNomos.persistedMetadata);

    const contextMaterializationService = new ContextMaterializationService({
      ports: [
        new RuntimeRepoShimMaterializer({
          projectService,
          userAgoraDir: agoraHomeDir,
        }),
      ],
    });
    const runtimeRepoShimWritebackService = new RuntimeRepoShimWritebackService({
      projectService,
      contextMaterializationService,
    });

    const app = buildApp({
      projectService,
      contextMaterializationService,
      runtimeRepoShimWritebackService,
    });

    const restResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/proj-shim-smoke/context/write-repo-shim',
      payload: {
        target: 'codex_repo_shim',
      },
    });
    if (restResponse.statusCode !== 200) {
      throw new Error(`rest smoke failed: ${restResponse.statusCode} ${restResponse.body}`);
    }
    const restJson = restResponse.json();
    if (restJson.writeback?.status !== 'written') {
      throw new Error(`unexpected rest writeback status: ${JSON.stringify(restJson)}`);
    }

    const cliResult = await runCliCommand([
      'context',
      'write-repo-shim',
      '--project', 'proj-shim-smoke',
      '--target', 'claude_repo_shim',
      '--json',
    ], {
      projectService,
      contextMaterializationService,
      runtimeRepoShimWritebackService,
    });

    const agentsPath = join(repoRoot, 'AGENTS.md');
    const claudePath = join(repoRoot, 'CLAUDE.md');
    if (!existsSync(agentsPath) || !existsSync(claudePath)) {
      throw new Error(`expected repo shim files to exist under ${repoRoot}`);
    }
    if (!readFileSync(agentsPath, 'utf8').includes('# AGENTS.md')) {
      throw new Error('AGENTS.md smoke output missing header');
    }
    if (!readFileSync(claudePath, 'utf8').includes('# CLAUDE.md')) {
      throw new Error('CLAUDE.md smoke output missing header');
    }
    if (!cliResult.stdout.includes('"filename": "CLAUDE.md"')) {
      throw new Error('cli smoke output missing CLAUDE.md filename');
    }

    console.log(JSON.stringify({
      ok: true,
      repo_root: repoRoot,
      files: [agentsPath, claudePath],
      rest_status: restJson.writeback.status,
    }, null, 2));
  } finally {
    if (previousAgoraHomeDir === undefined) {
      delete process.env.AGORA_HOME_DIR;
    } else {
      process.env.AGORA_HOME_DIR = previousAgoraHomeDir;
    }
    rmSync(smokeRoot, { recursive: true, force: true });
  }
}

await main();
