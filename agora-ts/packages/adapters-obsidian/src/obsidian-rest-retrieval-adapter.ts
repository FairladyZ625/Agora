import { basename } from 'node:path';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { ContextSourceBindingDto, RetrievalHealthDto, RetrievalPlanDto, RetrievalResultDto } from '@agora-ts/contracts';
import type { RetrievalPort } from '@agora-ts/core';

export interface ObsidianRestSourceConfig {
  source_id: string;
  scope: 'workspace' | 'project';
  project_id?: string | null;
  label: string;
  base_url: string;
  api_key?: string | null;
  insecure_tls?: boolean;
  context_length?: number;
}

export interface ObsidianRestReadResult {
  source_id: string;
  filename: string;
  path: string;
  content: string;
  preview: string;
}

export interface ObsidianRestTransportRequest {
  method: 'GET' | 'POST';
  url: string;
  headers: Record<string, string>;
}

export interface ObsidianRestTransportResponse {
  status: number;
  body: string;
  headers: Record<string, string | string[] | undefined>;
}

export type ObsidianRestTransport = (
  request: ObsidianRestTransportRequest,
  options: { insecure_tls: boolean },
) => Promise<ObsidianRestTransportResponse>;

export interface ObsidianRestRetrievalAdapterOptions {
  config: ObsidianRestSourceConfig;
  transport?: ObsidianRestTransport;
}

export class ObsidianRestRetrievalAdapter implements RetrievalPort {
  readonly provider: string;

  constructor(private readonly options: ObsidianRestRetrievalAdapterOptions) {
    this.provider = `obsidian_rest:${options.config.source_id}`;
  }

  static fromContextSourceBinding(
    binding: ContextSourceBindingDto,
    overrides: Omit<Partial<ObsidianRestSourceConfig>, 'source_id' | 'scope' | 'project_id' | 'label' | 'base_url'> = {},
  ) {
    return new ObsidianRestRetrievalAdapter({
      config: resolveObsidianRestSourceConfig(binding, overrides),
    });
  }

  supports(plan: RetrievalPlanDto): boolean {
    if (plan.scope !== 'context_source') {
      return false;
    }
    const requestedSourceIds = Array.isArray(plan.metadata?.source_ids)
      ? plan.metadata.source_ids.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    return requestedSourceIds.length === 0 || requestedSourceIds.includes(this.options.config.source_id);
  }

  async retrieve(plan: RetrievalPlanDto): Promise<RetrievalResultDto[]> {
    const url = this.buildSimpleSearchUrl(plan.query.text, plan.metadata);
    const response = await this.send({
      method: 'POST',
      url,
      headers: {
        Accept: 'application/json',
      },
    });
    if (response.status < 200 || response.status >= 300) {
      return [];
    }
    const rawResults = parseJson<Array<{
      filename?: unknown;
      score?: unknown;
      matches?: Array<{ context?: unknown }>;
    }>>(response.body);
    if (!Array.isArray(rawResults)) {
      return [];
    }
    return rawResults
      .map((result, index) => this.normalizeSearchResult(result, index))
      .filter((result): result is RetrievalResultDto => result !== null);
  }

  async checkHealth(): Promise<RetrievalHealthDto> {
    try {
      const response = await this.send({
        method: 'GET',
        url: new URL('/', ensureTrailingSlash(this.options.config.base_url)).toString(),
        headers: {
          Accept: 'application/json',
        },
      });
      if (response.status === 401 || response.status === 403) {
        return {
          scope: 'context_source',
          provider: this.provider,
          status: 'degraded',
          message: `obsidian_rest auth rejected with status ${response.status}`,
        };
      }
      if (response.status < 200 || response.status >= 300) {
        return {
          scope: 'context_source',
          provider: this.provider,
          status: 'degraded',
          message: `obsidian_rest health probe returned status ${response.status}`,
        };
      }
      const payload = parseJson<{ authenticated?: unknown }>(response.body);
      const authenticated = payload && typeof payload.authenticated === 'boolean' ? payload.authenticated : null;
      return {
        scope: 'context_source',
        provider: this.provider,
        status: authenticated === false ? 'degraded' : 'ready',
        message: authenticated === false ? 'obsidian_rest reachable but not authenticated' : 'obsidian_rest reachable',
        metadata: {
          source_id: this.options.config.source_id,
          authenticated,
        },
      };
    } catch (error) {
      return {
        scope: 'context_source',
        provider: this.provider,
        status: 'unavailable',
        message: error instanceof Error ? error.message : 'obsidian_rest transport failed',
      };
    }
  }

  async readNote(filename: string): Promise<ObsidianRestReadResult> {
    const normalizedFilename = normalizeVaultPath(filename);
    const response = await this.send({
      method: 'GET',
      url: this.buildVaultReadUrl(normalizedFilename),
      headers: {
        Accept: 'text/markdown',
      },
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`obsidian_rest read failed with status ${response.status}`);
    }
    const content = response.body;
    return {
      source_id: this.options.config.source_id,
      filename: normalizedFilename,
      path: `obsidian://${this.options.config.source_id}/${normalizedFilename}`,
      content,
      preview: previewOf(content),
    };
  }

  private normalizeSearchResult(
    result: { filename?: unknown; score?: unknown; matches?: Array<{ context?: unknown }> },
    index: number,
  ): RetrievalResultDto | null {
    if (typeof result.filename !== 'string' || result.filename.trim().length === 0) {
      return null;
    }
    const filename = normalizeVaultPath(result.filename);
    const preview = Array.isArray(result.matches)
      ? result.matches
        .map((match) => (typeof match?.context === 'string' ? match.context.trim() : ''))
        .filter(Boolean)
        .join('\n...\n')
      : '';
    return {
      scope: 'context_source',
      provider: this.provider,
      reference_key: `${toDocumentReferenceKey(this.options.config.source_id, filename)}#match-${index + 1}`,
      ...(this.options.config.project_id ? { project_id: this.options.config.project_id } : {}),
      title: titleOf(filename),
      path: `obsidian://${this.options.config.source_id}/${filename}`,
      preview: preview || filename,
      ...(typeof result.score === 'number' ? { score: result.score } : {}),
      metadata: {
        source_id: this.options.config.source_id,
        source_kind: 'obsidian_rest',
        filename,
        document_key: toDocumentReferenceKey(this.options.config.source_id, filename),
      },
    };
  }

  private buildSimpleSearchUrl(query: string, metadata: RetrievalPlanDto['metadata']) {
    const contextLength = typeof metadata?.context_length === 'number'
      ? metadata.context_length
      : this.options.config.context_length ?? 120;
    const url = new URL('/search/simple/', ensureTrailingSlash(this.options.config.base_url));
    url.searchParams.set('query', query);
    url.searchParams.set('contextLength', String(contextLength));
    return url.toString();
  }

  private buildVaultReadUrl(filename: string) {
    const url = new URL(`/vault/${filename.split('/').map(encodeURIComponent).join('/')}`, ensureTrailingSlash(this.options.config.base_url));
    return url.toString();
  }

  private async send(request: ObsidianRestTransportRequest) {
    const headers = {
      ...request.headers,
      ...(this.options.config.api_key
        ? { Authorization: `Bearer ${this.options.config.api_key}` }
        : {}),
    };
    const transport = this.options.transport ?? defaultObsidianRestTransport;
    return transport(
      {
        ...request,
        headers,
      },
      { insecure_tls: this.options.config.insecure_tls ?? false },
    );
  }
}

export function resolveObsidianRestSourceConfig(
  binding: ContextSourceBindingDto,
  overrides: Omit<Partial<ObsidianRestSourceConfig>, 'source_id' | 'scope' | 'project_id' | 'label' | 'base_url'> = {},
): ObsidianRestSourceConfig {
  if (binding.kind !== 'obsidian_rest') {
    throw new Error(`context source binding is not obsidian_rest: ${binding.source_id}`);
  }
  const metadata = asRecord(binding.metadata);
  const apiKey = typeof metadata?.api_key === 'string' && metadata.api_key.trim().length > 0
    ? metadata.api_key
    : null;
  const insecureTls = metadata?.insecure_tls === true;
  const contextLength = typeof metadata?.context_length === 'number'
    ? metadata.context_length
    : undefined;
  return {
    source_id: binding.source_id,
    scope: binding.scope,
    ...(binding.project_id ? { project_id: binding.project_id } : {}),
    label: binding.label,
    base_url: binding.location,
    ...(apiKey ? { api_key: apiKey } : {}),
    ...(typeof insecureTls === 'boolean' ? { insecure_tls: insecureTls } : {}),
    ...(contextLength ? { context_length: contextLength } : {}),
    ...overrides,
  };
}

const defaultObsidianRestTransport: ObsidianRestTransport = (request, options) => new Promise((resolve, reject) => {
  const url = new URL(request.url);
  const transport = url.protocol === 'https:' ? httpsRequest : httpRequest;
  const req = transport({
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port ? Number(url.port) : undefined,
    path: `${url.pathname}${url.search}`,
    method: request.method,
    headers: request.headers,
    ...(url.protocol === 'https:' ? { rejectUnauthorized: !options.insecure_tls } : {}),
  }, (res) => {
    const chunks: Buffer[] = [];
    res.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    res.on('end', () => {
      resolve({
        status: res.statusCode ?? 0,
        body: Buffer.concat(chunks).toString('utf8'),
        headers: res.headers,
      });
    });
  });
  req.on('error', reject);
  req.end();
});

function ensureTrailingSlash(baseUrl: string) {
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}

function normalizeVaultPath(filename: string) {
  return filename.replace(/^\/+/, '').trim();
}

function titleOf(filename: string) {
  return basename(filename).replace(/\.[^.]+$/, '');
}

function toDocumentReferenceKey(sourceId: string, filename: string) {
  return `obsidian_rest:${sourceId}:${encodeURIComponent(filename)}`;
}

function previewOf(content: string) {
  const trimmed = content.trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.split('\n').slice(0, 6).join('\n');
}

function parseJson<T>(body: string): T | null {
  try {
    return JSON.parse(body) as T;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}
