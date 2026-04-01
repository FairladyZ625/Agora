import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface CoreBoundaryViolation {
  filePath: string;
  violations: string[];
}

export type CoreBoundaryMode = 'db-imports' | 'legacy-fallback' | 'all';

const PATTERNS: Record<CoreBoundaryMode, Array<{ label: string; pattern: RegExp }>> = {
  'db-imports': [
    { label: "forbidden import from '@agora-ts/db'", pattern: /from\s+['"]@agora-ts\/db['"]/ },
    { label: "forbidden require('@agora-ts/db')", pattern: /require\((['"])@agora-ts\/db\1\)/ },
  ],
  'legacy-fallback': [
    { label: 'forbidden type reference AgoraDatabase', pattern: /\bAgoraDatabase\b/ },
    { label: 'forbidden concrete repository construction', pattern: /\bnew\s+[A-Za-z0-9_]+Repository\s*\(/ },
    { label: 'forbidden sqlite gate construction', pattern: /\bnew\s+SqliteGate(?:Command|Query)Port\s*\(/ },
  ],
  all: [],
};

PATTERNS.all = [...PATTERNS['db-imports'], ...PATTERNS['legacy-fallback']];

export function collectCoreProductionSourceFiles(rootDir: string): string[] {
  const files: string[] = [];
  const entries = readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = resolve(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectCoreProductionSourceFiles(entryPath));
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) {
      continue;
    }
    files.push(entryPath);
  }
  return files.sort();
}

export function scanCoreBoundaryViolations(
  rootDir: string,
  mode: CoreBoundaryMode = 'all',
): CoreBoundaryViolation[] {
  const patterns = PATTERNS[mode];
  return collectCoreProductionSourceFiles(rootDir)
    .map((filePath) => {
      const source = readFileSync(filePath, 'utf8');
      const violations = patterns
        .filter(({ pattern }) => pattern.test(source))
        .map(({ label }) => label);
      return { filePath, violations };
    })
    .filter((entry) => entry.violations.length > 0);
}

export function formatCoreBoundaryViolations(violations: CoreBoundaryViolation[]): string {
  return violations
    .map(({ filePath, violations: labels }) => `- ${filePath}: ${labels.join(', ')}`)
    .join('\n');
}

export function runCoreBoundaryGate(rootDir: string, mode: CoreBoundaryMode = 'all'): number {
  const violations = scanCoreBoundaryViolations(rootDir, mode);
  if (violations.length === 0) {
    process.stdout.write(`core ${mode} gate passed: ${rootDir}\n`);
    return 0;
  }

  process.stderr.write([
    `core ${mode} gate failed: ${rootDir}`,
    formatCoreBoundaryViolations(violations),
    '',
  ].join('\n'));
  return 1;
}

function parseArgs(argv: string[]): { rootDir: string; mode: CoreBoundaryMode } {
  const modeArg = argv[0];
  const mode: CoreBoundaryMode = modeArg === 'db-imports' || modeArg === 'legacy-fallback' || modeArg === 'all'
    ? modeArg
    : 'all';
  const rootFlagIndex = argv.indexOf('--root');
  const rootDir = rootFlagIndex >= 0 && argv[rootFlagIndex + 1]
    ? resolve(argv[rootFlagIndex + 1])
    : resolve(process.cwd(), 'packages/core/src');
  return { rootDir, mode };
}

export function runCoreBoundaryMain(argv: string[] = process.argv.slice(2)): void {
  const { rootDir, mode } = parseArgs(argv);
  process.exit(runCoreBoundaryGate(rootDir, mode));
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  runCoreBoundaryMain();
}
