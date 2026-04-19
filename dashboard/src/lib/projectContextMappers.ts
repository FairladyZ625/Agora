import type { ApiProjectContextDeliveryDto } from '@/types/api';
import type {
  ProjectContextAttentionRoutingPlan,
  ProjectContextBriefing,
  ProjectContextDelivery,
  ProjectContextReferenceBundle,
  ProjectContextRuntimeDelivery,
} from '@/types/projectContext';

function mapBriefing(dto: ApiProjectContextDeliveryDto['delivery']['briefing']): ProjectContextBriefing {
  return {
    projectId: dto.project_id,
    audience: dto.audience,
    markdown: dto.markdown,
    sourceDocuments: dto.source_documents.map((document) => ({
      kind: document.kind,
      slug: document.slug,
      title: document.title,
      path: document.path,
    })),
  };
}

function mapReferenceBundle(dto: NonNullable<ApiProjectContextDeliveryDto['delivery']['reference_bundle']>): ProjectContextReferenceBundle {
  return {
    scope: dto.scope,
    mode: dto.mode,
    projectId: dto.project_id,
    taskId: dto.task_id ?? null,
    inventoryCount: dto.project_map.inventory_count,
    references: dto.references.map((reference) => ({
      referenceKey: reference.reference_key,
      kind: reference.kind,
      slug: reference.slug,
      title: reference.title,
      path: reference.path,
    })),
  };
}

function mapAttentionRoutingPlan(dto: NonNullable<ApiProjectContextDeliveryDto['delivery']['attention_routing_plan']>): ProjectContextAttentionRoutingPlan {
  return {
    scope: dto.scope,
    mode: dto.mode,
    projectId: dto.project_id,
    taskId: dto.task_id ?? null,
    audience: dto.audience as ProjectContextAttentionRoutingPlan['audience'],
    summary: dto.summary,
    routes: dto.routes.map((route) => ({
      ordinal: route.ordinal,
      referenceKey: route.reference_key,
      kind: route.kind,
      rationale: route.rationale,
    })),
  };
}

function mapRuntimeDelivery(dto: NonNullable<ApiProjectContextDeliveryDto['delivery']['runtime_delivery']>): ProjectContextRuntimeDelivery {
  return {
    taskId: dto.task_id,
    taskTitle: dto.task_title,
    workspacePath: dto.workspace_path,
    manifestPath: dto.manifest_path,
    artifactPaths: {
      controller: dto.artifact_paths.controller,
      citizen: dto.artifact_paths.citizen,
      craftsman: dto.artifact_paths.craftsman,
    },
  };
}

export function mapProjectContextDeliveryDto(dto: ApiProjectContextDeliveryDto): ProjectContextDelivery {
  return {
    scope: dto.scope,
    briefing: mapBriefing(dto.delivery.briefing),
    referenceBundle: dto.delivery.reference_bundle ? mapReferenceBundle(dto.delivery.reference_bundle) : null,
    attentionRoutingPlan: dto.delivery.attention_routing_plan ? mapAttentionRoutingPlan(dto.delivery.attention_routing_plan) : null,
    runtimeDelivery: dto.delivery.runtime_delivery ? mapRuntimeDelivery(dto.delivery.runtime_delivery) : null,
  };
}
