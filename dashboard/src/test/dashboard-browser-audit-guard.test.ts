import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const packageJson = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../package.json'), 'utf8')) as {
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const browserSmokeSource = readFileSync(resolve(import.meta.dirname, '../../scripts/browser-smoke.mjs'), 'utf8');
const perfSnapshotSource = readFileSync(resolve(import.meta.dirname, '../../scripts/perf-snapshot.mjs'), 'utf8');

describe('dashboard browser audit guardrails', () => {
  it('defines reusable npm entrypoints for compatibility and performance audits', () => {
    expect(packageJson.scripts?.['test:compat']).toBe('node ./scripts/browser-smoke.mjs');
    expect(packageJson.scripts?.['test:perf']).toBe('node ./scripts/perf-snapshot.mjs');
  });

  it('keeps browser automation available in workspace devDependencies', () => {
    expect(packageJson.devDependencies?.playwright).toBeDefined();
  });

  it('runs compatibility smoke coverage across chromium, firefox, and webkit', () => {
    expect(browserSmokeSource).toContain('chromium');
    expect(browserSmokeSource).toContain('firefox');
    expect(browserSmokeSource).toContain('webkit');
    expect(browserSmokeSource).toContain('/dashboard/login');
  });

  it('covers an authenticated mobile viewport in the browser smoke audit', () => {
    expect(browserSmokeSource).toContain('375');
    expect(browserSmokeSource).toContain('812');
  });

  it('captures real performance signals instead of only static CSS checks', () => {
    expect(perfSnapshotSource).toContain('Performance.getMetrics');
    expect(perfSnapshotSource).toContain('longtask');
    expect(perfSnapshotSource).toContain('context.tracing.start');
    expect(perfSnapshotSource).toContain('page.route');
  });
});
