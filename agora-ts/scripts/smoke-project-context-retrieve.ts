#!/usr/bin/env tsx
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { buildApp } from '../apps/server/src/app.js';
import { createCliProgram } from '../apps/cli/src/index.js';
import { FilesystemContextSourceRetrievalAdapter, FilesystemProjectBrainQueryAdapter, FilesystemProjectKnowledgeAdapter } from '../packages/adapters-brain/src/index.js';
import { ContextSourceBindingService, RetrievalRegistry, RetrievalService, ProjectBrainRetrievalService, ProjectBrainService } from '../packages/core/src/index.js';
import { createAgoraDatabase, runMigrations, type StoredTask } from '../packages/db/src/index.js';
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
  const docsRoot = join(smokeRoot, 'docs-main');
  mkdirSync(brainPackRoot, { recursive: true });
  mkdirSync(projectStateRoot, { recursive: true });
  mkdirSync(docsRoot, { recursive: true });
  writeFileSync(
    join(docsRoot, 'architecture.md'),
    '# Context Harness\n\nProject context retrieval must stay reference-first and source-aware.\n',
    'utf8',
  );

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
    const contextSourceBindingService = new ContextSourceBindingService({
      projectService,
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
    contextSourceBindingService.replaceProjectBindings('proj-smoke', [
      {
        source_id: 'docs-main',
        scope: 'project',
        project_id: 'proj-smoke',
        kind: 'docs_repo',
        label: 'Docs Main',
        location: docsRoot,
        access: 'read_only',
        enabled: true,
      },
    ]);

    const taskLookup = {
      getTask(taskId: string): StoredTask | null {
        if (taskId !== 'OC-200') {
          return null;
        }
        return {
          id: 'OC-200',
          version: 1,
          title: 'Smoke retrieval task',
          description: 'Validate task-aware project context retrieval.',
          type: 'coding',
          priority: 'normal',
          creator: 'archon',
          locale: 'zh-CN',
          project_id: 'proj-smoke',
          skill_policy: null,
          state: 'active',
          archive_status: null,
          current_stage: 'implement',
          team: { members: [] },
          workflow: { stages: [] },
          control: { mode: 'normal' },
          scheduler: null,
          scheduler_snapshot: null,
          discord: null,
          metrics: null,
          error_detail: null,
          created_at: '2026-04-11T00:00:00.000Z',
          updated_at: '2026-04-11T00:00:00.000Z',
        };
      },
    };

    const retrievalService = new RetrievalService({
      registry: new RetrievalRegistry([
        new ProjectBrainRetrievalService({
          taskLookup,
          projectBrainService,
        }),
        new FilesystemContextSourceRetrievalAdapter({
          listProjectBindings: (projectId: string) => contextSourceBindingService.listProjectBindings(projectId),
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
    const taskAwareCliResult = await runCliCommand([
      'context',
      'retrieve',
      '--project', 'proj-smoke',
      '--task', 'OC-200',
      '--provider', 'project_brain',
      '--query', 'runtime boundary',
      '--limit', '5',
      '--json',
    ], retrievalService);
    const sourceAwareRestResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/proj-smoke/context/retrieve',
      payload: {
        query: {
          text: 'context harness',
        },
        providers: ['filesystem_context_source'],
        source_ids: ['docs-main'],
        limit: 5,
      },
    });
    if (sourceAwareRestResponse.statusCode !== 200) {
      throw new Error(`source-aware rest smoke failed: ${sourceAwareRestResponse.statusCode} ${sourceAwareRestResponse.body}`);
    }
    const sourceAwareCliResult = await runCliCommand([
      'context',
      'retrieve',
      '--project', 'proj-smoke',
      '--query', 'context harness',
      '--provider', 'filesystem_context_source',
      '--source', 'docs-main',
      '--limit', '5',
      '--json',
    ], retrievalService);
    const healthRestResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/proj-smoke/context/health',
      payload: {
        task_id: 'OC-200',
        providers: ['filesystem_context_source'],
        source_ids: ['docs-main'],
      },
    });
    if (healthRestResponse.statusCode !== 200) {
      throw new Error(`health rest smoke failed: ${healthRestResponse.statusCode} ${healthRestResponse.body}`);
    }
    const healthCliResult = await runCliCommand([
      'context',
      'health',
      '--project', 'proj-smoke',
      '--task', 'OC-200',
      '--provider', 'filesystem_context_source',
      '--source', 'docs-main',
      '--json',
    ], retrievalService);

    const restJson = restResponse.json();
    const sourceAwareRestJson = sourceAwareRestResponse.json();
    const healthRestJson = healthRestResponse.json();
    if (!Array.isArray(restJson.results) || restJson.results.length === 0) {
      throw new Error('rest smoke returned no retrieval results');
    }
    if (!cliResult.stdout.includes('"reference_key": "decision:runtime-boundary"')) {
      throw new Error('cli smoke missing decision:runtime-boundary result');
    }
    if (!taskAwareCliResult.stdout.includes('"provider": "project_brain"')) {
      throw new Error('task-aware cli smoke missing project_brain provider');
    }
    if (!Array.isArray(sourceAwareRestJson.results) || sourceAwareRestJson.results.length === 0) {
      throw new Error('source-aware rest smoke returned no retrieval results');
    }
    if (!sourceAwareCliResult.stdout.includes('"source_id": "docs-main"')) {
      throw new Error('source-aware cli smoke missing docs-main source id');
    }
    if (!Array.isArray(healthRestJson.health) || healthRestJson.health.length === 0) {
      throw new Error('health rest smoke returned no health results');
    }
    if (!healthCliResult.stdout.includes('"status": "ready"')) {
      throw new Error('health cli smoke missing ready status');
    }

    process.stdout.write(JSON.stringify({
      smoke_root: smokeRoot,
      rest: {
        result_count: restJson.results.length,
        first_reference_key: restJson.results[0]?.reference_key ?? null,
      },
      source_aware_rest: {
        result_count: sourceAwareRestJson.results.length,
        first_reference_key: sourceAwareRestJson.results[0]?.reference_key ?? null,
      },
      cli: {
        stdout: cliResult.stdout.trim().split('\n'),
      },
      task_aware_cli: {
        stdout: taskAwareCliResult.stdout.trim().split('\n'),
      },
      source_aware_cli: {
        stdout: sourceAwareCliResult.stdout.trim().split('\n'),
      },
      health_rest: {
        health_count: healthRestJson.health.length,
        first_provider: healthRestJson.health[0]?.provider ?? null,
      },
      health_cli: {
        stdout: healthCliResult.stdout.trim().split('\n'),
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
