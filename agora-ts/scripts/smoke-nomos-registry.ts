#!/usr/bin/env tsx
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

function updatePackVersion(profilePath: string, nextVersion: string) {
  const current = readFileSync(profilePath, 'utf8');
  const updated = current.replace(/version = "([^"]+)"/, `version = "${nextVersion}"`);
  if (current === updated) {
    throw new Error(`failed to update pack version in ${profilePath}`);
  }
  writeFileSync(profilePath, updated, 'utf8');
}

async function main() {
  const root = mkdtempSync(join(tmpdir(), 'agora-nomos-registry-smoke-'));
  const sourceHome = join(root, 'source-home');
  const targetHome = join(root, 'target-home');
  const sourceRepo = join(root, 'source-repo');
  const targetRepo = join(root, 'target-repo');
  const sharedSourceDir = join(root, 'shared-source-pack');

  const previousHome = process.env.HOME;
  const previousAgoraHome = process.env.AGORA_HOME_DIR;
  const previousAgoraDb = process.env.AGORA_DB_PATH;

  try {
    const sourceMachine = setMachineEnv(sourceHome);
    await runCli([
      'projects', 'create',
      '--id', 'proj-registry-source',
      '--name', 'Registry Source',
      '--repo-path', sourceRepo,
      '--new-repo',
    ], sourceMachine);
    await runCli([
      'nomos', 'export-project',
      'proj-registry-source',
      '--output-dir', sharedSourceDir,
    ], sourceMachine);

    const targetMachine = setMachineEnv(targetHome);
    await runCli([
      'projects', 'create',
      '--id', 'proj-registry-target',
      '--name', 'Registry Target',
      '--repo-path', targetRepo,
      '--new-repo',
    ], targetMachine);
    const registered = await runCli([
      'nomos', 'register-source',
      '--source-id', 'team/registry-demo',
      '--source-dir', sharedSourceDir,
      '--json',
    ], targetMachine);
    const listed = await runCli([
      'nomos', 'list-sources',
      '--json',
    ], targetMachine);
    const shown = await runCli([
      'nomos', 'show-source',
      'team/registry-demo',
      '--json',
    ], targetMachine);
    const syncedV1 = await runCli([
      'nomos', 'sync-registered-source',
      '--source-id', 'team/registry-demo',
      '--json',
    ], targetMachine);
    const installedV1 = await runCli([
      'nomos', 'install-from-registered-source',
      '--project-id', 'proj-registry-target',
      '--source-id', 'team/registry-demo',
      '--json',
    ], targetMachine);
    const reviewedV1 = await runCli([
      'nomos', 'review-project',
      'proj-registry-target',
      '--json',
    ], targetMachine);
    const activatedV1 = await runCli([
      'nomos', 'activate-project',
      '--project-id', 'proj-registry-target',
      '--actor', 'archon',
      '--json',
    ], targetMachine);
    const validatedActiveV1 = await runCli([
      'nomos', 'validate-project',
      'proj-registry-target',
      '--target', 'active',
      '--json',
    ], targetMachine);

    updatePackVersion(join(sharedSourceDir, 'profile.toml'), '0.2.0');

    const syncedV2 = await runCli([
      'nomos', 'sync-registered-source',
      '--source-id', 'team/registry-demo',
      '--json',
    ], targetMachine);
    const installedV2 = await runCli([
      'nomos', 'install-from-registered-source',
      '--project-id', 'proj-registry-target',
      '--source-id', 'team/registry-demo',
      '--json',
    ], targetMachine);
    const diffed = await runCli([
      'nomos', 'diff-project',
      'proj-registry-target',
      '--base', 'active',
      '--candidate', 'draft',
      '--json',
    ], targetMachine);
    const reviewedV2 = await runCli([
      'nomos', 'review-project',
      'proj-registry-target',
      '--json',
    ], targetMachine);

    const registeredPayload = JSON.parse(registered.stdout) as { source_id?: string; source_kind?: string };
    const listedPayload = JSON.parse(listed.stdout) as { total?: number; entries?: Array<{ source_id?: string; last_sync_status?: string }> };
    const shownPayload = JSON.parse(shown.stdout) as { source_id?: string; last_sync_status?: string };
    const syncedV1Payload = JSON.parse(syncedV1.stdout) as {
      source?: { last_sync_status?: string; last_catalog_pack_id?: string };
      imported?: { entry?: { pack_id?: string; pack?: { version?: string } } };
    };
    const installedV1Payload = JSON.parse(installedV1.stdout) as { pack?: { pack_id?: string; version?: string } };
    const reviewedV1Payload = JSON.parse(reviewedV1.stdout) as { can_activate?: boolean; draft?: { pack_id?: string; version?: string } };
    const activatedV1Payload = JSON.parse(activatedV1.stdout) as { activation_status?: string; nomos_id?: string };
    const validatedActiveV1Payload = JSON.parse(validatedActiveV1.stdout) as { valid?: boolean; pack?: { version?: string } };
    const syncedV2Payload = JSON.parse(syncedV2.stdout) as {
      source?: { last_sync_status?: string; last_catalog_pack_id?: string };
      imported?: { entry?: { pack_id?: string; pack?: { version?: string } } };
    };
    const installedV2Payload = JSON.parse(installedV2.stdout) as { pack?: { pack_id?: string; version?: string } };
    const diffedPayload = JSON.parse(diffed.stdout) as { changed?: boolean; candidate_pack?: { version?: string }; differences?: Array<{ field?: string }> };
    const reviewedV2Payload = JSON.parse(reviewedV2.stdout) as { can_activate?: boolean; draft?: { version?: string } };

    if (registeredPayload.source_id !== 'team/registry-demo' || registeredPayload.source_kind !== 'pack_root') {
      throw new Error(`unexpected register payload: ${registered.stdout}`);
    }
    if (listedPayload.total !== 1 || !listedPayload.entries?.some((entry) => entry.source_id === 'team/registry-demo')) {
      throw new Error(`registered source not listed: ${listed.stdout}`);
    }
    if (shownPayload.source_id !== 'team/registry-demo' || shownPayload.last_sync_status !== 'never') {
      throw new Error(`unexpected show-source payload before sync: ${shown.stdout}`);
    }
    if (syncedV1Payload.source?.last_sync_status !== 'ok'
      || syncedV1Payload.source?.last_catalog_pack_id !== 'project/proj-registry-source'
      || syncedV1Payload.imported?.entry?.pack_id !== 'project/proj-registry-source'
      || syncedV1Payload.imported?.entry?.pack?.version !== '0.1.0') {
      throw new Error(`unexpected first sync payload: ${syncedV1.stdout}`);
    }
    if (installedV1Payload.pack?.pack_id !== 'project/proj-registry-source' || installedV1Payload.pack?.version !== '0.1.0') {
      throw new Error(`unexpected first install payload: ${installedV1.stdout}`);
    }
    if (reviewedV1Payload.can_activate !== true || reviewedV1Payload.draft?.pack_id !== 'project/proj-registry-source') {
      throw new Error(`unexpected first review payload: ${reviewedV1.stdout}`);
    }
    if (activatedV1Payload.activation_status !== 'active_project' || activatedV1Payload.nomos_id !== 'project/proj-registry-source') {
      throw new Error(`unexpected activate payload: ${activatedV1.stdout}`);
    }
    if (validatedActiveV1Payload.valid !== true || validatedActiveV1Payload.pack?.version !== '0.1.0') {
      throw new Error(`unexpected active validation payload: ${validatedActiveV1.stdout}`);
    }
    if (syncedV2Payload.source?.last_sync_status !== 'ok'
      || syncedV2Payload.imported?.entry?.pack?.version !== '0.2.0') {
      throw new Error(`unexpected second sync payload: ${syncedV2.stdout}`);
    }
    if (installedV2Payload.pack?.version !== '0.2.0') {
      throw new Error(`unexpected second install payload: ${installedV2.stdout}`);
    }
    if (diffedPayload.changed !== true || diffedPayload.candidate_pack?.version !== '0.2.0'
      || !diffedPayload.differences?.some((entry) => entry.field === 'version')) {
      throw new Error(`unexpected diff payload after source update: ${diffed.stdout}`);
    }
    if (reviewedV2Payload.can_activate !== true || reviewedV2Payload.draft?.version !== '0.2.0') {
      throw new Error(`unexpected second review payload: ${reviewedV2.stdout}`);
    }

    console.log(JSON.stringify({
      root,
      source_id: 'team/registry-demo',
      shared_source_dir: sharedSourceDir,
      initial_version: '0.1.0',
      updated_version: '0.2.0',
      active_version_before_update: validatedActiveV1Payload.pack?.version ?? null,
      draft_version_after_update: reviewedV2Payload.draft?.version ?? null,
      diff_changed: diffedPayload.changed ?? false,
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
