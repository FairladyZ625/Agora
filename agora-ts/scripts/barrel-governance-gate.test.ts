import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatBarrelGovernanceViolations,
  runBarrelGovernanceGate,
  runBarrelGovernanceMain,
  scanBarrelGovernanceViolations,
} from './barrel-governance-gate.js';

const tempDirs: string[] = [];

function makeRepoFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-barrel-governance-'));
  tempDirs.push(dir);
  return dir;
}

function writeBarrel(repoRoot: string, relativePath: string, content: string) {
  const filePath = join(repoRoot, relativePath);
  mkdirSync(join(filePath, '..'), { recursive: true });
  writeFileSync(filePath, content, 'utf8');
}

function seedPublicBarrels(repoRoot: string, overrides: Partial<Record<string, string>> = {}) {
  const defaults: Record<string, string> = {
    'packages/core/src/index.ts': "export { TaskService } from './task-service.js';\n",
    'packages/adapters-craftsman/src/index.ts': "export { ProcessCraftsmanAdapter } from './process-craftsman-adapter.js';\n",
    'packages/adapters-runtime/src/index.ts': "export { DirectAcpxRuntimePort } from './direct-acpx-runtime-port.js';\n",
    'packages/adapters-brain/src/index.ts': "export { FilesystemProjectKnowledgeAdapter } from './filesystem-project-knowledge-adapter.js';\n",
    'packages/adapters-host/src/index.ts': "export { OsHostResourcePort } from './os-host-resource-port.js';\n",
    'packages/adapters-openclaw/src/index.ts': "export { OpenClawAgentRegistry } from './agent-registry.js';\n",
    'packages/testing/src/index.ts': "export { createTestRuntime } from './runtime.js';\n",
  };
  for (const [relativePath, content] of Object.entries({ ...defaults, ...overrides })) {
    writeBarrel(repoRoot, relativePath, content);
  }
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('scanBarrelGovernanceViolations', () => {
  it('flags export-star usage in public package barrels', () => {
    const repoRoot = makeRepoFixture();
    writeBarrel(repoRoot, 'packages/core/src/index.ts', "export * from './task-service.js';\n");
    writeBarrel(repoRoot, 'packages/adapters-host/src/index.ts', "export { OsHostResourcePort } from './os-host-resource-port.js';\n");

    expect(scanBarrelGovernanceViolations(repoRoot, [
      'packages/core/src/index.ts',
      'packages/adapters-host/src/index.ts',
    ])).toEqual([
      {
        filePath: join(repoRoot, 'packages/core/src/index.ts'),
        violations: ['forbidden export-star in public package barrel'],
      },
    ]);
  });
});

describe('barrel governance gate entrypoints', () => {
  it('formats violations into a readable report', () => {
    expect(formatBarrelGovernanceViolations([
      {
        filePath: '/tmp/repo/packages/core/src/index.ts',
        violations: ['forbidden export-star in public package barrel'],
      },
    ])).toBe('- /tmp/repo/packages/core/src/index.ts: forbidden export-star in public package barrel');
  });

  it('writes pass/fail receipts and returns the corresponding exit code', () => {
    const cleanRoot = makeRepoFixture();
    const dirtyRoot = makeRepoFixture();
    seedPublicBarrels(cleanRoot);
    seedPublicBarrels(dirtyRoot, {
      'packages/core/src/index.ts': "export * from './task-service.js';\n",
    });

    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    expect(runBarrelGovernanceGate(cleanRoot)).toBe(0);
    expect(stdoutWrite).toHaveBeenCalledWith(`barrel governance gate passed: ${cleanRoot}\n`);

    expect(runBarrelGovernanceGate(dirtyRoot)).toBe(1);
    expect(stderrWrite).toHaveBeenCalledWith(expect.stringContaining(`barrel governance gate failed: ${dirtyRoot}`));
  });

  it('parses argv in the main entrypoint and exits with the gate result', () => {
    const repoRoot = makeRepoFixture();
    seedPublicBarrels(repoRoot);

    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: string | number | null) => {
      throw new Error(`process.exit:${code}`);
    }) as never);
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    expect(() => runBarrelGovernanceMain(['--root', repoRoot])).toThrow('process.exit:0');
    expect(stdoutWrite).toHaveBeenCalledWith(`barrel governance gate passed: ${repoRoot}\n`);

    exit.mockRestore();
  });
});
