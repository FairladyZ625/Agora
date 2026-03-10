import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createServerRuntime } from './runtime.js';
import { createAppFromRuntime } from './index.js';

const tempPaths: string[] = [];

function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-server-index-'));
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

describe('server index wiring', () => {
  it('passes taskConversationService from runtime into buildApp', async () => {
    const dir = makeTempDir();
    const configPath = join(dir, 'agora.json');
    const dbPath = join(dir, 'runtime.db');
    writeFileSync(
      configPath,
      JSON.stringify({
        db_path: dbPath,
      }),
    );
    const runtime = createServerRuntime({ configPath });
    const app = createAppFromRuntime(runtime);

    const response = await app.inject({
      method: 'GET',
      url: '/api/tasks/nonexistent/conversation',
    });

    expect(response.statusCode).not.toBe(503);
    runtime.db.close();
  });
});
