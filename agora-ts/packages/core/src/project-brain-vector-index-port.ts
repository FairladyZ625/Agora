import type { ProjectBrainChunk } from './project-brain-chunk.js';

export interface ProjectBrainVectorQueryInput {
  project_id: string;
  query_embedding: number[];
  limit: number;
  allowed_chunk_ids?: string[];
}

export interface ProjectBrainVectorQueryResult {
  chunk: ProjectBrainChunk;
  score: number;
}

export interface ProjectBrainVectorIndexStatus {
  healthy: boolean;
  provider: string;
  chunk_count?: number;
  warning?: string;
}

export interface ProjectBrainVectorIndexPort {
  upsertChunks(chunks: ProjectBrainChunk[], embeddings: number[][]): Promise<void>;
  deleteChunksByDocument(projectId: string, documentKind: string, documentSlug: string): Promise<void>;
  querySimilarChunks(input: ProjectBrainVectorQueryInput): Promise<ProjectBrainVectorQueryResult[]>;
  getStatus(projectId: string): Promise<ProjectBrainVectorIndexStatus>;
}
