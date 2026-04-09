import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  collectCoreProductionSourceFiles,
  scanCoreBoundaryViolations,
} from './core-boundary-gate.js';

const tempDirs: string[] = [];

function makeCoreFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-core-boundary-gate-'));
  tempDirs.push(dir);
  mkdirSync(join(dir, 'nested'), { recursive: true });
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('collectCoreProductionSourceFiles', () => {
  it('includes production ts files and skips test files', () => {
    const dir = makeCoreFixture();
    writeFileSync(join(dir, 'task-service.ts'), 'export const taskService = true;\n', 'utf8');
    writeFileSync(join(dir, 'task-service.test.ts'), 'export const ignored = true;\n', 'utf8');
    writeFileSync(join(dir, 'nested', 'dashboard-query-service.ts'), 'export const dashboard = true;\n', 'utf8');

    expect(collectCoreProductionSourceFiles(dir)).toEqual([
      join(dir, 'nested', 'dashboard-query-service.ts'),
      join(dir, 'task-service.ts'),
    ]);
  });
});

describe('scanCoreBoundaryViolations', () => {
  it('flags direct db imports and requires in db-import mode', () => {
    const dir = makeCoreFixture();
    writeFileSync(join(dir, 'safe-service.ts'), 'export const ok = true;\n', 'utf8');
    writeFileSync(join(dir, 'import-db.ts'), "import { TaskRepository } from '@agora-ts/db';\n", 'utf8');
    writeFileSync(join(dir, 'require-db.ts'), "const db = require('@agora-ts/db');\n", 'utf8');

    expect(scanCoreBoundaryViolations(dir, 'db-imports')).toEqual([
      {
        filePath: join(dir, 'import-db.ts'),
        violations: ["forbidden import from '@agora-ts/db'"],
      },
      {
        filePath: join(dir, 'require-db.ts'),
        violations: ["forbidden require('@agora-ts/db')"],
      },
    ]);
  });

  it('flags concrete repository, sqlite gate, and AgoraDatabase fallback patterns', () => {
    const dir = makeCoreFixture();
    writeFileSync(join(dir, 'fallback.ts'), [
      'type MaybeDb = AgoraDatabase | null;',
      'const repository = new TaskRepository(db);',
      'const gate = new SqliteGateQueryPort(db);',
      '',
    ].join('\n'), 'utf8');

    expect(scanCoreBoundaryViolations(dir, 'legacy-fallback')).toEqual([
      {
        filePath: join(dir, 'fallback.ts'),
        violations: [
          'forbidden type reference AgoraDatabase',
          'forbidden concrete repository construction',
          'forbidden sqlite gate construction',
        ],
      },
    ]);
  });

  it('flags core-local utilities that drift back under adapters/', () => {
    const dir = makeCoreFixture();
    mkdirSync(join(dir, 'adapters'), { recursive: true });
    writeFileSync(join(dir, 'adapters', 'markdown-frontmatter.ts'), 'export const utility = true;\n', 'utf8');
    writeFileSync(join(dir, 'adapters', 'acp-session-ref.ts'), 'export const utility = true;\n', 'utf8');

    expect(scanCoreBoundaryViolations(dir, 'adapter-utility-paths')).toEqual([
      {
        filePath: join(dir, 'adapters', 'acp-session-ref.ts'),
        violations: ['forbidden core utility kept under adapters/acp-session-ref.ts'],
      },
      {
        filePath: join(dir, 'adapters', 'markdown-frontmatter.ts'),
        violations: ['forbidden core utility kept under adapters/markdown-frontmatter.ts'],
      },
    ]);
  });
});
