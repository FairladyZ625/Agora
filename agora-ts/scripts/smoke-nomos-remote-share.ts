#!/usr/bin/env tsx
import { existsSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
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

function setMachineEnv(homeDir: string) {
  const agoraDir = join(homeDir, '.agora');
  process.env.HOME = homeDir;
  process.env.AGORA_HOME_DIR = agoraDir;
  process.env.AGORA_DB_PATH = join(agoraDir, 'agora.db');
  mkdirSync(homeDir, { recursive: true });
  return {
    configPath: join(agoraDir, 'agora.json'),
    dbPath: join(agoraDir, 'agora.db'),
    agoraDir,
  };
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
  const root = mkdtempSync(join(tmpdir(), 'agora-nomos-remote-share-smoke-'));
  const sourceHome = join(root, 'source-home');
  const targetHome = join(root, 'target-home');
  const sourceRepo = join(root, 'source-repo');
  const targetRepo = join(root, 'target-repo');
  const sharedBundleDir = join(root, 'shared-bundle');

  const previousHome = process.env.HOME;
  const previousAgoraHome = process.env.AGORA_HOME_DIR;
  const previousAgoraDb = process.env.AGORA_DB_PATH;

  try {
    const sourceMachine = setMachineEnv(sourceHome);
    await runCli([
      'projects', 'create',
      '--id', 'proj-remote-share-source',
      '--name', 'Remote Share Source',
      '--repo-path', sourceRepo,
      '--new-repo',
    ], sourceMachine);
    await runCli([
      'nomos', 'publish-project',
      'proj-remote-share-source',
      '--actor', 'archon',
      '--note', 'remote share smoke',
      '--json',
    ], sourceMachine);
    const exported = await runCli([
      'nomos', 'export-bundle',
      '--pack-id', 'project/proj-remote-share-source',
      '--output-dir', sharedBundleDir,
      '--json',
    ], sourceMachine);

    const targetMachine = setMachineEnv(targetHome);
    await runCli([
      'projects', 'create',
      '--id', 'proj-remote-share-target',
      '--name', 'Remote Share Target',
      '--repo-path', targetRepo,
      '--new-repo',
    ], targetMachine);
    const installed = await runCli([
      'nomos', 'install-from-source',
      '--project-id', 'proj-remote-share-target',
      '--source-dir', sharedBundleDir,
      '--json',
    ], targetMachine);
    const listed = await runCli([
      'nomos', 'list-published',
      '--json',
    ], targetMachine);
    const shown = await runCli([
      'nomos', 'show-published',
      'project/proj-remote-share-source',
      '--json',
    ], targetMachine);
    const validated = await runCli([
      'nomos', 'validate-project',
      'proj-remote-share-target',
      '--json',
    ], targetMachine);

    const exportPayload = JSON.parse(exported.stdout) as { pack_id?: string; manifest_path?: string };
    const installPayload = JSON.parse(installed.stdout) as {
      pack?: { pack_id?: string };
      imported?: { entry?: { pack_id?: string; published_by?: string } };
    };
    const listPayload = JSON.parse(listed.stdout) as {
      total?: number;
      entries?: Array<{ pack_id?: string }>;
    };
    const showPayload = JSON.parse(shown.stdout) as {
      pack_id?: string;
      published_by?: string;
      published_note?: string;
    };
    const validatePayload = JSON.parse(validated.stdout) as {
      valid?: boolean;
      pack?: { pack_id?: string };
    };

    if (!existsSync(join(sharedBundleDir, 'nomos-share-bundle.json'))) {
      throw new Error(`share bundle manifest missing: ${sharedBundleDir}`);
    }
    if (exportPayload.pack_id !== 'project/proj-remote-share-source') {
      throw new Error(`unexpected exported bundle payload: ${exported.stdout}`);
    }
    if (!exportPayload.manifest_path || !existsSync(exportPayload.manifest_path)) {
      throw new Error(`exported manifest path missing: ${exported.stdout}`);
    }
    if (installPayload.pack?.pack_id !== 'project/proj-remote-share-source') {
      throw new Error(`unexpected installed pack id: ${installed.stdout}`);
    }
    if (installPayload.imported?.entry?.pack_id !== 'project/proj-remote-share-source') {
      throw new Error(`imported entry missing in install payload: ${installed.stdout}`);
    }
    if (listPayload.total !== 1 || !listPayload.entries?.some((entry) => entry.pack_id === 'project/proj-remote-share-source')) {
      throw new Error(`target catalog did not ingest imported bundle: ${listed.stdout}`);
    }
    if (showPayload.pack_id !== 'project/proj-remote-share-source' || showPayload.published_by !== 'archon' || showPayload.published_note !== 'remote share smoke') {
      throw new Error(`target show-published payload mismatch: ${shown.stdout}`);
    }
    if (validatePayload.valid !== true || validatePayload.pack?.pack_id !== 'project/proj-remote-share-source') {
      throw new Error(`target validation failed: ${validated.stdout}`);
    }

    console.log(JSON.stringify({
      root,
      shared_bundle_dir: sharedBundleDir,
      source_pack_id: exportPayload.pack_id ?? null,
      target_installed_pack_id: installPayload.pack?.pack_id ?? null,
      imported_catalog_total: listPayload.total ?? 0,
      validate_ok: validatePayload.valid ?? false,
    }, null, 2));
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    if (previousAgoraHome === undefined) {
      delete process.env.AGORA_HOME_DIR;
    } else {
      process.env.AGORA_HOME_DIR = previousAgoraHome;
    }
    if (previousAgoraDb === undefined) {
      delete process.env.AGORA_DB_PATH;
    } else {
      process.env.AGORA_DB_PATH = previousAgoraDb;
    }

    if (process.env.KEEP_SMOKE_DIR !== '1') {
      rmSync(root, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
