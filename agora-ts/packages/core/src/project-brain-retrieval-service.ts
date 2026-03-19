import type { StoredTask } from '@agora-ts/db';
import type { ProjectBrainChunk } from './project-brain-chunk.js';
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
    getTask(taskId: string): StoredTask | null;
  };
  projectBrainService: ProjectBrainService;
  embeddingPort: ProjectBrainEmbeddingPort;
  vectorIndexPort: Pick<ProjectBrainVectorIndexPort, 'querySimilarChunks'>;
}

export class ProjectBrainRetrievalService {
  constructor(private readonly options: ProjectBrainRetrievalServiceOptions) {}

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

function isChunkAllowedForAudience(chunk: ProjectBrainChunk, task: StoredTask, audience: ProjectBrainRetrievalAudience) {
  if (chunk.document_kind !== 'citizen_scaffold') {
    return true;
  }
  return isScaffoldAllowedForAudience(chunk.document_slug, task, audience);
}

function isSearchResultAllowedForAudience(result: ProjectBrainSearchResult, task: StoredTask, audience: ProjectBrainRetrievalAudience) {
  if (result.kind !== 'citizen_scaffold') {
    return true;
  }
  return isScaffoldAllowedForAudience(result.slug, task, audience);
}

function isScaffoldAllowedForAudience(slug: string, task: StoredTask, audience: ProjectBrainRetrievalAudience) {
  if (audience !== 'craftsman') {
    return true;
  }
  const boundCitizens = task.team.members
    .filter((member) => member.member_kind === 'citizen')
    .map((member) => member.agentId);
  return boundCitizens.includes(slug);
}
