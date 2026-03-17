import type { ProjectKnowledgeKind } from './project-knowledge-port.js';

export type ProjectBrainDocumentKind =
  | 'index'
  | 'timeline'
  | 'recap'
  | ProjectKnowledgeKind
  | 'citizen_scaffold';

export type ProjectBrainAppendKind = 'timeline' | ProjectKnowledgeKind;

export interface ProjectBrainDocument {
  project_id: string;
  kind: ProjectBrainDocumentKind;
  slug: string;
  title: string | null;
  path: string;
  content: string;
  created_at: string | null;
  updated_at: string | null;
  source_task_ids: string[];
  metadata?: Record<string, unknown>;
}

export interface ProjectBrainSearchResult {
  project_id: string;
  kind: ProjectBrainDocumentKind;
  slug: string;
  title: string | null;
  path: string;
  snippet: string;
}

export interface ProjectBrainAppendInput {
  project_id: string;
  kind: ProjectBrainAppendKind;
  slug?: string;
  title?: string;
  summary?: string | null;
  body: string;
  heading?: string;
  source_task_ids?: string[];
}

export interface ProjectBrainQueryPort {
  listDocuments(projectId: string, kind?: Exclude<ProjectBrainDocumentKind, 'citizen_scaffold'>): ProjectBrainDocument[];
  getDocument(projectId: string, kind: Exclude<ProjectBrainDocumentKind, 'citizen_scaffold'>, slug?: string): ProjectBrainDocument | null;
  queryDocuments(projectId: string, query: string, kind?: Exclude<ProjectBrainDocumentKind, 'citizen_scaffold'>): ProjectBrainSearchResult[];
  appendDocument(input: ProjectBrainAppendInput): ProjectBrainDocument;
}
