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
  activationStatus: 'active_builtin' | 'active_project';
  projectStateRoot: string;
  profilePath: string;
  profileInstalled: boolean;
  repoPath: string | null;
  repoShimInstalled: boolean;
  bootstrapPromptsDir: string;
  lifecycleModules: string[];
  draftRoot: string;
  draftProfilePath: string;
  draftProfileInstalled: boolean;
  activeRoot: string;
  activeProfilePath: string;
  activeProfileInstalled: boolean;
}

export interface ProjectNomosPackSummary {
  packId: string;
  name: string;
  version: string;
  description: string;
  lifecycleModules: string[];
  doctorChecks: string[];
  source: string;
  root: string;
  profilePath: string;
}

export interface ProjectNomosReview {
  projectId: string;
  activationStatus: 'active_builtin' | 'active_project';
  canActivate: boolean;
  issues: string[];
  active: ProjectNomosPackSummary;
  draft: ProjectNomosPackSummary | null;
}

export interface ProjectNomosValidationIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  path?: string;
}

export interface ProjectNomosValidation {
  projectId: string;
  target: 'draft' | 'active';
  valid: boolean;
  activationStatus: 'active_builtin' | 'active_project';
  pack: ProjectNomosPackSummary | null;
  issues: ProjectNomosValidationIssue[];
}

export interface ProjectNomosDiffEntry {
  field: string;
  from: unknown;
  to: unknown;
}

export interface ProjectNomosDiff {
  projectId: string;
  base: 'builtin' | 'active';
  candidate: 'draft' | 'active';
  changed: boolean;
  basePack: ProjectNomosPackSummary | null;
  candidatePack: ProjectNomosPackSummary | null;
  differences: ProjectNomosDiffEntry[];
}

export interface ProjectNomosActivation {
  projectId: string;
  nomosId: string;
  activationStatus: 'active_project';
  activeRoot: string;
  activeProfilePath: string;
  activatedAt: string;
  activatedBy: string;
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
