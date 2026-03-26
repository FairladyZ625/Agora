#!/usr/bin/env tsx
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
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
  const root = mkdtempSync(join(tmpdir(), 'agora-nomos-reuse-smoke-'));
  const homeDir = join(root, 'home');
  const agoraDir = join(homeDir, '.agora');
  const dbPath = join(agoraDir, 'agora.db');
  const configPath = join(agoraDir, 'agora.json');
  const sourceRepo = join(root, 'repo-source');
  const targetRepo = join(root, 'repo-target');
  const exportDir = join(root, 'exported-pack');

  mkdirSync(homeDir, { recursive: true });
  process.env.HOME = homeDir;
  process.env.AGORA_HOME_DIR = agoraDir;
  process.env.AGORA_DB_PATH = dbPath;

  try {
    await runCli([
      'projects', 'create',
      '--id', 'proj-nomos-reuse-source',
      '--name', 'Nomos Reuse Source',
      '--repo-path', sourceRepo,
      '--new-repo',
    ], { configPath, dbPath });
    await runCli([
      'projects', 'create',
      '--id', 'proj-nomos-reuse-target',
      '--name', 'Nomos Reuse Target',
      '--repo-path', targetRepo,
      '--new-repo',
    ], { configPath, dbPath });
    const exported = await runCli([
      'nomos', 'export-project',
      'proj-nomos-reuse-source',
      '--output-dir', exportDir,
      '--json',
    ], { configPath, dbPath });
    const installed = await runCli([
      'nomos', 'install-pack',
      '--project-id', 'proj-nomos-reuse-target',
      '--pack-dir', exportDir,
      '--json',
    ], { configPath, dbPath });
    const validated = await runCli([
      'nomos', 'validate-project',
      'proj-nomos-reuse-target',
      '--json',
    ], { configPath, dbPath });

    const exportPayload = JSON.parse(exported.stdout) as { pack?: { pack_id?: string } };
    const installPayload = JSON.parse(installed.stdout) as { pack?: { pack_id?: string }, installed_root?: string };
    const validatePayload = JSON.parse(validated.stdout) as { valid?: boolean; pack?: { pack_id?: string } };

    if (!existsSync(join(exportDir, 'profile.toml'))) {
      throw new Error(`exported pack is missing profile.toml: ${exportDir}`);
    }
    if (exportPayload.pack?.pack_id !== 'project/proj-nomos-reuse-source') {
      throw new Error(`unexpected exported pack id: ${exported.stdout}`);
    }
    if (installPayload.pack?.pack_id !== 'project/proj-nomos-reuse-source') {
      throw new Error(`unexpected installed pack id: ${installed.stdout}`);
    }
    if (!installPayload.installed_root || !existsSync(installPayload.installed_root)) {
      throw new Error(`installed_root is missing: ${installed.stdout}`);
    }
    if (validatePayload.valid !== true || validatePayload.pack?.pack_id !== 'project/proj-nomos-reuse-source') {
      throw new Error(`target validation failed: ${validated.stdout}`);
    }

    console.log(JSON.stringify({
      root,
      export_dir: exportDir,
      exported_pack_id: exportPayload.pack?.pack_id ?? null,
      installed_pack_id: installPayload.pack?.pack_id ?? null,
      validate_ok: validatePayload.valid ?? false,
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
