export interface ProjectKnowledgeDocument {
  project_id: string;
  path: string;
  content: string;
}

export interface ProjectKnowledgeRecapSummary {
  project_id: string;
  task_id: string;
  path: string;
  title: string | null;
  updated_at: string | null;
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
}
