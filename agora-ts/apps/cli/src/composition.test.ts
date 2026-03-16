import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TaskService } from '@agora-ts/core';
import { createCliComposition } from './composition.js';

const tempDirs: string[] = [];

function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-cli-composition-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  delete process.env.AGORA_BRAIN_PACK_ROOT;
  delete process.env.AGORA_CRAFTSMAN_CLI_MODE;
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('cli composition', () => {
  it('wires acp craftsman ports into cli composition when cli mode is acp', () => {
    const dir = makeTempDir();
    const configPath = join(dir, 'agora.json');
    const dbPath = join(dir, 'runtime.db');
    process.env.AGORA_BRAIN_PACK_ROOT = join(dir, 'brain-pack');
    process.env.AGORA_CRAFTSMAN_CLI_MODE = 'acp';

    writeFileSync(configPath, JSON.stringify({ db_path: dbPath }));

    let capturedDeps: Record<string, string> | null = null;
    let dispatcherRuntime: object | undefined;
    let inputRuntime: object | undefined;
    const composition = createCliComposition(
      { configPath, dbPath },
      {
        createTaskService: (context, deps) => {
          capturedDeps = {
            input: deps.craftsmanInputPort.constructor.name,
            probe: deps.craftsmanExecutionProbePort.constructor.name,
            tail: deps.craftsmanExecutionTailPort.constructor.name,
            recovery: deps.runtimeRecoveryPort.constructor.name,
          };
          const adapters = Reflect.get(deps.craftsmanDispatcher as object, 'adapters') as Record<string, unknown> | undefined;
          const adapter = adapters?.codex ?? adapters?.claude ?? adapters?.gemini;
          dispatcherRuntime = adapter && typeof adapter === 'object'
            ? Reflect.get(adapter, 'runtime') as object | undefined
            : undefined;
          inputRuntime = Reflect.get(deps.craftsmanInputPort as object, 'runtime') as object | undefined;
          return new TaskService(context.db, {
            templatesDir: context.templatesDir,
          });
        },
      },
    );

    expect(capturedDeps).toEqual({
      input: 'AcpCraftsmanInputPort',
      probe: 'AcpCraftsmanProbePort',
      tail: 'AcpCraftsmanTailPort',
      recovery: 'AcpRuntimeRecoveryPort',
    });
    expect(dispatcherRuntime).toBeDefined();
    expect(inputRuntime).toBe(dispatcherRuntime);

    composition.db.close();
  });
});
