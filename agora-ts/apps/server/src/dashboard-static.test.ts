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

function makeDashboardDirsWithSibling() {
  const root = mkdtempSync(join(tmpdir(), 'agora-ts-dashboard-static-root-'));
  tempPaths.push(root);
  const dashboardDir = join(root, 'dist');
  const siblingDir = join(root, 'dist2');
  mkdirSync(join(dashboardDir, 'assets'), { recursive: true });
  mkdirSync(siblingDir, { recursive: true });
  writeFileSync(join(dashboardDir, 'index.html'), '<html><body>dashboard shell</body></html>');
  writeFileSync(join(dashboardDir, 'assets', 'main.js'), 'console.log("dashboard");');
  writeFileSync(join(siblingDir, 'secret.txt'), 'sibling-secret');
  return { dashboardDir };
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

  it('does not serve sibling files outside the dashboard bundle root', async () => {
    const { dashboardDir } = makeDashboardDirsWithSibling();
    const app = buildApp({ dashboardDir });

    const response = await app.inject({
      method: 'GET',
      url: '/dashboard/..%2Fdist2%2Fsecret.txt',
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('dashboard shell');
    expect(response.body).not.toContain('sibling-secret');
  });
});
