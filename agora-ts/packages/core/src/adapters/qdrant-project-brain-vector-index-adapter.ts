import { QdrantClient } from '@qdrant/js-client-rest';
import { createHash } from 'node:crypto';
import type { ProjectBrainChunk } from '../project-brain-chunk.js';
import type {
  ProjectBrainVectorIndexPort,
  ProjectBrainVectorIndexStatus,
  ProjectBrainVectorQueryInput,
  ProjectBrainVectorQueryResult,
} from '../project-brain-vector-index-port.js';

interface QdrantCollectionsResponse {
  collections?: Array<{ name: string }>;
}

interface QdrantCountResponse {
  count?: number;
}

interface QdrantSearchPoint {
  score?: number;
  payload?: unknown | null;
}

interface QdrantClientLike {
  getCollections(): Promise<QdrantCollectionsResponse>;
  createCollection(collectionName: string, config: unknown): Promise<unknown>;
  upsert(collectionName: string, payload: unknown): Promise<unknown>;
  delete(collectionName: string, payload: unknown): Promise<unknown>;
  search(collectionName: string, payload: unknown): Promise<QdrantSearchPoint[]>;
  count(collectionName: string, payload: unknown): Promise<QdrantCountResponse>;
}

export interface QdrantProjectBrainVectorIndexAdapterOptions {
  client?: QdrantClientLike;
  collectionName?: string;
  vectorSize?: number;
  url?: string;
  apiKey?: string;
}

export class QdrantProjectBrainVectorIndexAdapter implements ProjectBrainVectorIndexPort {
  private readonly client: QdrantClientLike;
  private readonly collectionName: string;
  private readonly vectorSize: number;

  constructor(options: QdrantProjectBrainVectorIndexAdapterOptions = {}) {
    this.collectionName = options.collectionName ?? 'project_brain_chunks';
    this.vectorSize = options.vectorSize ?? 1536;
    const apiKey = options.apiKey ?? process.env.QDRANT_API_KEY;
    this.client = options.client ?? new QdrantClient({
      url: options.url ?? process.env.QDRANT_URL ?? 'http://127.0.0.1:6333',
      checkCompatibility: false,
      ...(apiKey ? { apiKey } : {}),
    });
  }

  async upsertChunks(chunks: ProjectBrainChunk[], embeddings: number[][]): Promise<void> {
    await this.ensureCollection();
    await this.client.upsert(this.collectionName, {
      wait: true,
      points: chunks.map((chunk, index) => ({
        id: toQdrantPointId(chunk.chunk_id),
        vector: embeddings[index] ?? [],
        payload: {
          ...chunk,
        },
      })),
    });
  }

  async deleteChunksByDocument(projectId: string, documentKind: string, documentSlug: string): Promise<void> {
    await this.ensureCollection();
    await this.client.delete(this.collectionName, {
      wait: true,
      filter: {
        must: [
          { key: 'project_id', match: { value: projectId } },
          { key: 'document_kind', match: { value: documentKind } },
          { key: 'document_slug', match: { value: documentSlug } },
        ],
      },
    });
  }

  async querySimilarChunks(input: ProjectBrainVectorQueryInput): Promise<ProjectBrainVectorQueryResult[]> {
    await this.ensureCollection();
    const points = await this.client.search(this.collectionName, {
      vector: input.query_embedding,
      limit: input.limit,
      with_payload: true,
      filter: {
        must: [
          { key: 'project_id', match: { value: input.project_id } },
        ],
      },
    });
    return points.flatMap((point) => isProjectBrainChunkPayload(point.payload)
      ? [{
          chunk: point.payload,
          score: point.score ?? 0,
        }]
      : []);
  }

  async getStatus(projectId: string): Promise<ProjectBrainVectorIndexStatus> {
    await this.ensureCollection();
    const count = await this.client.count(this.collectionName, {
      exact: true,
      filter: {
        must: [
          { key: 'project_id', match: { value: projectId } },
        ],
      },
    });
    return {
      healthy: true,
      provider: 'qdrant',
      chunk_count: count.count ?? 0,
    };
  }

  private async ensureCollection() {
    const collections = await this.client.getCollections();
    const exists = collections.collections?.some((collection) => collection.name === this.collectionName);
    if (exists) {
      return;
    }
    await this.client.createCollection(this.collectionName, {
      vectors: {
        size: this.vectorSize,
        distance: 'Cosine',
      },
    });
  }
}

function isProjectBrainChunkPayload(payload: unknown): payload is ProjectBrainChunk {
  if (!payload || typeof payload !== 'object') {
    return false;
  }
  return typeof (payload as ProjectBrainChunk).chunk_id === 'string'
    && typeof (payload as ProjectBrainChunk).project_id === 'string'
    && typeof (payload as ProjectBrainChunk).document_kind === 'string'
    && typeof (payload as ProjectBrainChunk).document_slug === 'string'
    && typeof (payload as ProjectBrainChunk).source_path === 'string'
    && typeof (payload as ProjectBrainChunk).text === 'string'
    && typeof (payload as ProjectBrainChunk).search_text === 'string';
}

function toQdrantPointId(chunkId: string) {
  const digest = createHash('md5').update(chunkId).digest('hex');
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}-${digest.slice(16, 20)}-${digest.slice(20, 32)}`;
}
