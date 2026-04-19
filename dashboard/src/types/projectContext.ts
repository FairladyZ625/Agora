export interface ProjectContextReference {
  referenceKey: string;
  kind: string;
  slug: string;
  title: string | null;
  path: string;
}

export interface ProjectContextReferenceBundle {
  scope: string;
  mode: string;
  projectId: string;
  taskId: string | null;
  inventoryCount: number;
  references: ProjectContextReference[];
}

export interface ProjectContextAttentionRoute {
  ordinal: number;
  referenceKey: string;
  kind: string;
  rationale: string;
}

export interface ProjectContextAttentionRoutingPlan {
  scope: string;
  mode: string;
  projectId: string;
  taskId: string | null;
  audience: 'controller' | 'citizen' | 'craftsman';
  summary: string;
  routes: ProjectContextAttentionRoute[];
}

export interface ProjectContextBriefing {
  projectId: string;
  audience: 'controller' | 'citizen' | 'craftsman';
  markdown: string;
  sourceDocuments: Array<{
    kind: string;
    slug: string;
    title: string | null;
    path: string;
  }>;
}

export interface ProjectContextRuntimeDelivery {
  taskId: string;
  taskTitle: string;
  workspacePath: string;
  manifestPath: string;
  artifactPaths: {
    controller: string;
    citizen: string;
    craftsman: string;
  };
}

export interface ProjectContextDelivery {
  scope: 'project_context';
  briefing: ProjectContextBriefing;
  referenceBundle: ProjectContextReferenceBundle | null;
  attentionRoutingPlan: ProjectContextAttentionRoutingPlan | null;
  runtimeDelivery: ProjectContextRuntimeDelivery | null;
}
