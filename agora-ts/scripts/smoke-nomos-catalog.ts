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
  const root = mkdtempSync(join(tmpdir(), 'agora-nomos-catalog-smoke-'));
  const homeDir = join(root, 'home');
  const agoraDir = join(homeDir, '.agora');
  const dbPath = join(agoraDir, 'agora.db');
  const configPath = join(agoraDir, 'agora.json');
  const sourceRepo = join(root, 'repo-source');
  const targetRepo = join(root, 'repo-target');

  mkdirSync(homeDir, { recursive: true });
  process.env.HOME = homeDir;
  process.env.AGORA_HOME_DIR = agoraDir;
  process.env.AGORA_DB_PATH = dbPath;

  try {
    await runCli([
      'projects', 'create',
      '--id', 'proj-nomos-catalog-source',
      '--name', 'Nomos Catalog Source',
      '--repo-path', sourceRepo,
      '--new-repo',
    ], { configPath, dbPath });
    await runCli([
      'projects', 'create',
      '--id', 'proj-nomos-catalog-target',
      '--name', 'Nomos Catalog Target',
      '--repo-path', targetRepo,
      '--new-repo',
    ], { configPath, dbPath });

    const published = await runCli([
      'nomos', 'publish-project',
      'proj-nomos-catalog-source',
      '--actor', 'archon',
      '--note', 'catalog smoke',
      '--json',
    ], { configPath, dbPath });
    const listed = await runCli([
      'nomos', 'list-published',
      '--json',
    ], { configPath, dbPath });
    const shown = await runCli([
      'nomos', 'show-published',
      'project/proj-nomos-catalog-source',
      '--json',
    ], { configPath, dbPath });
    const installed = await runCli([
      'nomos', 'install-from-catalog',
      '--project-id', 'proj-nomos-catalog-target',
      '--pack-id', 'project/proj-nomos-catalog-source',
      '--json',
    ], { configPath, dbPath });
    const validated = await runCli([
      'nomos', 'validate-project',
      'proj-nomos-catalog-target',
      '--json',
    ], { configPath, dbPath });

    const publishPayload = JSON.parse(published.stdout) as {
      entry?: { pack_id?: string; published_by?: string; published_note?: string };
      catalog_pack_root?: string;
      manifest_path?: string;
    };
    const listPayload = JSON.parse(listed.stdout) as {
      total?: number;
      summaries?: Array<{ pack_id?: string; published_by?: string }>;
      entries?: Array<{ pack_id?: string }>;
    };
    const showPayload = JSON.parse(shown.stdout) as {
      pack_id?: string;
      published_root?: string;
      published_by?: string;
      published_note?: string;
    };
    const installPayload = JSON.parse(installed.stdout) as {
      pack?: { pack_id?: string };
      catalog_entry?: { pack_id?: string };
    };
    const validatePayload = JSON.parse(validated.stdout) as {
      valid?: boolean;
      pack?: { pack_id?: string };
    };

    if (publishPayload.entry?.pack_id !== 'project/proj-nomos-catalog-source') {
      throw new Error(`unexpected published pack id: ${published.stdout}`);
    }
    if (publishPayload.entry?.published_by !== 'archon' || publishPayload.entry?.published_note !== 'catalog smoke') {
      throw new Error(`published metadata missing: ${published.stdout}`);
    }
    if (!publishPayload.catalog_pack_root || !existsSync(join(publishPayload.catalog_pack_root, 'profile.toml'))) {
      throw new Error(`published catalog root missing profile.toml: ${published.stdout}`);
    }
    if (!publishPayload.manifest_path || !existsSync(publishPayload.manifest_path)) {
      throw new Error(`published manifest missing: ${published.stdout}`);
    }
    if (listPayload.total !== 1 || !listPayload.summaries?.some((entry) => entry.pack_id === 'project/proj-nomos-catalog-source' && entry.published_by === 'archon')) {
      throw new Error(`catalog summary missing published metadata: ${listed.stdout}`);
    }
    if (!listPayload.entries?.some((entry) => entry.pack_id === 'project/proj-nomos-catalog-source')) {
      throw new Error(`catalog listing missing published pack: ${listed.stdout}`);
    }
    if (showPayload.pack_id !== 'project/proj-nomos-catalog-source' || showPayload.published_by !== 'archon' || showPayload.published_note !== 'catalog smoke') {
      throw new Error(`show-published returned wrong pack: ${shown.stdout}`);
    }
    if (installPayload.pack?.pack_id !== 'project/proj-nomos-catalog-source'
      || installPayload.catalog_entry?.pack_id !== 'project/proj-nomos-catalog-source') {
      throw new Error(`install-from-catalog returned wrong pack: ${installed.stdout}`);
    }
    if (validatePayload.valid !== true || validatePayload.pack?.pack_id !== 'project/proj-nomos-catalog-source') {
      throw new Error(`target validation failed: ${validated.stdout}`);
    }

    console.log(JSON.stringify({
      root,
      published_pack_id: publishPayload.entry?.pack_id ?? null,
      installed_pack_id: installPayload.pack?.pack_id ?? null,
      catalog_show_root: showPayload.published_root ?? null,
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
