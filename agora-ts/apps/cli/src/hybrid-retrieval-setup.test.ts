import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  setupHybridRetrieval,
  upsertHybridRetrievalEnvFile,
  type EmbeddingProbeConfig,
  type HybridRetrievalSetupDeps,
} from './hybrid-retrieval-setup.js';

const tempDirs: string[] = [];

function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-hybrid-retrieval-setup-'));
  tempDirs.push(dir);
  return dir;
}

function createDeps(overrides: Partial<HybridRetrievalSetupDeps> = {}): HybridRetrievalSetupDeps {
  return {
    commandExists: vi.fn(async () => true),
    runCommand: vi.fn(async () => ({ stdout: '', stderr: '' })),
    fetchJson: vi.fn(async () => ({ ok: true, status: 200, bodyText: 'ok', bodyJson: {} })),
    ...overrides,
  };
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('upsertHybridRetrievalEnvFile', () => {
  it('updates only vector-related keys and preserves unrelated env values', () => {
    const dir = makeTempDir();
    const envPath = join(dir, '.env');
    writeFileSync(
      envPath,
      [
        'AGORA_SERVER_HOST=127.0.0.1',
        'OPENAI_API_KEY=old-key',
        'QDRANT_URL=http://127.0.0.1:7000',
      ].join('\n'),
    );

    upsertHybridRetrievalEnvFile(envPath, {
      OPENAI_API_KEY: 'new-key',
      OPENAI_BASE_URL: 'https://api.example.com/v1',
      OPENAI_EMBEDDING_MODEL: 'embedding-3',
      OPENAI_EMBEDDING_DIMENSION: '2048',
      QDRANT_URL: 'http://127.0.0.1:6333',
      QDRANT_API_KEY: '',
    });

    expect(readFileSync(envPath, 'utf8')).toBe(
      [
        'AGORA_SERVER_HOST=127.0.0.1',
        'OPENAI_API_KEY=new-key',
        'QDRANT_URL=http://127.0.0.1:6333',
        'OPENAI_BASE_URL=https://api.example.com/v1',
        'OPENAI_EMBEDDING_MODEL=embedding-3',
        'OPENAI_EMBEDDING_DIMENSION=2048',
      ].join('\n') + '\n',
    );
  });
});

describe('setupHybridRetrieval', () => {
  const embedding: EmbeddingProbeConfig = {
    apiKey: 'test-key',
    baseUrl: 'https://api.example.com/v1',
    model: 'embedding-3',
    dimension: '2048',
  };

  it('fails with actionable guidance when docker is unavailable', async () => {
    const dir = makeTempDir();
    const deps = createDeps({
      commandExists: vi.fn(async () => false),
    });

    await expect(setupHybridRetrieval({
      envPath: join(dir, '.env'),
      embedding,
    }, deps)).rejects.toThrow('docker');
  });

  it('reuses an existing healthy qdrant container, probes embeddings, and writes env', async () => {
    const dir = makeTempDir();
    const envPath = join(dir, '.env');
    writeFileSync(envPath, 'AGORA_SERVER_HOST=127.0.0.1\n');
    const runCommand = vi.fn(async ({ args }: { args: string[] }) => {
      if (args[0] === 'inspect') {
        return { stdout: 'true\n', stderr: '' };
      }
      return { stdout: '', stderr: '' };
    });
    const fetchJson = vi.fn(async (url: string) => {
      if (url.endsWith('/readyz')) {
        return { ok: true, status: 200, bodyText: 'all shards are ready', bodyJson: null };
      }
      if (url.endsWith('/embeddings')) {
        return {
          ok: true,
          status: 200,
          bodyText: '{"data":[{"embedding":[0.1,0.2]}]}',
          bodyJson: { data: [{ embedding: [0.1, 0.2] }] },
        };
      }
      throw new Error(`unexpected url ${url}`);
    });
    const deps = createDeps({
      runCommand,
      fetchJson,
    });

    const result = await setupHybridRetrieval({
      envPath,
      embedding,
    }, deps);

    expect(result.qdrant.reused).toBe(true);
    expect(result.embedding.probed).toBe(true);
    expect(runCommand).not.toHaveBeenCalledWith(expect.objectContaining({
      args: expect.arrayContaining(['run']),
    }));
    expect(readFileSync(envPath, 'utf8')).toContain('QDRANT_URL=http://127.0.0.1:6333');
  });

  it('starts qdrant when no existing container is present', async () => {
    const dir = makeTempDir();
    const runCommand = vi.fn(async ({ args }: { args: string[] }) => {
      if (args[0] === 'inspect') {
        throw new Error('No such container');
      }
      return { stdout: '', stderr: '' };
    });
    let readyChecks = 0;
    const fetchJson = vi.fn(async (url: string) => {
      if (url.endsWith('/readyz')) {
        readyChecks += 1;
        return readyChecks === 1
          ? { ok: false, status: 503, bodyText: 'not ready', bodyJson: null }
          : { ok: true, status: 200, bodyText: 'all shards are ready', bodyJson: null };
      }
      return {
        ok: true,
        status: 200,
        bodyText: '{"data":[{"embedding":[0.1,0.2]}]}',
        bodyJson: { data: [{ embedding: [0.1, 0.2] }] },
      };
    });
    const deps = createDeps({
      runCommand,
      fetchJson,
    });

    const result = await setupHybridRetrieval({
      envPath: join(dir, '.env'),
      embedding,
    }, deps);

    expect(result.qdrant.reused).toBe(false);
    expect(runCommand).toHaveBeenCalledWith(expect.objectContaining({
      command: 'docker',
      args: expect.arrayContaining(['pull', 'qdrant/qdrant:latest']),
    }));
    expect(runCommand).toHaveBeenCalledWith(expect.objectContaining({
      command: 'docker',
      args: expect.arrayContaining(['run', '-d', '--restart', 'unless-stopped', '-p', '6333:6333', '--name', 'agora-qdrant', 'qdrant/qdrant:latest']),
    }));
  });

  it('reuses an already reachable local qdrant endpoint even when the managed container is absent', async () => {
    const dir = makeTempDir();
    const runCommand = vi.fn(async ({ args }: { args: string[] }) => {
      if (args[0] === 'inspect') {
        throw new Error('No such container');
      }
      return { stdout: '', stderr: '' };
    });
    const fetchJson = vi.fn(async (url: string) => {
      if (url.endsWith('/readyz')) {
        return { ok: true, status: 200, bodyText: 'all shards are ready', bodyJson: null };
      }
      return {
        ok: true,
        status: 200,
        bodyText: '{"data":[{"embedding":[0.1,0.2]}]}',
        bodyJson: { data: [{ embedding: [0.1, 0.2] }] },
      };
    });
    const deps = createDeps({
      runCommand,
      fetchJson,
    });

    const result = await setupHybridRetrieval({
      envPath: join(dir, '.env'),
      embedding,
    }, deps);

    expect(result.qdrant.reused).toBe(true);
    expect(runCommand).not.toHaveBeenCalledWith(expect.objectContaining({
      args: expect.arrayContaining(['run']),
    }));
  });

  it('aborts before writing env when the embedding probe fails', async () => {
    const dir = makeTempDir();
    const envPath = join(dir, '.env');
    writeFileSync(envPath, 'AGORA_SERVER_HOST=127.0.0.1\n');
    const deps = createDeps({
      runCommand: vi.fn(async ({ args }: { args: string[] }) => {
        if (args[0] === 'inspect') {
          return { stdout: 'true\n', stderr: '' };
        }
        return { stdout: '', stderr: '' };
      }),
      fetchJson: vi.fn(async (url: string) => {
        if (url.endsWith('/readyz')) {
          return { ok: true, status: 200, bodyText: 'all shards are ready', bodyJson: null };
        }
        return { ok: false, status: 401, bodyText: 'unauthorized', bodyJson: null };
      }),
    });

    await expect(setupHybridRetrieval({
      envPath,
      embedding,
    }, deps)).rejects.toThrow('embedding');

    expect(readFileSync(envPath, 'utf8')).toBe('AGORA_SERVER_HOST=127.0.0.1\n');
  });
});
