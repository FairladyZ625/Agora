import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const projectRoot = new URL('..', import.meta.url);
const governedFiles = [
  path.join(projectRoot.pathname, 'src', 'pages', 'ProjectsPage.tsx'),
  path.join(projectRoot.pathname, 'src', 'pages', 'ProjectDetailPage.tsx'),
  path.join(projectRoot.pathname, 'src', 'pages', 'ProjectCurrentWorkPage.tsx'),
  path.join(projectRoot.pathname, 'src', 'pages', 'ReviewsPage.tsx'),
  path.join(projectRoot.pathname, 'src', 'pages', 'AgentsPage.tsx'),
  path.join(projectRoot.pathname, 'src', 'pages', 'SystemPage.tsx'),
  path.join(projectRoot.pathname, 'src', 'pages', 'SettingsPage.tsx'),
  path.join(projectRoot.pathname, 'src', 'pages', 'ProjectBrainPage.tsx'),
];
const riskyPropertyNames = new Set(['label', 'title', 'summary', 'placeholder', 'kicker', 'body', 'description']);
const riskyAttributeNames = new Set(['aria-label', 'placeholder', 'title']);
const failures = [];

for (const filePath of governedFiles) {
  inspectFile(filePath);
}

if (failures.length > 0) {
  console.error('Dashboard i18n governance check failed:\n');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Dashboard i18n governance check passed for ${governedFiles.length} project surfaces.`);

function inspectFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  walk(sourceFile, []);

  function walk(node, jsxStack) {
    const nextJsxStack = isJsxLike(node) ? [...jsxStack, node] : jsxStack;

    if (ts.isJsxText(node)) {
      const text = normalizeText(node.getText(sourceFile));
      if (isVisibleCopy(text)) {
        record(node, `hardcoded JSX text "${text}" must move into dashboardCopy/i18n resources`);
      }
    }

    if (ts.isJsxAttribute(node) && node.initializer) {
      const attributeName = node.name.getText(sourceFile);
      if (riskyAttributeNames.has(attributeName)) {
        const literal = readInitializerLiteral(node.initializer);
        if (literal && isVisibleCopy(literal)) {
          record(node, `hardcoded JSX attribute ${attributeName}="${literal}" must move into dashboardCopy/i18n resources`);
        }
      }
    }

    if (ts.isPropertyAssignment(node) && jsxStack.length > 0) {
      const propertyName = node.name.getText(sourceFile).replace(/['"]/g, '');
      if (riskyPropertyNames.has(propertyName)) {
        const literal = readExpressionLiteral(node.initializer);
        if (literal && isVisibleCopy(literal)) {
          record(node, `hardcoded property ${propertyName}: "${literal}" must move into dashboardCopy/i18n resources`);
        }
      }
    }

    ts.forEachChild(node, (child) => walk(child, nextJsxStack));
  }
}

function isJsxLike(node) {
  return ts.isJsxElement(node) || ts.isJsxFragment(node) || ts.isJsxSelfClosingElement(node);
}

function readInitializerLiteral(initializer) {
  if (ts.isStringLiteral(initializer)) {
    return initializer.text;
  }
  if (ts.isJsxExpression(initializer) && initializer.expression) {
    return readExpressionLiteral(initializer.expression);
  }
  return null;
}

function readExpressionLiteral(expression) {
  if (ts.isStringLiteralLike(expression)) {
    return expression.text;
  }
  if (ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text;
  }
  return null;
}

function normalizeText(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function isVisibleCopy(text) {
  return /[A-Za-z\u4e00-\u9fff]/.test(text);
}

function record(node, message) {
  const relativePath = path.relative(projectRoot.pathname, node.getSourceFile().fileName);
  const { line } = ts.getLineAndCharacterOfPosition(node.getSourceFile(), node.getStart());
  failures.push(`${relativePath}:${line + 1} ${message}`);
}
