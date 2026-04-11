import type { RetrievalHealthDto, RetrievalPlanDto, RetrievalResultDto } from '@agora-ts/contracts';
import type { RetrievalRegistry } from './context-retrieval-registry.js';

export interface RetrievalServiceOptions {
  registry: RetrievalRegistry;
}

export class RetrievalService {
  constructor(private readonly options: RetrievalServiceOptions) {}

  async retrieve(plan: RetrievalPlanDto): Promise<RetrievalResultDto[]> {
    const ports = this.filterProviders(this.options.registry.resolve(plan), plan);
    if (ports.length === 0) {
      return [];
    }
    const results = this.filterResultsBySourceIds(
      (await Promise.all(ports.map((port) => port.retrieve(plan)))).flat(),
      plan,
    );
    return results
      .sort((left, right) => scoreOf(right) - scoreOf(left))
      .slice(0, plan.limit ?? results.length);
  }

  async checkHealth(plan?: RetrievalPlanDto): Promise<RetrievalHealthDto[]> {
    const ports = this.filterProviders(
      plan
        ? this.options.registry.resolve(plan)
        : this.options.registry.listProviders(),
      plan,
    );
    const health = await Promise.all(ports.map(async (port) => {
      if (!port.checkHealth) {
        return {
          scope: plan?.scope ?? 'global',
          provider: port.provider,
          status: 'ready',
          message: 'health check not implemented',
        } satisfies RetrievalHealthDto;
      }
      return port.checkHealth(plan);
    }));
    return this.filterHealthBySourceIds(health, plan);
  }

  private filterProviders<T extends { provider: string }>(ports: T[], plan?: RetrievalPlanDto): T[] {
    const providers = Array.isArray(plan?.metadata?.providers)
      ? plan.metadata.providers.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    if (providers.length === 0) {
      return ports;
    }
    const allowed = new Set(providers);
    return ports.filter((port) => allowed.has(port.provider));
  }

  private filterResultsBySourceIds(results: RetrievalResultDto[], plan?: RetrievalPlanDto): RetrievalResultDto[] {
    const allowed = requestedSourceIds(plan);
    if (!allowed) {
      return results;
    }
    return results.filter((result) => {
      const sourceId = typeof result.metadata?.source_id === 'string'
        ? result.metadata.source_id
        : null;
      return sourceId !== null && allowed.has(sourceId);
    });
  }

  private filterHealthBySourceIds(health: RetrievalHealthDto[], plan?: RetrievalPlanDto): RetrievalHealthDto[] {
    const allowed = requestedSourceIds(plan);
    if (!allowed) {
      return health;
    }
    return health.filter((item) => {
      const sourceIds = Array.isArray(item.metadata?.source_ids)
        ? item.metadata.source_ids.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        : [];
      return sourceIds.some((sourceId) => allowed.has(sourceId));
    });
  }
}

function scoreOf(result: RetrievalResultDto) {
  return result.score ?? 0;
}

function requestedSourceIds(plan?: RetrievalPlanDto): Set<string> | null {
  const sourceIds = Array.isArray(plan?.metadata?.source_ids)
    ? plan.metadata.source_ids.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : [];
  return sourceIds.length > 0 ? new Set(sourceIds) : null;
}
