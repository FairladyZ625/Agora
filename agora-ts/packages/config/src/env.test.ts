import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_AGORA_BACKEND_PORT,
  DEFAULT_AGORA_FRONTEND_PORT,
  DEFAULT_AGORA_HOST,
  findAgoraProjectRoot,
  resolveAgoraRuntimeEnvironment,
} from './env.js';

const tempDirs: string[] = [];

function makeAgoraRoot() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-env-test-'));
  tempDirs.push(dir);
  mkdirSync(join(dir, 'agora-ts'), { recursive: true });
  mkdirSync(join(dir, 'dashboard'), { recursive: true });
  writeFileSync(join(dir, 'AGENTS.md'), '# test\n');
  return dir;
}

afterEach(() => {
  vi.unstubAllEnvs();
  delete process.env.OPENAI_API_KEY;
  delete process.env.QDRANT_URL;
  delete process.env.AGORA_DB_PATH;
  delete process.env.AGORA_CONFIG_PATH;
  delete process.env.AGORA_CLEAN_LEGACY_PORTS;
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('agora runtime env', () => {
  it('loads backend/frontend defaults from root .env', () => {
    const root = makeAgoraRoot();
    const appDir = join(root, 'agora-ts');
    writeFileSync(
      join(root, '.env'),
      [
        'AGORA_SERVER_HOST=127.0.0.1',
        'AGORA_BACKEND_PORT=19420',
        'AGORA_FRONTEND_PORT=34173',
        'AGORA_SERVER_URL=http://127.0.0.1:19420',
      ].join('\n'),
    );

    expect(resolveAgoraRuntimeEnvironment(appDir)).toEqual({
      projectRoot: root,
      host: '127.0.0.1',
      backendPort: 19420,
      frontendPort: 34173,
      serverUrl: 'http://127.0.0.1:19420',
      apiBaseUrl: 'http://127.0.0.1:19420',
    });
  });

  it('falls back to uncommon defaults when .env is missing', () => {
    const root = makeAgoraRoot();
    const appDir = join(root, 'agora-ts');

    expect(resolveAgoraRuntimeEnvironment(appDir)).toEqual({
      projectRoot: root,
      host: DEFAULT_AGORA_HOST,
      backendPort: DEFAULT_AGORA_BACKEND_PORT,
      frontendPort: DEFAULT_AGORA_FRONTEND_PORT,
      serverUrl: `http://${DEFAULT_AGORA_HOST}:${DEFAULT_AGORA_BACKEND_PORT}`,
      apiBaseUrl: `http://${DEFAULT_AGORA_HOST}:${DEFAULT_AGORA_BACKEND_PORT}`,
    });
  });

  it('lets process env override .env values', () => {
    const root = makeAgoraRoot();
    const appDir = join(root, 'dashboard');
    writeFileSync(join(root, '.env'), 'AGORA_BACKEND_PORT=19420\nAGORA_FRONTEND_PORT=34173\n');
    vi.stubEnv('AGORA_BACKEND_PORT', '20420');
    vi.stubEnv('VITE_API_BASE_URL', 'http://127.0.0.1:20420');

    const resolved = resolveAgoraRuntimeEnvironment(appDir);

    expect(resolved.backendPort).toBe(20420);
    expect(resolved.frontendPort).toBe(34173);
    expect(resolved.apiBaseUrl).toBe('http://127.0.0.1:20420');
  });

  it('hydrates non-runtime .env entries into process env without overriding explicit env', () => {
    const root = makeAgoraRoot();
    const appDir = join(root, 'agora-ts');
    writeFileSync(
      join(root, '.env'),
      [
        'OPENAI_API_KEY=file-key',
        'QDRANT_URL=http://127.0.0.1:6333',
      ].join('\n'),
    );
    vi.stubEnv('QDRANT_URL', 'http://127.0.0.1:7333');

    resolveAgoraRuntimeEnvironment(appDir);

    expect(process.env.OPENAI_API_KEY).toBe('file-key');
    expect(process.env.QDRANT_URL).toBe('http://127.0.0.1:7333');
  });

  it('can discover the repo root from nested package directories', () => {
    const root = makeAgoraRoot();
    const nestedDir = join(root, 'agora-ts', 'apps', 'server', 'src');
    mkdirSync(nestedDir, { recursive: true });

    expect(findAgoraProjectRoot(nestedDir)).toBe(root);
  });
});
