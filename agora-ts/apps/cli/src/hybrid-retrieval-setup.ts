import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

const execFileAsync = promisify(execFile);

const DEFAULT_QDRANT_URL = 'http://127.0.0.1:6333';
const DEFAULT_QDRANT_CONTAINER = 'agora-qdrant';
const VECTOR_ENV_KEYS = [
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'OPENAI_EMBEDDING_MODEL',
  'OPENAI_EMBEDDING_DIMENSION',
  'QDRANT_URL',
  'QDRANT_API_KEY',
] as const;

export interface EmbeddingProbeConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  dimension?: string | null;
}

export interface HybridRetrievalSetupOptions {
  envPath: string;
  embedding: EmbeddingProbeConfig;
  qdrantUrl?: string;
  qdrantApiKey?: string | null;
  qdrantContainerName?: string;
}

export interface HybridRetrievalSetupResult {
  envPath: string;
  qdrant: {
    url: string;
    containerName: string;
    reused: boolean;
  };
  embedding: {
    probed: true;
    model: string;
  };
}

export interface HybridRetrievalSetupDeps {
  commandExists(command: string): Promise<boolean>;
  runCommand(input: { command: string; args: string[]; cwd?: string }): Promise<{ stdout: string; stderr: string }>;
  fetchJson(
    url: string,
    init?: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    },
  ): Promise<{ ok: boolean; status: number; bodyText: string; bodyJson: unknown }>;
}

const defaultDeps: HybridRetrievalSetupDeps = {
  commandExists: async (command) => {
    try {
      await execFileAsync(command, ['--version']);
      return true;
    } catch {
      return false;
    }
  },
  runCommand: async ({ command, args, cwd }) => {
    const result = await execFileAsync(command, args, cwd ? { cwd } : {});
    return {
      stdout: result.stdout,
      stderr: result.stderr,
    };
  },
  fetchJson: async (url, init) => {
    const response = await fetch(url, {
      ...(init?.method ? { method: init.method } : {}),
      ...(init?.headers ? { headers: init.headers } : {}),
      ...(init?.body !== undefined ? { body: init.body } : {}),
    });
    const bodyText = await response.text();
    let bodyJson: unknown = null;
    try {
      bodyJson = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      bodyJson = null;
    }
    return {
      ok: response.ok,
      status: response.status,
      bodyText,
      bodyJson,
    };
  },
};

export function upsertHybridRetrievalEnvFile(
  envPath: string,
  values: Record<(typeof VECTOR_ENV_KEYS)[number], string>,
) {
  const existing = existsSync(envPath) ? readFileSync(envPath, 'utf8').split(/\r?\n/u) : [];
  const nextLines: string[] = [];
  const handled = new Set<string>();

  for (const rawLine of existing) {
    if (rawLine === '') {
      continue;
    }
    const separator = rawLine.indexOf('=');
    if (separator <= 0) {
      nextLines.push(rawLine);
      continue;
    }
    const key = rawLine.slice(0, separator).trim();
    if (!VECTOR_ENV_KEYS.includes(key as (typeof VECTOR_ENV_KEYS)[number])) {
      nextLines.push(rawLine);
      continue;
    }
    const value = values[key as (typeof VECTOR_ENV_KEYS)[number]];
    handled.add(key);
    if (value.trim().length === 0) {
      continue;
    }
    nextLines.push(`${key}=${value}`);
  }

  for (const key of VECTOR_ENV_KEYS) {
    if (handled.has(key)) {
      continue;
    }
    const value = values[key];
    if (value.trim().length === 0) {
      continue;
    }
    nextLines.push(`${key}=${value}`);
  }

  writeFileSync(envPath, `${nextLines.join('\n')}\n`, 'utf8');
}

export async function setupHybridRetrieval(
  options: HybridRetrievalSetupOptions,
  deps: HybridRetrievalSetupDeps = defaultDeps,
): Promise<HybridRetrievalSetupResult> {
  const qdrantUrl = (options.qdrantUrl ?? DEFAULT_QDRANT_URL).trim();
  const containerName = (options.qdrantContainerName ?? DEFAULT_QDRANT_CONTAINER).trim();

  if (!await deps.commandExists('docker')) {
    throw new Error('docker is required to install the local Qdrant service');
  }

  const reused = await ensureQdrantAvailable(qdrantUrl, containerName, deps);
  await probeQdrant(qdrantUrl, deps);
  await probeEmbedding(options.embedding, deps);

  upsertHybridRetrievalEnvFile(options.envPath, {
    OPENAI_API_KEY: options.embedding.apiKey.trim(),
    OPENAI_BASE_URL: options.embedding.baseUrl.trim(),
    OPENAI_EMBEDDING_MODEL: options.embedding.model.trim(),
    OPENAI_EMBEDDING_DIMENSION: options.embedding.dimension?.trim() ?? '',
    QDRANT_URL: qdrantUrl,
    QDRANT_API_KEY: options.qdrantApiKey?.trim() ?? '',
  });

  return {
    envPath: options.envPath,
    qdrant: {
      url: qdrantUrl,
      containerName,
      reused,
    },
    embedding: {
      probed: true,
      model: options.embedding.model.trim(),
    },
  };
}

async function ensureQdrantAvailable(
  qdrantUrl: string,
  containerName: string,
  deps: HybridRetrievalSetupDeps,
) {
  try {
    const inspect = await deps.runCommand({
      command: 'docker',
      args: ['inspect', '--format', '{{.State.Running}}', containerName],
    });
    if (inspect.stdout.trim() === 'true') {
      return true;
    }
    await deps.runCommand({
      command: 'docker',
      args: ['start', containerName],
    });
    return true;
  } catch {
    const readyResponse = await deps.fetchJson(`${qdrantUrl.replace(/\/+$/u, '')}/readyz`);
    if (readyResponse.ok) {
      return true;
    }
    await deps.runCommand({
      command: 'docker',
      args: ['pull', 'qdrant/qdrant:latest'],
    });
    await deps.runCommand({
      command: 'docker',
      args: [
        'run',
        '-d',
        '--restart',
        'unless-stopped',
        '-p',
        '6333:6333',
        '--name',
        containerName,
        'qdrant/qdrant:latest',
      ],
    });
    return false;
  }
}

async function probeQdrant(qdrantUrl: string, deps: HybridRetrievalSetupDeps) {
  const response = await deps.fetchJson(`${qdrantUrl.replace(/\/+$/u, '')}/readyz`);
  if (!response.ok) {
    throw new Error(`qdrant health probe failed: ${response.status} ${response.bodyText}`.trim());
  }
}

async function probeEmbedding(config: EmbeddingProbeConfig, deps: HybridRetrievalSetupDeps) {
  const response = await deps.fetchJson(`${config.baseUrl.replace(/\/+$/u, '')}/embeddings`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: config.model.trim(),
      input: ['agora hybrid retrieval probe'],
      ...(config.dimension?.trim() ? { dimensions: Number.parseInt(config.dimension.trim(), 10) } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`embedding probe failed: ${response.status} ${response.bodyText}`.trim());
  }
}
