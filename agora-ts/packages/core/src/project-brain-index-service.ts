import type { ProjectBrainChunk } from './project-brain-chunk.js';
import type { ProjectBrainChunkingPolicy } from './project-brain-chunking-policy.js';
import type { ProjectBrainDocument, ProjectBrainDocumentKind } from './project-brain-query-port.js';
import type { ProjectBrainEmbeddingPort } from './project-brain-embedding-port.js';
import type { ProjectBrainService } from './project-brain-service.js';
import type { ProjectBrainVectorIndexPort, ProjectBrainVectorIndexStatus } from './project-brain-vector-index-port.js';

export interface ProjectBrainIndexServiceOptions {
  projectBrainService: ProjectBrainService;
  chunkingPolicy: ProjectBrainChunkingPolicy;
  embeddingPort: ProjectBrainEmbeddingPort;
  vectorIndexPort: ProjectBrainVectorIndexPort;
}

export interface SyncProjectBrainIndexInput {
  project_id: string;
  kind?: ProjectBrainDocumentKind;
  slug?: string;
}

export interface InspectProjectBrainChunksInput {
  project_id: string;
  kind: ProjectBrainDocumentKind;
  slug: string;
}

export class ProjectBrainIndexService {
  constructor(private readonly options: ProjectBrainIndexServiceOptions) {}

  async rebuildProjectIndex(projectId: string) {
    const documents = this.options.projectBrainService.listDocuments(projectId);
    const chunks = documents.flatMap((document) => this.options.chunkingPolicy.chunkDocument(document));
    try {
      const embeddings = await this.options.embeddingPort.embedBatch(chunks.map((chunk) => chunk.search_text));
      await this.options.vectorIndexPort.upsertChunks(chunks, embeddings);
    } catch (error) {
      console.error(`[brain-index] rebuild failed for project ${projectId}:`, error);
      throw error;
    }
    return {
      project_id: projectId,
      indexed_documents: documents.length,
      indexed_chunks: chunks.length,
    };
  }

  async syncProjectIndex(input: SyncProjectBrainIndexInput) {
    const documents = this.resolveDocuments(input);
    let indexedChunks = 0;

    for (const document of documents) {
      const chunks = this.options.chunkingPolicy.chunkDocument(document);
      try {
        const embeddings = await this.options.embeddingPort.embedBatch(chunks.map((chunk) => chunk.search_text));
        await this.options.vectorIndexPort.deleteChunksByDocument(document.project_id, document.kind, document.slug);
        await this.options.vectorIndexPort.upsertChunks(chunks, embeddings);
      } catch (error) {
        console.error(`[brain-index] sync failed for ${input.project_id}/${document.kind}/${document.slug}:`, error);
        throw error;
      }
      indexedChunks += chunks.length;
    }

    return {
      project_id: input.project_id,
      ...(input.kind ? { kind: input.kind } : {}),
      ...(input.slug ? { slug: input.slug } : {}),
      indexed_documents: documents.length,
      indexed_chunks: indexedChunks,
    };
  }

  getProjectIndexStatus(projectId: string): Promise<ProjectBrainVectorIndexStatus> {
    return this.options.vectorIndexPort.getStatus(projectId);
  }

  inspectDocumentChunks(input: InspectProjectBrainChunksInput): {
    document: ProjectBrainDocument;
    chunks: ProjectBrainChunk[];
  } {
    const document = this.options.projectBrainService.getDocument(input.project_id, input.kind, input.slug);
    if (!document) {
      throw new Error(`brain doc not found: ${input.kind}/${input.slug}`);
    }
    return {
      document,
      chunks: this.options.chunkingPolicy.chunkDocument(document),
    };
  }

  private resolveDocuments(input: SyncProjectBrainIndexInput) {
    if (!input.kind) {
      return this.options.projectBrainService.listDocuments(input.project_id);
    }
    if (input.slug) {
      const document = this.options.projectBrainService.getDocument(input.project_id, input.kind, input.slug);
      if (!document) {
        throw new Error(`brain doc not found: ${input.kind}/${input.slug}`);
      }
      return [document];
    }
    return this.options.projectBrainService.listDocuments(input.project_id, input.kind);
  }
}
