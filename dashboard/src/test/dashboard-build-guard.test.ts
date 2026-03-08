import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const viteConfigSource = readFileSync(resolve(import.meta.dirname, '../../vite.config.ts'), 'utf8');

describe('dashboard build guardrails', () => {
  it('defines manual chunk splitting for the production bundle', () => {
    expect(viteConfigSource).toContain('manualChunks(');
    expect(viteConfigSource).toContain('react-vendor');
    expect(viteConfigSource).toContain('i18n-vendor');
  });
});
