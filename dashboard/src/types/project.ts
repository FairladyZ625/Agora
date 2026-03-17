export interface ProjectSummary {
  id: string;
  name: string;
  summary: string | null;
  owner: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectIndexDoc {
  kind: 'index';
  slug: 'index';
  title: string | null;
  path: string;
  content: string;
  updatedAt: string | null;
}

export interface ProjectRecap {
  taskId: string;
  title: string | null;
  summaryPath: string;
  updatedAt: string | null;
}

export interface ProjectKnowledgeDoc {
  kind: 'decision' | 'fact' | 'open_question' | 'reference';
  slug: string;
  title: string | null;
  path: string;
  content: string;
  sourceTaskIds: string[];
  updatedAt: string | null;
}

export interface ProjectCitizen {
  citizenId: string;
  roleId: string;
  displayName: string;
  status: string;
}

export interface ProjectWorkbench {
  project: ProjectSummary;
  index: ProjectIndexDoc | null;
  recaps: ProjectRecap[];
  knowledge: ProjectKnowledgeDoc[];
  citizens: ProjectCitizen[];
}
