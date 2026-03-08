import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createServerRuntime } from './runtime.js';

const tempPaths: string[] = [];

function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-server-runtime-'));
  tempPaths.push(dir);
  return dir;
}

afterEach(() => {
  while (tempPaths.length > 0) {
    const dir = tempPaths.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('server runtime', () => {
  it('loads config and wires task/dashboard services', () => {
    const dir = makeTempDir();
    const configPath = join(dir, 'agora.json');
    const dbPath = join(dir, 'runtime.db');
    writeFileSync(
      configPath,
      JSON.stringify({
        db_path: dbPath,
        permissions: {
          archonUsers: ['archon'],
          allowAgents: {
            '*': { canCall: [], canAdvance: false },
          },
        },
      }),
    );

    const runtime = createServerRuntime({ configPath });

    expect(runtime.config.db_path).toBe(dbPath);
    expect(runtime.taskService).toBeDefined();
    expect(runtime.dashboardQueryService).toBeDefined();
    runtime.db.close();
  });
});
