import fs from 'node:fs';
import path from 'node:path';

const projectRoot = new URL('..', import.meta.url);
const srcDir = path.join(projectRoot.pathname, 'src');
const allowedCssFile = path.join(srcDir, 'index.css');
const colorPattern = /#(?:[0-9a-fA-F]{3,8})\b|rgba?\(|hsla?\(/;
const allowedExtensions = new Set(['.ts', '.tsx', '.css']);
const failures = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(absolute);
      continue;
    }
    if (allowedExtensions.has(path.extname(entry.name))) {
      inspectFile(absolute);
    }
  }
}

function inspectFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  if (filePath !== allowedCssFile) {
    lines.forEach((line, index) => {
      if (colorPattern.test(line)) {
        failures.push(`${path.relative(projectRoot.pathname, filePath)}:${index + 1} raw color literal is not allowed outside src/index.css theme tokens`);
      }
    });
    return;
  }

  let inThemeTokenBlock = false;
  let depth = 0;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed === ':root {' || trimmed === "[data-theme='dark'] {") {
      inThemeTokenBlock = true;
      depth = 1;
    } else if (inThemeTokenBlock) {
      depth += (line.match(/{/g) ?? []).length;
      depth -= (line.match(/}/g) ?? []).length;
      if (depth <= 0) {
        inThemeTokenBlock = false;
      }
    }

    if (!colorPattern.test(line)) return;
    if (inThemeTokenBlock && trimmed.startsWith('--')) return;
    failures.push(`${path.relative(projectRoot.pathname, filePath)}:${index + 1} raw color literal must be defined through top-level theme variables`);
  });
}

walk(srcDir);

if (failures.length > 0) {
  console.error('Frontend visual governance check failed:\n');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Frontend visual governance check passed.');
