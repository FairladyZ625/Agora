import type { ContextSourceBindingDto, RetrievalHealthDto, RetrievalPlanDto, RetrievalResultDto } from '@agora-ts/contracts';
import {
  ObsidianRestRetrievalAdapter,
  type ObsidianRestTransport,
  resolveObsidianRestSourceConfig,
} from './obsidian-rest-retrieval-adapter.js';

export interface ObsidianContextSourceRetrievalAdapterOptions {
  listProjectBindings: (projectId: string) => ContextSourceBindingDto[];
  transport?: ObsidianRestTransport;
}

export class ObsidianContextSourceRetrievalAdapter {
  readonly provider = 'obsidian_context_source';

  constructor(private readonly options: ObsidianContextSourceRetrievalAdapterOptions) {}

  supports(plan: RetrievalPlanDto): boolean {
    return this.resolveBindings(plan).length > 0;
  }

  async retrieve(plan: RetrievalPlanDto): Promise<RetrievalResultDto[]> {
    const bindings = this.resolveBindings(plan);
    const results = await Promise.all(bindings.map(async (binding) => {
      const adapter = new ObsidianRestRetrievalAdapter({
        config: resolveObsidianRestSourceConfig(binding),
        ...(this.options.transport ? { transport: this.options.transport } : {}),
      });
      return adapter.retrieve(plan);
    }));
    return results.flat();
  }

  async checkHealth(plan?: RetrievalPlanDto): Promise<RetrievalHealthDto> {
    const bindings = plan ? this.resolveBindings(plan) : [];
    if (bindings.length === 0) {
      return {
        scope: plan?.scope ?? 'context_source',
        provider: this.provider,
        status: 'unavailable',
        message: 'no matching obsidian context sources',
      };
    }

    const health = await Promise.all(bindings.map(async (binding) => {
      const adapter = new ObsidianRestRetrievalAdapter({
        config: resolveObsidianRestSourceConfig(binding),
        ...(this.options.transport ? { transport: this.options.transport } : {}),
      });
      return adapter.checkHealth();
    }));

    if (health.some((item) => item.status === 'ready')) {
      return {
        scope: plan?.scope ?? 'context_source',
        provider: this.provider,
        status: health.some((item) => item.status !== 'ready') ? 'degraded' : 'ready',
        message: 'obsidian context source retrieval reachable',
        metadata: {
          source_ids: bindings.map((binding) => binding.source_id),
        },
      };
    }

    if (health.some((item) => item.status === 'degraded')) {
      return {
        scope: plan?.scope ?? 'context_source',
        provider: this.provider,
        status: 'degraded',
        message: 'obsidian context source retrieval partially degraded',
        metadata: {
          source_ids: bindings.map((binding) => binding.source_id),
        },
      };
    }

    return {
      scope: plan?.scope ?? 'context_source',
      provider: this.provider,
      status: 'unavailable',
      message: 'obsidian context source retrieval unavailable',
      metadata: {
        source_ids: bindings.map((binding) => binding.source_id),
      },
    };
  }

  private resolveBindings(plan: RetrievalPlanDto): ContextSourceBindingDto[] {
    if (plan.scope !== 'context_source' && plan.scope !== 'project_context') {
      return [];
    }
    const projectId = plan.context.project_id;
    if (!projectId) {
      return [];
    }
    const requestedSourceIds = Array.isArray(plan.metadata?.source_ids)
      ? plan.metadata.source_ids.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    return this.options.listProjectBindings(projectId).filter((binding) => (
      binding.enabled
      && binding.kind === 'obsidian_rest'
      && (requestedSourceIds.length === 0 || requestedSourceIds.includes(binding.source_id))
    ));
  }
}
