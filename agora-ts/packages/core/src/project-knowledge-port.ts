export interface ProjectKnowledgeDocument {
  project_id: string;
  kind: 'index' | 'timeline' | 'decision' | 'fact' | 'open_question' | 'reference';
  slug: string;
  title: string | null;
  path: string;
  content: string;
  created_at: string | null;
  updated_at: string | null;
  source_task_ids: string[];
}

export interface ProjectKnowledgeRecapSummary {
  project_id: string;
  task_id: string;
  path: string;
  title: string | null;
  content: string;
  updated_at: string | null;
}

export type ProjectKnowledgeKind = 'decision' | 'fact' | 'open_question' | 'reference';

export interface ProjectKnowledgeEntryInput {
  project_id: string;
  kind: ProjectKnowledgeKind;
  slug: string;
  title: string;
  body: string;
  summary?: string | null;
  source_task_ids?: string[];
}

export interface ProjectKnowledgeSearchResult {
  project_id: string;
  kind: 'index' | 'timeline' | ProjectKnowledgeKind | 'recap';
  slug: string;
  title: string | null;
  path: string;
  snippet: string;
}

export interface ProjectKnowledgeProjectInput {
  id: string;
  name: string;
  summary: string | null;
  status: string;
  owner: string | null;
}

export interface ProjectKnowledgeTaskBindingInput {
  project_id: string;
  task_id: string;
  title: string;
  state: string;
  workspace_path: string | null;
  bound_at: string;
}

export interface ProjectKnowledgeTaskRecapInput {
  project_id: string;
  task_id: string;
  title: string;
  state: string;
  current_stage: string | null;
  controller_ref: string | null;
  workspace_path: string | null;
  completed_by: string;
  completed_at: string;
  summary_lines: string[];
}

export interface ProjectKnowledgePort {
  ensureProject(input: ProjectKnowledgeProjectInput): void;
  recordTaskBinding(input: ProjectKnowledgeTaskBindingInput): void;
  recordTaskRecap(input: ProjectKnowledgeTaskRecapInput): void;
  getProjectIndex(projectId: string): ProjectKnowledgeDocument | null;
  listProjectRecaps(projectId: string): ProjectKnowledgeRecapSummary[];
  upsertKnowledgeEntry(input: ProjectKnowledgeEntryInput): ProjectKnowledgeDocument;
  listKnowledgeEntries(projectId: string, kind?: ProjectKnowledgeKind): ProjectKnowledgeDocument[];
  getKnowledgeEntry(projectId: string, kind: ProjectKnowledgeKind, slug: string): ProjectKnowledgeDocument | null;
  searchProjectKnowledge(projectId: string, query: string, kind?: ProjectKnowledgeKind | 'recap'): ProjectKnowledgeSearchResult[];
}
