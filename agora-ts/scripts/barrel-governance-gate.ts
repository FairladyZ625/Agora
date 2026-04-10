import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface BarrelGovernanceViolation {
  filePath: string;
  violations: string[];
}

const DEFAULT_BARREL_PATHS = [
  'packages/core/src/index.ts',
  'packages/adapters-craftsman/src/index.ts',
  'packages/adapters-runtime/src/index.ts',
  'packages/adapters-brain/src/index.ts',
  'packages/adapters-host/src/index.ts',
  'packages/adapters-openclaw/src/index.ts',
];

const BARREL_EXPORT_STAR_PATTERN = /^export\s+\*\s+from\s+/m;

export function scanBarrelGovernanceViolations(
  repoRoot: string,
  barrelPaths: string[] = DEFAULT_BARREL_PATHS,
): BarrelGovernanceViolation[] {
  return barrelPaths
    .map((relativePath) => {
      const filePath = resolve(repoRoot, relativePath);
      const source = readFileSync(filePath, 'utf8');
      const violations = BARREL_EXPORT_STAR_PATTERN.test(source)
        ? ['forbidden export-star in public package barrel']
        : [];
      return { filePath, violations };
    })
    .filter((entry) => entry.violations.length > 0);
}

export function formatBarrelGovernanceViolations(violations: BarrelGovernanceViolation[]): string {
  return violations
    .map(({ filePath, violations: labels }) => `- ${filePath}: ${labels.join(', ')}`)
    .join('\n');
}

export function runBarrelGovernanceGate(repoRoot: string): number {
  const violations = scanBarrelGovernanceViolations(repoRoot);
  if (violations.length === 0) {
    process.stdout.write(`barrel governance gate passed: ${repoRoot}\n`);
    return 0;
  }
  process.stderr.write([
    `barrel governance gate failed: ${repoRoot}`,
    formatBarrelGovernanceViolations(violations),
    '',
  ].join('\n'));
  return 1;
}

export function runBarrelGovernanceMain(argv: string[] = process.argv.slice(2)): void {
  const rootFlagIndex = argv.indexOf('--root');
  const repoRoot = rootFlagIndex >= 0 && argv[rootFlagIndex + 1]
    ? resolve(argv[rootFlagIndex + 1])
    : process.cwd();
  process.exit(runBarrelGovernanceGate(repoRoot));
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  runBarrelGovernanceMain();
}
