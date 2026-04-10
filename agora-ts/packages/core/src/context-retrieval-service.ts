import type { RetrievalHealthDto, RetrievalPlanDto, RetrievalResultDto } from '@agora-ts/contracts';
import type { RetrievalRegistry } from './context-retrieval-registry.js';

export interface RetrievalServiceOptions {
  registry: RetrievalRegistry;
}

export class RetrievalService {
  constructor(private readonly options: RetrievalServiceOptions) {}

  async retrieve(plan: RetrievalPlanDto): Promise<RetrievalResultDto[]> {
    const ports = this.options.registry.resolve(plan);
    if (ports.length === 0) {
      return [];
    }
    const results = (await Promise.all(ports.map((port) => port.retrieve(plan)))).flat();
    return results
      .sort((left, right) => scoreOf(right) - scoreOf(left))
      .slice(0, plan.limit ?? results.length);
  }

  async checkHealth(plan?: RetrievalPlanDto): Promise<RetrievalHealthDto[]> {
    const ports = plan
      ? this.options.registry.resolve(plan)
      : this.options.registry.listProviders();
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
}

function scoreOf(result: RetrievalResultDto) {
  return result.score ?? 0;
}
