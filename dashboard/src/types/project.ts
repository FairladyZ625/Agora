export interface ProjectSummary {
  id: string;
  name: string;
  summary: string | null;
  owner: string | null;
  status: string;
  nomosId: string | null;
  repoPath: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectNomosState {
  nomosId: string;
  projectStateRoot: string;
  profilePath: string;
  profileInstalled: boolean;
  repoPath: string | null;
  repoShimInstalled: boolean;
  bootstrapPromptsDir: string;
  lifecycleModules: string[];
}

export interface ProjectIndexDoc {
  kind: 'index';
  slug: 'index';
  title: string | null;
  path: string;
  content: string;
  updatedAt: string | null;
}

export interface ProjectTimelineDoc {
  kind: 'timeline';
  slug: 'timeline';
  title: string | null;
  path: string;
  content: string;
  sourceTaskIds: string[];
  updatedAt: string | null;
}

export interface ProjectRecap {
  taskId: string;
  title: string | null;
  summaryPath: string;
  content: string;
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
  persona: string | null;
  boundaries: string[];
  skillsRef: string[];
  channelPolicies: Record<string, unknown>;
  brainScaffoldMode: 'role_default' | 'custom';
  runtimeAdapter: string;
  runtimeMetadata: Record<string, unknown>;
}

export interface ProjectTaskSummary {
  id: string;
  title: string;
  state: string;
  projectId: string | null;
}

export interface ProjectTodoSummary {
  id: number;
  text: string;
  status: string;
  projectId: string | null;
}

export interface ProjectWorkbench {
  project: ProjectSummary;
  nomos: ProjectNomosState | null;
  index: ProjectIndexDoc | null;
  timeline: ProjectTimelineDoc | null;
  recaps: ProjectRecap[];
  knowledge: ProjectKnowledgeDoc[];
  citizens: ProjectCitizen[];
  tasks: ProjectTaskSummary[];
  todos: ProjectTodoSummary[];
}
