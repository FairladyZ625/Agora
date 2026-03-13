#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(new URL('.', import.meta.url).pathname, '..');
const baselinePath = path.join(projectRoot, 'scripts', 'review-guardrails-baseline.json');
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

const findings = {
  providerFallbackHardcode: [],
  rawJsonParse: [],
  repositoryNonNullReload: [],
  dashboardEmptyCatch: [],
};

const providerFallbackPattern =
  /(?:\?\?|\|\|)\s*['"](discord|whatsapp|openclaw|feishu|slack|codex|claude|gemini)['"]/;
const rawJsonParsePattern = /\bJSON\.parse\(/;
const repositoryNonNullReloadPattern =
  /return\s+(?:this\.)?[A-Za-z0-9_$.]+\([^)\n]*\)!\s*;|return\s+(?:this\.)?[A-Za-z0-9_$.]+\([^)\n]*\)\s*\?\?\s*this\.[A-Za-z0-9_$.]+\([^)\n]*\)!\s*;/;
const emptyCatchPattern = /catch\s*\{\s*\}/;

function relative(filePath) {
  return path.relative(projectRoot, filePath);
}

function pushFinding(category, filePath, lineNumber, detail) {
  findings[category].push(`${relative(filePath)}:${lineNumber}${detail ? ` ${detail}` : ''}`);
}

function inspectFile(filePath, inspectors) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  inspectors.forEach((inspector) => inspector(filePath, lines));
}

function walk(dir, extensions, inspectors) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'coverage') {
      continue;
    }
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(absolute, extensions, inspectors);
      continue;
    }
    if (extensions.has(path.extname(entry.name))) {
      inspectFile(absolute, inspectors);
    }
  }
}

function collectNewFindings(category) {
  const baselineEntries = new Set(baseline[category] ?? []);
  return findings[category].filter((entry) => !baselineEntries.has(entry));
}

function collectResolvedBaseline(category) {
  const currentEntries = new Set(findings[category]);
  return (baseline[category] ?? []).filter((entry) => !currentEntries.has(entry));
}

walk(
  path.join(projectRoot, 'agora-ts', 'packages', 'core', 'src'),
  new Set(['.ts']),
  [(_filePath, lines) => {
    lines.forEach((line, index) => {
      if (providerFallbackPattern.test(line)) {
        pushFinding('providerFallbackHardcode', _filePath, index + 1, 'provider/runtime fallback literal');
      }
    });
  }],
);

walk(
  path.join(projectRoot, 'extensions', 'agora-plugin', 'src'),
  new Set(['.ts']),
  [(_filePath, lines) => {
    lines.forEach((line, index) => {
      if (providerFallbackPattern.test(line)) {
        pushFinding('providerFallbackHardcode', _filePath, index + 1, 'provider/runtime fallback literal');
      }
    });
  }],
);

walk(
  path.join(projectRoot, 'dashboard', 'src', 'lib'),
  new Set(['.ts', '.tsx']),
  [(_filePath, lines) => {
    lines.forEach((line, index) => {
      if (providerFallbackPattern.test(line)) {
        pushFinding('providerFallbackHardcode', _filePath, index + 1, 'provider/runtime fallback literal');
      }
      if (rawJsonParsePattern.test(line)) {
        pushFinding('rawJsonParse', _filePath, index + 1, 'raw JSON.parse in dashboard lib');
      }
      if (emptyCatchPattern.test(line)) {
        pushFinding('dashboardEmptyCatch', _filePath, index + 1, 'empty catch in dashboard lib');
      }
    });
  }],
);

walk(
  path.join(projectRoot, 'dashboard', 'src', 'stores'),
  new Set(['.ts', '.tsx']),
  [(_filePath, lines) => {
    lines.forEach((line, index) => {
      if (providerFallbackPattern.test(line)) {
        pushFinding('providerFallbackHardcode', _filePath, index + 1, 'provider/runtime fallback literal');
      }
      if (emptyCatchPattern.test(line)) {
        pushFinding('dashboardEmptyCatch', _filePath, index + 1, 'empty catch in dashboard store');
      }
    });
  }],
);

[
  path.join(projectRoot, 'extensions', 'agora-plugin', 'src', 'bridge.ts'),
  path.join(projectRoot, 'agora-ts', 'packages', 'core', 'src', 'adapters', 'process-callback-runner.ts'),
].forEach((filePath) => {
  inspectFile(filePath, [(_filePath, lines) => {
    lines.forEach((line, index) => {
      if (rawJsonParsePattern.test(line)) {
        pushFinding('rawJsonParse', _filePath, index + 1, 'raw JSON.parse in runtime/plugin boundary');
      }
    });
  }]);
});

walk(
  path.join(projectRoot, 'agora-ts', 'packages', 'db', 'src', 'repositories'),
  new Set(['.ts']),
  [(_filePath, lines) => {
    lines.forEach((line, index) => {
      if (repositoryNonNullReloadPattern.test(line)) {
        pushFinding('repositoryNonNullReload', _filePath, index + 1, 'repository reload uses non-null assertion');
      }
    });
  }],
);

const newFailures = Object.entries(findings)
  .flatMap(([category]) => collectNewFindings(category).map((entry) => ({ category, entry })));

const resolvedBaseline = Object.entries(findings)
  .flatMap(([category]) => collectResolvedBaseline(category).map((entry) => ({ category, entry })));

if (resolvedBaseline.length > 0) {
  console.log('Review guardrail baseline can be tightened:');
  resolvedBaseline.forEach(({ category, entry }) => {
    console.log(`- [${category}] ${entry}`);
  });
  console.log('');
}

if (newFailures.length > 0) {
  console.error('Review guardrail check failed:\n');
  newFailures.forEach(({ category, entry }) => {
    console.error(`- [${category}] ${entry}`);
  });
  process.exit(1);
}

const baselineCount = Object.values(baseline).reduce((sum, entries) => sum + entries.length, 0);
console.log(`Review guardrail check passed. Baseline debt tracked: ${baselineCount}`);
