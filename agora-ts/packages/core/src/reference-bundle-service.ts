import type {
  AttentionAnchorDto,
  ContextInventoryEntryDto,
  ReferenceBundleDto,
  RetrievalResultDto,
} from '@agora-ts/contracts';
import type { ContextDeliveryPort, BuildReferenceBundleInput } from './context-delivery-port.js';
import type { ProjectBrainAutomationPolicy } from './project-brain-automation-policy.js';
import type { ProjectBrainDocument } from './project-brain-query-port.js';
import type { ProjectBrainService } from './project-brain-service.js';
import { ReferenceIndexService, toReferenceKey } from './reference-index-service.js';

export interface ReferenceBundleServiceOptions {
  projectBrainService: Pick<ProjectBrainService, 'listDocuments'>;
  policy: Pick<ProjectBrainAutomationPolicy, 'selectBootstrapDocuments'>;
  retrievalService?: {
    retrieve(plan: {
      scope: 'project_brain';
      mode: 'task_context';
      query: { text: string };
      limit?: number;
      context: {
        task_id: string;
        project_id: string;
        audience: string;
      };
    }): Promise<RetrievalResultDto[]>;
  };
  referenceIndexService?: ReferenceIndexService;
}

export class ReferenceBundleService implements ContextDeliveryPort {
  private readonly indexService: ReferenceIndexService;

  constructor(private readonly options: ReferenceBundleServiceOptions) {
    this.indexService = options.referenceIndexService ?? new ReferenceIndexService({
      projectBrainService: options.projectBrainService,
    });
  }

  buildReferenceBundle(input: BuildReferenceBundleInput): ReferenceBundleDto {
    return this.buildBundle(input, []);
  }

  async buildReferenceBundleAsync(input: BuildReferenceBundleInput): Promise<ReferenceBundleDto> {
    const retrievalResults = await this.retrieveAnchors(input);
    return this.buildBundle(input, retrievalResults);
  }

  private async retrieveAnchors(input: BuildReferenceBundleInput) {
    const query = buildTaskAwareQuery(input);
    if (!input.task_id || !query || !this.options.retrievalService) {
      return [];
    }
    try {
      return await this.options.retrievalService.retrieve({
        scope: 'project_brain',
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

  private buildBundle(input: BuildReferenceBundleInput, retrievalResults: RetrievalResultDto[]): ReferenceBundleDto {
    const inventory = this.indexService.buildProjectInventory(input.project_id);
    const documents = this.options.projectBrainService.listDocuments(input.project_id);
    const preferredDocumentKeys = dedupeStrings(retrievalResults.map(normalizeResultToDocumentKey).filter(Boolean) as string[]);
    const selectedDocuments = this.options.policy.selectBootstrapDocuments(documents, {
      audience: input.audience,
      ...(input.citizen_id ? { citizen_id: input.citizen_id } : {}),
      ...(input.task_id ? { task_id: input.task_id } : {}),
      ...(input.task_title ? { task_title: input.task_title } : {}),
      ...(input.task_description ? { task_description: input.task_description } : {}),
      ...(input.allowed_citizen_ids && input.allowed_citizen_ids.length > 0 ? { allowed_citizen_ids: input.allowed_citizen_ids } : {}),
      ...(preferredDocumentKeys.length > 0 ? { preferred_document_keys: preferredDocumentKeys } : {}),
    });

    const inventoryMap = new Map(inventory.entries.map((entry) => [entry.reference_key, entry]));
    const references = selectedDocuments
      .map((document) => inventoryMap.get(toReferenceKey(document)))
      .filter(Boolean) as ContextInventoryEntryDto[];
    const attentionAnchors = buildAttentionAnchors(retrievalResults);

    return {
      scope: 'project_brain',
      mode: input.mode,
      project_id: input.project_id,
      task_id: input.task_id ?? null,
      project_map: {
        index_reference_key: inventory.entries.find((entry) => entry.kind === 'index')?.reference_key ?? null,
        timeline_reference_key: inventory.entries.find((entry) => entry.kind === 'timeline')?.reference_key ?? null,
        inventory_count: inventory.entries.length,
      },
      inventory,
      references,
      attention_anchors: attentionAnchors,
      metadata: {
        audience: input.audience,
      },
    };
  }
}

function buildTaskAwareQuery(input: BuildReferenceBundleInput) {
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

function buildAttentionAnchors(results: RetrievalResultDto[]): AttentionAnchorDto[] {
  const anchors: AttentionAnchorDto[] = [];
  const seen = new Set<string>();
  for (const result of results) {
    const referenceKey = normalizeResultToDocumentKey(result);
    if (!referenceKey || seen.has(referenceKey)) {
      continue;
    }
    seen.add(referenceKey);
    anchors.push({
      reference_key: referenceKey,
      reason: 'Matched current task query in project brain.',
      score: result.score ?? null,
      metadata: {
        provider: result.provider,
        raw_reference_key: result.reference_key,
      },
    });
  }
  return anchors;
}

function dedupeStrings(values: string[]) {
  return [...new Set(values)];
}
