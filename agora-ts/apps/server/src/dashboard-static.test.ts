import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

const tempPaths: string[] = [];

function makeDashboardDir() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-dashboard-static-'));
  tempPaths.push(dir);
  mkdirSync(join(dir, 'assets'), { recursive: true });
  writeFileSync(join(dir, 'index.html'), '<html><body>dashboard shell</body></html>');
  writeFileSync(join(dir, 'assets', 'main.js'), 'console.log("dashboard");');
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

describe('dashboard static hosting', () => {
  it('serves dashboard shell, assets, and SPA fallback', async () => {
    const dashboardDir = makeDashboardDir();
    const app = buildApp({ dashboardDir });

    const shell = await app.inject({ method: 'GET', url: '/dashboard' });
    const asset = await app.inject({ method: 'GET', url: '/dashboard/assets/main.js' });
    const fallback = await app.inject({ method: 'GET', url: '/dashboard/tasks/OC-100' });

    expect(shell.statusCode).toBe(200);
    expect(shell.body).toContain('dashboard shell');
    expect(asset.statusCode).toBe(200);
    expect(asset.body).toContain('console.log');
    expect(fallback.statusCode).toBe(200);
    expect(fallback.body).toContain('dashboard shell');
  });
});
