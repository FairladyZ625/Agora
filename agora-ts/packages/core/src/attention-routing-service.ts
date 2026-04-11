import type {
  AttentionRoutingPlanDto,
  AttentionRoutingRouteDto,
  ContextInventoryEntryDto,
  ReferenceBundleDto,
  RetrievalPlanDto,
  RetrievalResultDto,
} from '@agora-ts/contracts';

export interface BuildAttentionRoutingPlanInput {
  project_id: string;
  mode: string;
  audience: string;
  reference_bundle: ReferenceBundleDto;
  task_id?: string;
  task_title?: string;
  task_description?: string;
}

export interface AttentionRoutingServiceOptions {
  retrievalService?: {
    retrieve(plan: RetrievalPlanDto): Promise<RetrievalResultDto[]>;
  };
}

export class AttentionRoutingService {
  constructor(private readonly options: AttentionRoutingServiceOptions = {}) {}

  buildPlan(input: BuildAttentionRoutingPlanInput): AttentionRoutingPlanDto {
    return this.composePlan(input, []);
  }

  async buildPlanAsync(input: BuildAttentionRoutingPlanInput): Promise<AttentionRoutingPlanDto> {
    const retrievalResults = await this.retrieveTaskAwareMatches(input);
    return this.composePlan(input, retrievalResults);
  }

  private async retrieveTaskAwareMatches(input: BuildAttentionRoutingPlanInput) {
    const query = buildTaskAwareQuery(input);
    if (!query || !input.task_id || !this.options.retrievalService) {
      return [];
    }
    try {
      return await this.options.retrievalService.retrieve({
        scope: input.reference_bundle.scope,
        mode: 'task_context',
        query: { text: query },
        limit: 6,
        context: {
          task_id: input.task_id,
          project_id: input.project_id,
          audience: input.audience,
        },
      });
    } catch {
      return [];
    }
  }

  private composePlan(
    input: BuildAttentionRoutingPlanInput,
    retrievalResults: RetrievalResultDto[],
  ): AttentionRoutingPlanDto {
    const inventoryMap = new Map(
      input.reference_bundle.inventory.entries.map((entry) => [entry.reference_key, entry] as const),
    );
    const routes: AttentionRoutingRouteDto[] = [];
    const seen = new Set<string>();

    const pushRoute = (
      referenceKey: string | null | undefined,
      kind: AttentionRoutingRouteDto['kind'],
      rationale: string,
      score?: number | null,
      metadata?: Record<string, unknown>,
    ) => {
      if (!referenceKey || seen.has(referenceKey) || !inventoryMap.has(referenceKey)) {
        return;
      }
      seen.add(referenceKey);
      routes.push({
        reference_key: referenceKey,
        kind,
        ordinal: routes.length + 1,
        rationale,
        ...(score !== undefined ? { score } : {}),
        ...(metadata ? { metadata } : {}),
      });
    };

    pushRoute(
      input.reference_bundle.project_map.index_reference_key,
      'project_map',
      'Start here for project structure and canonical entrypoints.',
    );
    pushRoute(
      input.reference_bundle.project_map.timeline_reference_key,
      'project_map',
      'Check the current timeline before diving into task-specific references.',
    );

    for (const result of retrievalResults) {
      const referenceKey = normalizeResultToDocumentKey(result);
      if (!referenceKey) {
        continue;
      }
      pushRoute(
        referenceKey,
        'focus',
        'Matched the current task query in project brain retrieval.',
        result.score ?? null,
        {
          provider: result.provider,
          raw_reference_key: result.reference_key,
        },
      );
    }

    for (const reference of input.reference_bundle.references) {
      pushRoute(
        reference.reference_key,
        'supporting',
        'Curated for this audience by project brain bootstrap policy.',
      );
    }

    return {
      scope: input.reference_bundle.scope,
      mode: input.mode,
      project_id: input.project_id,
      task_id: input.task_id ?? null,
      audience: input.audience,
      summary: summarize(routes),
      routes,
      metadata: {
        inventory_count: input.reference_bundle.inventory.entries.length,
      },
    };
  }
}

function buildTaskAwareQuery(input: BuildAttentionRoutingPlanInput) {
  const parts = [input.task_title?.trim(), input.task_description?.trim()].filter((part): part is string => Boolean(part));
  if (parts.length === 0) {
    return null;
  }
  return parts.join('\n\n');
}

function normalizeResultToDocumentKey(result: RetrievalResultDto) {
  const explicit = typeof result.metadata?.document_key === 'string' ? result.metadata.document_key : null;
  if (explicit) {
    return explicit;
  }
  const kind = typeof result.metadata?.kind === 'string' ? result.metadata.kind : null;
  const slug = typeof result.metadata?.slug === 'string' ? result.metadata.slug : null;
  if (kind && slug) {
    return `${kind}:${slug}`;
  }
  const [documentKey] = result.reference_key.split('#');
  return documentKey?.trim().length ? documentKey : null;
}

function summarize(routes: AttentionRoutingRouteDto[]) {
  const hasProjectMap = routes.some((route) => route.kind === 'project_map');
  const hasFocus = routes.some((route) => route.kind === 'focus');
  if (hasProjectMap && hasFocus) {
    return 'Start from the project map, then focus on the task-matched references.';
  }
  if (hasProjectMap) {
    return 'Start from the project map, then review the curated supporting references.';
  }
  if (hasFocus) {
    return 'Focus on the task-matched references first.';
  }
  return 'Review the curated references for this audience.';
}
