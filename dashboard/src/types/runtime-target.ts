export type RuntimeTargetPresentationMode = 'headless' | 'im_presented';

export interface RuntimeTarget {
  runtimeTargetRef: string;
  inventoryKind: 'runtime_target';
  runtimeProvider: string | null;
  runtimeFlavor: string | null;
  hostFramework: string | null;
  primaryModel: string | null;
  workspaceDir: string | null;
  channelProviders: string[];
  inventorySources: string[];
  discordBotUserIds: string[];
  enabled: boolean;
  displayName: string | null;
  tags: string[];
  allowedProjects: string[];
  defaultRoles: string[];
  presentationMode: RuntimeTargetPresentationMode;
  presentationProvider: string | null;
  presentationIdentityRef: string | null;
  metadata: Record<string, unknown> | null;
  discovered: boolean;
}

export interface RuntimeTargetOverlayInput {
  enabled?: boolean;
  displayName?: string | null;
  tags?: string[];
  allowedProjects?: string[];
  defaultRoles?: string[];
  presentationMode?: RuntimeTargetPresentationMode;
  presentationProvider?: string | null;
  presentationIdentityRef?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ProjectRuntimeTargetMap {
  flavors?: Record<string, string>;
  default?: string;
  defaultCoding?: string;
  defaultReview?: string;
}

export interface ProjectRoleRuntimePolicyItem {
  preferredFlavor?: string | null;
}

export interface ProjectRuntimePolicy {
  runtimeTargets: ProjectRuntimeTargetMap | null;
  roleRuntimePolicy: Record<string, ProjectRoleRuntimePolicyItem>;
}

export interface ProjectRuntimePolicyEnvelope {
  projectId: string;
  runtimePolicy: ProjectRuntimePolicy;
}
