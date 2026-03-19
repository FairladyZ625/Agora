import type { ProjectBrainDocumentKind } from './project-brain-query-port.js';

export interface ProjectBrainChunk {
  chunk_id: string;
  project_id: string;
  document_kind: ProjectBrainDocumentKind;
  document_slug: string;
  source_path: string;
  title: string | null;
  heading_path: string[];
  ordinal: number;
  text: string;
  search_text: string;
  updated_at: string | null;
  metadata?: Record<string, unknown>;
}
