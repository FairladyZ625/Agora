import type {
  ContextInventoryEntryDto,
  ReferenceBundleDto,
} from '@agora-ts/contracts';
import type { ContextDeliveryPort, BuildReferenceBundleInput } from './context-delivery-port.js';
import type { ProjectBrainAutomationPolicy } from './project-brain-automation-policy.js';
import type { ProjectBrainDocument } from './project-brain-query-port.js';
import type { ProjectBrainService } from './project-brain-service.js';
import { ReferenceIndexService, toReferenceKey } from './reference-index-service.js';

export interface ReferenceBundleServiceOptions {
  projectBrainService: Pick<ProjectBrainService, 'listDocuments'>;
  policy: Pick<ProjectBrainAutomationPolicy, 'selectBootstrapDocuments'>;
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
    return this.buildBundle(input);
  }

  async buildReferenceBundleAsync(input: BuildReferenceBundleInput): Promise<ReferenceBundleDto> {
    return this.buildBundle(input);
  }

  private buildBundle(input: BuildReferenceBundleInput): ReferenceBundleDto {
    const inventory = this.indexService.buildProjectInventory(input.project_id);
    const documents = this.options.projectBrainService.listDocuments(input.project_id);
    const selectedDocuments = this.options.policy.selectBootstrapDocuments(documents, {
      audience: input.audience,
      ...(input.citizen_id ? { citizen_id: input.citizen_id } : {}),
      ...(input.task_id ? { task_id: input.task_id } : {}),
      ...(input.task_title ? { task_title: input.task_title } : {}),
      ...(input.task_description ? { task_description: input.task_description } : {}),
      ...(input.allowed_citizen_ids && input.allowed_citizen_ids.length > 0 ? { allowed_citizen_ids: input.allowed_citizen_ids } : {}),
    });

    const inventoryMap = new Map(inventory.entries.map((entry) => [entry.reference_key, entry]));
    const references = selectedDocuments
      .map((document) => inventoryMap.get(toReferenceKey(document)))
      .filter(Boolean) as ContextInventoryEntryDto[];

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
      metadata: {
        audience: input.audience,
      },
    };
  }
}
