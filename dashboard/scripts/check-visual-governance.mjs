import fs from 'node:fs';
import path from 'node:path';

const projectRoot = new URL('..', import.meta.url);
const srcDir = path.join(projectRoot.pathname, 'src');
const allowedCssFile = path.join(srcDir, 'index.css');
const allowedCssFiles = new Set([
  allowedCssFile,
  path.join(srcDir, 'styles', 'tokens.css'),
]);
const colorPattern = /#(?:[0-9a-fA-F]{3,8})\b|rgba?\(|hsla?\(/;
const arbitraryTailwindPattern =
  /\b(?:text|tracking|grid-cols|bg|border|rounded|h|w|min-w|max-w|px|py|pt|pb|pl|pr|mt|mb|ml|mr)-\[[^\]]+\]/;
const freeSizePropPattern =
  /padding="[^"]+"|cornerRadius=\{[^}]+\}|style=\{\{[^}]*\b(?:width|height|minWidth|maxWidth|padding|gap|borderRadius):/;
const governedCssProperties = ['padding', 'margin', 'gap', 'width', 'height', 'border-radius', 'font-size'];
const allowedExtensions = new Set(['.ts', '.tsx', '.css']);
const localeDir = path.join(srcDir, 'locales');
const allowedHardcodedCopyFiles = new Set([
  allowedCssFile,
  ...allowedCssFiles,
  path.join(srcDir, 'lib', 'mockDashboard.ts'),
]);
const hardcodedCopyPattern =
  /(?:aria-label|placeholder|label|title|summary|caption|kicker|body|description|message)\s*[:=]\s*["'`][^"'`\n]*[\u4e00-\u9fff][^"'`\n]*["'`]/;
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
  const relativePath = path.relative(projectRoot.pathname, filePath);

  if (!allowedCssFiles.has(filePath)) {
    lines.forEach((line, index) => {
      if (colorPattern.test(line)) {
        failures.push(`${relativePath}:${index + 1} raw color literal is not allowed outside src/index.css theme tokens`);
      }
      if (arbitraryTailwindPattern.test(line)) {
        failures.push(`${relativePath}:${index + 1} Tailwind arbitrary value is not allowed; use semantic classes or top-level tokens`);
      }
    });
    if (path.basename(filePath) !== 'ControlGlass.tsx' && freeSizePropPattern.test(content)) {
      failures.push(`${relativePath} free-form size props are not allowed; use controlled component variants or top-level layout tokens`);
    }
    const isLocaleResource = filePath.startsWith(localeDir);
    const isTestFile = filePath.includes(`${path.sep}test${path.sep}`) || filePath.includes('.test.');
    const isAllowedCopyFile = allowedHardcodedCopyFiles.has(filePath);
    if (!isLocaleResource && !isTestFile && !isAllowedCopyFile) {
      lines.forEach((line, index) => {
        if (hardcodedCopyPattern.test(line)) {
          failures.push(`${relativePath}:${index + 1} hardcoded product copy is not allowed outside src/locales; move UI copy into locale resources`);
        }
      });
    }
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
    failures.push(`${relativePath}:${index + 1} raw color literal must be defined through top-level theme variables`);
  });
}

walk(srcDir);

if (failures.length > 0) {
  console.error('Frontend visual governance check failed:\n');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Frontend visual governance check passed. Governed CSS properties seed: ${governedCssProperties.join(', ')}`);
