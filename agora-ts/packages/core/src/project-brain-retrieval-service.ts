import type { RetrievalPlanDto, RetrievalResultDto, TaskRecord } from '@agora-ts/contracts';
import type { ProjectBrainChunk } from './project-brain-chunk.js';
import type { RetrievalPort } from './context-retrieval-port.js';
import type { ProjectBrainEmbeddingPort } from './project-brain-embedding-port.js';
import type { ProjectBrainSearchResult } from './project-brain-query-port.js';
import type { ProjectBrainService } from './project-brain-service.js';
import type { ProjectBrainVectorIndexPort } from './project-brain-vector-index-port.js';

export type ProjectBrainRetrievalAudience = 'controller' | 'citizen' | 'craftsman';

export interface SearchTaskProjectBrainContextInput {
  task_id: string;
  audience: ProjectBrainRetrievalAudience;
  query: string;
  max_results?: number;
}

export interface ProjectBrainRetrievalResult extends ProjectBrainSearchResult {
  retrieval_mode: 'hybrid' | 'raw_fallback';
  chunk_id?: string;
  heading_path?: string[];
  vector_score?: number;
  lexical_score?: number;
}

export interface ProjectBrainRetrievalServiceOptions {
  taskLookup: {
    getTask(taskId: string): TaskRecord | null;
  };
  projectBrainService: ProjectBrainService;
  embeddingPort: ProjectBrainEmbeddingPort;
  vectorIndexPort: Pick<ProjectBrainVectorIndexPort, 'querySimilarChunks'>;
}

export class ProjectBrainRetrievalService implements RetrievalPort {
  readonly provider = 'project_brain';

  constructor(private readonly options: ProjectBrainRetrievalServiceOptions) {}

  supports(plan: RetrievalPlanDto) {
    if (plan.scope !== 'project_brain' || plan.mode !== 'task_context') {
      return false;
    }
    return Boolean(plan.context.task_id && coerceAudience(plan.context.audience));
  }

  async retrieve(plan: RetrievalPlanDto): Promise<RetrievalResultDto[]> {
    if (!this.supports(plan)) {
      return [];
    }
    const audience = coerceAudience(plan.context.audience);
    if (!audience) {
      return [];
    }
    const results = await this.searchTaskContext({
      task_id: plan.context.task_id!,
      audience,
      query: plan.query.text,
      ...(plan.limit !== undefined ? { max_results: plan.limit } : {}),
    });
    return results.map(mapToRetrievalResult);
  }

  async searchTaskContext(input: SearchTaskProjectBrainContextInput): Promise<ProjectBrainRetrievalResult[]> {
    const task = this.options.taskLookup.getTask(input.task_id);
    if (!task?.project_id) {
      throw new Error(`task ${input.task_id} is not bound to a project`);
    }

    const maxResults = input.max_results ?? 5;

    try {
      const queryEmbedding = await this.options.embeddingPort.embedText(input.query);
      const vectorResults = await this.options.vectorIndexPort.querySimilarChunks({
        project_id: task.project_id,
        query_embedding: queryEmbedding,
        limit: maxResults * 4,
      });
      const filtered = vectorResults
        .filter((result) => isChunkAllowedForAudience(result.chunk, task, input.audience))
        .map((result) => mapHybridResult(result.chunk, input.query, result.score))
        .sort((left, right) => ((right.lexical_score ?? 0) + (right.vector_score ?? 0)) - ((left.lexical_score ?? 0) + (left.vector_score ?? 0)));
      if (filtered.length > 0) {
        return dedupeHybridResults(filtered).slice(0, maxResults);
      }
    } catch {
      // fall through to raw fallback
    }

    const fallbackResults = this.options.projectBrainService.queryDocuments?.(task.project_id, input.query) ?? [];
    return fallbackResults
      .filter((result) => isSearchResultAllowedForAudience(result, task, input.audience))
      .slice(0, maxResults)
      .map((result) => ({
        ...result,
        retrieval_mode: 'raw_fallback',
      }));
  }
}

function mapToRetrievalResult(result: ProjectBrainRetrievalResult): RetrievalResultDto {
  return {
    scope: 'project_brain',
    provider: 'project_brain',
    reference_key: `${result.kind}:${result.slug}${result.chunk_id ? `#${result.chunk_id}` : ''}`,
    project_id: result.project_id,
    title: result.title,
    path: result.path,
    preview: result.snippet,
    score: (result.vector_score ?? 0) + (result.lexical_score ?? 0),
    metadata: {
      kind: result.kind,
      slug: result.slug,
      retrieval_mode: result.retrieval_mode,
      ...(result.chunk_id ? { chunk_id: result.chunk_id } : {}),
      ...(result.heading_path ? { heading_path: result.heading_path } : {}),
      ...(result.vector_score !== undefined ? { vector_score: result.vector_score } : {}),
      ...(result.lexical_score !== undefined ? { lexical_score: result.lexical_score } : {}),
    },
  };
}

function mapHybridResult(chunk: ProjectBrainChunk, query: string, vectorScore: number): ProjectBrainRetrievalResult {
  const snippet = chunk.text.replace(/\n+/g, ' ').trim().slice(0, 160);
  return {
    project_id: chunk.project_id,
    kind: chunk.document_kind,
    slug: chunk.document_slug,
    title: chunk.title,
    path: chunk.source_path,
    snippet,
    retrieval_mode: 'hybrid',
    chunk_id: chunk.chunk_id,
    heading_path: chunk.heading_path,
    vector_score: vectorScore,
    lexical_score: lexicalScore(query, chunk),
  };
}

function coerceAudience(value: string | undefined): ProjectBrainRetrievalAudience | null {
  return value === 'controller' || value === 'citizen' || value === 'craftsman'
    ? value
    : null;
}

function lexicalScore(query: string, chunk: ProjectBrainChunk) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return 0;
  }
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const fields = [
    chunk.title ?? '',
    chunk.source_path,
    chunk.document_kind,
    chunk.document_slug,
    ...chunk.heading_path,
    chunk.text,
  ].map((field) => field.toLowerCase());

  let score = 0;
  for (const field of fields) {
    if (!field) {
      continue;
    }
    if (field.includes(normalizedQuery)) {
      score += 3;
    }
    for (const token of tokens) {
      if (field.includes(token)) {
        score += 1;
      }
    }
  }
  return score;
}

function dedupeHybridResults(results: ProjectBrainRetrievalResult[]) {
  const seen = new Set<string>();
  return results.filter((result) => {
    const key = `${result.kind}:${result.slug}:${result.chunk_id ?? ''}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function isChunkAllowedForAudience(chunk: ProjectBrainChunk, task: TaskRecord, audience: ProjectBrainRetrievalAudience) {
  if (chunk.document_kind !== 'citizen_scaffold') {
    return true;
  }
  return isScaffoldAllowedForAudience(chunk.document_slug, task, audience);
}

function isSearchResultAllowedForAudience(result: ProjectBrainSearchResult, task: TaskRecord, audience: ProjectBrainRetrievalAudience) {
  if (result.kind !== 'citizen_scaffold') {
    return true;
  }
  return isScaffoldAllowedForAudience(result.slug, task, audience);
}

function isScaffoldAllowedForAudience(slug: string, task: TaskRecord, audience: ProjectBrainRetrievalAudience) {
  if (audience !== 'craftsman') {
    return true;
  }
  const boundCitizens = task.team.members
    .filter((member) => member.member_kind === 'citizen')
    .map((member) => member.agentId);
  return boundCitizens.includes(slug);
}
