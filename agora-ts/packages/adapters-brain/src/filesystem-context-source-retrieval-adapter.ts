import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join, relative, sep } from 'node:path';
import type { ContextSourceBindingDto, RetrievalHealthDto, RetrievalPlanDto, RetrievalResultDto } from '@agora-ts/contracts';
import type { RetrievalPort } from '@agora-ts/core';

const TEXT_EXTENSIONS = new Set(['.md', '.mdx', '.txt', '.json', '.yaml', '.yml', '.toml']);

export interface FilesystemContextSourceRetrievalAdapterOptions {
  listProjectBindings: (projectId: string) => ContextSourceBindingDto[];
  maxFilesPerBinding?: number;
}

export class FilesystemContextSourceRetrievalAdapter implements RetrievalPort {
  readonly provider = 'filesystem_context_source';
  private readonly maxFilesPerBinding: number;

  constructor(private readonly options: FilesystemContextSourceRetrievalAdapterOptions) {
    this.maxFilesPerBinding = options.maxFilesPerBinding ?? 200;
  }

  supports(plan: RetrievalPlanDto): boolean {
    return this.resolveBindings(plan).length > 0;
  }

  async retrieve(plan: RetrievalPlanDto): Promise<RetrievalResultDto[]> {
    const query = plan.query.text.trim();
    if (!query) {
      return [];
    }
    const results = this.resolveBindings(plan).flatMap((binding) => (
      scanBinding(binding, query, this.maxFilesPerBinding, plan.context.project_id ?? null)
    ));
    return results.sort((left, right) => scoreOf(right) - scoreOf(left));
  }

  async checkHealth(plan?: RetrievalPlanDto): Promise<RetrievalHealthDto> {
    const bindings = plan ? this.resolveBindings(plan) : [];
    if (bindings.length === 0) {
      return {
        scope: plan?.scope ?? 'context_source',
        provider: this.provider,
        status: 'unavailable',
        message: 'no matching filesystem context sources',
      };
    }

    const missing = bindings.filter((binding) => !existsSync(binding.location));
    if (missing.length === bindings.length) {
      return {
        scope: plan?.scope ?? 'context_source',
        provider: this.provider,
        status: 'unavailable',
        message: 'all filesystem context source paths are missing',
        metadata: { source_ids: bindings.map((binding) => binding.source_id) },
      };
    }

    return {
      scope: plan?.scope ?? 'context_source',
      provider: this.provider,
      status: missing.length > 0 ? 'degraded' : 'ready',
      message: missing.length > 0 ? 'some filesystem context source paths are missing' : 'filesystem context sources reachable',
      metadata: { source_ids: bindings.map((binding) => binding.source_id) },
    };
  }

  private resolveBindings(plan: RetrievalPlanDto): ContextSourceBindingDto[] {
    if (plan.scope !== 'context_source' && plan.scope !== 'project_context') {
      return [];
    }
    const projectId = plan.context.project_id;
    if (!projectId) {
      return [];
    }
    const requestedSourceIds = Array.isArray(plan.metadata?.source_ids)
      ? plan.metadata.source_ids.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    return this.options.listProjectBindings(projectId).filter((binding) => (
      binding.enabled
      && (binding.kind === 'local_path' || binding.kind === 'docs_repo')
      && (requestedSourceIds.length === 0 || requestedSourceIds.includes(binding.source_id))
    ));
  }
}

function scanBinding(
  binding: ContextSourceBindingDto,
  query: string,
  maxFiles: number,
  projectId: string | null,
): RetrievalResultDto[] {
  const files = listTextFiles(binding.location, maxFiles);
  return files
    .map((filePath) => buildFileResult(binding, filePath, query, projectId))
    .filter((result): result is RetrievalResultDto => result !== null);
}

function buildFileResult(
  binding: ContextSourceBindingDto,
  filePath: string,
  query: string,
  projectId: string | null,
): RetrievalResultDto | null {
  const content = safeReadText(filePath);
  if (!content) {
    return null;
  }
  const relativePath = toPosixPath(relative(binding.location, filePath));
  const score = lexicalScore(query, `${relativePath}\n${content}`);
  if (score <= 0) {
    return null;
  }
  const documentKey = `context_source:${binding.source_id}:${relativePath || basename(filePath)}`;
  return {
    scope: binding.project_id && projectId ? 'project_context' : 'context_source',
    provider: 'filesystem_context_source',
    ...(projectId ? { project_id: projectId } : {}),
    reference_key: documentKey,
    title: basename(filePath, extname(filePath)) || basename(filePath),
    path: filePath,
    preview: previewOf(content, query),
    score,
    metadata: {
      source_id: binding.source_id,
      source_kind: binding.kind,
      document_key: documentKey,
      relative_path: relativePath || basename(filePath),
    },
  };
}

function listTextFiles(root: string, maxFiles: number): string[] {
  if (!existsSync(root)) {
    return [];
  }
  const stats = statSync(root);
  if (stats.isFile()) {
    return isTextFile(root) ? [root] : [];
  }

  const files: string[] = [];
  const stack = [root];
  while (stack.length > 0 && files.length < maxFiles) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile() && isTextFile(fullPath)) {
        files.push(fullPath);
        if (files.length >= maxFiles) {
          break;
        }
      }
    }
  }
  return files;
}

function isTextFile(path: string) {
  return TEXT_EXTENSIONS.has(extname(path).toLowerCase());
}

function safeReadText(path: string) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function lexicalScore(query: string, haystack: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return 0;
  }
  const normalizedHaystack = haystack.toLowerCase();
  let score = 0;
  if (normalizedHaystack.includes(normalizedQuery)) {
    score += 6;
  }
  for (const token of normalizedQuery.split(/\s+/).filter(Boolean)) {
    if (normalizedHaystack.includes(token)) {
      score += 1;
    }
  }
  return score;
}

function previewOf(content: string, query: string) {
  const normalizedContent = content.replace(/\s+/g, ' ').trim();
  const normalizedQuery = query.trim().toLowerCase();
  const index = normalizedContent.toLowerCase().indexOf(normalizedQuery);
  if (index === -1) {
    return normalizedContent.slice(0, 180);
  }
  const start = Math.max(0, index - 60);
  const end = Math.min(normalizedContent.length, index + normalizedQuery.length + 120);
  return normalizedContent.slice(start, end);
}

function toPosixPath(value: string) {
  return value.split(sep).join('/');
}

function scoreOf(result: RetrievalResultDto) {
  return result.score ?? 0;
}
