#!/usr/bin/env tsx
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { buildApp } from '../apps/server/src/app.js';
import { createCliProgram } from '../apps/cli/src/index.js';
import { FilesystemProjectBrainQueryAdapter, FilesystemProjectKnowledgeAdapter } from '../packages/adapters-brain/src/index.js';
import { RetrievalRegistry, RetrievalService, ProjectBrainRetrievalService, ProjectBrainService } from '../packages/core/src/index.js';
import { createAgoraDatabase, runMigrations } from '../packages/db/src/index.js';
import { createCitizenServiceFromDb, createProjectServiceFromDb, createRolePackServiceFromDb } from '../packages/testing/src/index.js';

class BufferStream {
  chunks: string[] = [];

  write(chunk: string) {
    this.chunks.push(chunk);
  }

  toString() {
    return this.chunks.join('');
  }
}

async function runCliCommand(args: string[], retrievalService: RetrievalService) {
  const stdout = new BufferStream();
  const stderr = new BufferStream();
  const previousExitCode = process.exitCode;
  process.exitCode = 0;
  const program = createCliProgram({
    contextRetrievalService: retrievalService,
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
  const smokeRoot = mkdtempSync(join(tmpdir(), 'agora-project-context-retrieve-smoke-'));
  const dbPath = join(smokeRoot, 'agora.db');
  const brainPackRoot = join(smokeRoot, 'brain-pack');
  const projectStateRoot = join(smokeRoot, 'projects', 'proj-smoke');
  mkdirSync(brainPackRoot, { recursive: true });
  mkdirSync(projectStateRoot, { recursive: true });

  const db = createAgoraDatabase({ dbPath });
  runMigrations(db);

  try {
    const projectService = createProjectServiceFromDb(db, {
      knowledgePort: new FilesystemProjectKnowledgeAdapter({
        brainPackRoot,
        projectStateRootResolver: () => projectStateRoot,
      }),
    });
    const rolePackService = createRolePackServiceFromDb(db, {
      rolePacksDir: join(process.cwd(), 'role-packs', 'agora-default'),
    });
    const citizenService = createCitizenServiceFromDb(db, {
      projectService,
      rolePackService,
    });
    const projectBrainService = new ProjectBrainService({
      projectService,
      citizenService,
      projectBrainQueryPort: new FilesystemProjectBrainQueryAdapter({
        brainPackRoot,
        projectStateRootResolver: () => projectStateRoot,
      }),
    });
    projectService.createProject({
      id: 'proj-smoke',
      name: 'Smoke Retrieval Project',
      summary: 'retrieval smoke',
      owner: 'archon',
    });
    projectService.upsertKnowledgeEntry({
      project_id: 'proj-smoke',
      kind: 'decision',
      slug: 'runtime-boundary',
      title: 'Runtime Boundary',
      summary: 'Keep runtime-specific logic out of core.',
      body: 'Keep runtime-specific logic out of core.',
      source_task_ids: [],
    });

    const retrievalService = new RetrievalService({
      registry: new RetrievalRegistry([
        new ProjectBrainRetrievalService({
          projectBrainService,
        }),
      ]),
    });

    const app = buildApp({
      projectService,
      contextRetrievalService: retrievalService,
    });

    const restResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/proj-smoke/context/retrieve',
      payload: {
        mode: 'lookup',
        query: {
          text: 'runtime boundary',
        },
        limit: 5,
      },
    });
    if (restResponse.statusCode !== 200) {
      throw new Error(`rest smoke failed: ${restResponse.statusCode} ${restResponse.body}`);
    }

    const cliResult = await runCliCommand([
      'context',
      'retrieve',
      '--project', 'proj-smoke',
      '--query', 'runtime boundary',
      '--limit', '5',
      '--json',
    ], retrievalService);

    const restJson = restResponse.json();
    if (!Array.isArray(restJson.results) || restJson.results.length === 0) {
      throw new Error('rest smoke returned no retrieval results');
    }
    if (!cliResult.stdout.includes('"reference_key": "decision:runtime-boundary"')) {
      throw new Error('cli smoke missing decision:runtime-boundary result');
    }

    process.stdout.write(JSON.stringify({
      smoke_root: smokeRoot,
      rest: {
        result_count: restJson.results.length,
        first_reference_key: restJson.results[0]?.reference_key ?? null,
      },
      cli: {
        stdout: cliResult.stdout.trim().split('\n'),
      },
    }, null, 2));
    process.stdout.write('\n');

    await app.close();
  } finally {
    db.close();
    rmSync(smokeRoot, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
