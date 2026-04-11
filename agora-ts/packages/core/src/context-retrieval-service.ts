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
    const results = (await Promise.all(ports.map((port) => port.retrieve(plan)))).flat();
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
    return Promise.all(ports.map(async (port) => {
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
}

function scoreOf(result: RetrievalResultDto) {
  return result.score ?? 0;
}
