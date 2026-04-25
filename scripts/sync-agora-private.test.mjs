import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = resolve(dirname(fileURLToPath(import.meta.url)), 'sync-agora-private.sh');

function git(args, options = {}) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trim();
}

function writeRepoFile(root, relativePath, content) {
  const absolutePath = join(root, relativePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content);
}

function initRepo(root, files) {
  mkdirSync(root, { recursive: true });
  git(['init', '-b', 'master'], { cwd: root });
  git(['config', 'user.name', 'Codex'], { cwd: root });
  git(['config', 'user.email', 'codex@example.com'], { cwd: root });
  for (const [relativePath, content] of Object.entries(files)) {
    writeRepoFile(root, relativePath, content);
  }
  git(['add', '.'], { cwd: root });
  git(['commit', '-m', 'init'], { cwd: root });
}

function commitAll(root, message) {
  git(['add', '.'], { cwd: root });
  git(['commit', '-m', message], { cwd: root });
}

test('sync-agora-private.sh aggregates code root and docs subtree and can resync updates', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'agora-private-sync-'));
  const codeDir = join(sandbox, 'code');
  const docsDir = join(sandbox, 'docs-src');
  const privateRemote = join(sandbox, 'private.git');
  const privateCheckout = join(sandbox, 'private-checkout');

  initRepo(codeDir, {
    'README.md': 'code-v1\n',
    'agora-ts/index.ts': 'export const version = "v1";\n',
  });
  initRepo(docsDir, {
    'README.md': 'docs-v1\n',
    '11-REFERENCE/README.md': '# refs\n',
  });
  git(['init', '--bare', privateRemote]);

  execFileSync('bash', [
    scriptPath,
    '--legacy-import-from-split-sources',
    '--code-dir', codeDir,
    '--docs-dir', docsDir,
    '--private-dir', privateCheckout,
    '--private-remote', privateRemote,
  ], {
    cwd: sandbox,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  assert.equal(readFileSync(join(privateCheckout, 'README.md'), 'utf8'), 'code-v1\n');
  assert.equal(readFileSync(join(privateCheckout, 'agora-ts', 'index.ts'), 'utf8'), 'export const version = "v1";\n');
  assert.equal(readFileSync(join(privateCheckout, 'docs', 'README.md'), 'utf8'), 'docs-v1\n');
  assert.equal(readFileSync(join(privateCheckout, 'docs', '11-REFERENCE', 'README.md'), 'utf8'), '# refs\n');

  const firstPrivateHead = git(['-C', privateCheckout, 'rev-parse', 'HEAD']);
  const firstRemoteHead = git([`--git-dir=${privateRemote}`, 'rev-parse', 'master']);
  assert.equal(firstPrivateHead, firstRemoteHead);

  writeRepoFile(codeDir, 'CHANGELOG.md', 'code-v2\n');
  commitAll(codeDir, 'code update');
  writeRepoFile(docsDir, '10-WALKTHROUGH/update.md', 'docs-v2\n');
  commitAll(docsDir, 'docs update');

  execFileSync('bash', [
    scriptPath,
    '--legacy-import-from-split-sources',
    '--code-dir', codeDir,
    '--docs-dir', docsDir,
    '--private-dir', privateCheckout,
    '--private-remote', privateRemote,
  ], {
    cwd: sandbox,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  assert.ok(existsSync(join(privateCheckout, 'CHANGELOG.md')));
  assert.equal(readFileSync(join(privateCheckout, 'CHANGELOG.md'), 'utf8'), 'code-v2\n');
  assert.equal(readFileSync(join(privateCheckout, 'docs', '10-WALKTHROUGH', 'update.md'), 'utf8'), 'docs-v2\n');

  const secondPrivateHead = git(['-C', privateCheckout, 'rev-parse', 'HEAD']);
  const secondRemoteHead = git([`--git-dir=${privateRemote}`, 'rev-parse', 'master']);
  assert.notEqual(secondPrivateHead, firstPrivateHead);
  assert.equal(secondPrivateHead, secondRemoteHead);
});

test('sync-agora-private.sh refuses legacy import without explicit acknowledgement', () => {
  const result = execFileSync('bash', [
    '-c',
    `set +e; bash "${scriptPath}" --no-push >/tmp/agora-sync-test.out 2>/tmp/agora-sync-test.err; printf "%s" "$?"`,
  ], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

  assert.notEqual(result, '0');
  const stderr = readFileSync('/tmp/agora-sync-test.err', 'utf8');
  assert.match(stderr, /--legacy-import-from-split-sources/);
});
