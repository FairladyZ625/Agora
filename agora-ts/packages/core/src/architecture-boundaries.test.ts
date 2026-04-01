import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = new URL('./', import.meta.url);

function collectProductionSourceFiles(dir: URL): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const entryUrl = new URL(entry.name, dir);
    const entryPath = entryUrl.pathname;
    if (entry.isDirectory()) {
      files.push(...collectProductionSourceFiles(new URL(`${entry.name}/`, dir)));
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) {
      continue;
    }
    files.push(entryPath);
  }
  return files.sort();
}

function findDbCouplings(filePath: string): string[] {
  const source = readFileSync(filePath, 'utf8');
  const matches: string[] = [];
  if (source.includes("from '@agora-ts/db'")) {
    matches.push("import '@agora-ts/db'");
  }
  if (source.includes("require('@agora-ts/db')") || source.includes('require("@agora-ts/db")')) {
    matches.push("require('@agora-ts/db')");
  }
  return matches;
}

describe('core architecture boundaries', () => {
  it('keeps production core sources free of direct @agora-ts/db imports and requires', () => {
    const offenders = collectProductionSourceFiles(SOURCE_ROOT)
      .map((filePath) => ({
        filePath,
        couplings: findDbCouplings(filePath),
      }))
      .filter((entry) => entry.couplings.length > 0)
      .map((entry) => `${entry.filePath}: ${entry.couplings.join(', ')}`);

    expect(offenders).toEqual([]);
  });
});
