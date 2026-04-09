import type { RetrievalPlanDto } from '@agora-ts/contracts';
import type { RetrievalPort } from './context-retrieval-port.js';

export class RetrievalRegistry {
  private readonly ports = new Map<string, RetrievalPort>();

  constructor(initialPorts: RetrievalPort[] = []) {
    for (const port of initialPorts) {
      this.register(port);
    }
  }

  register(port: RetrievalPort) {
    this.ports.set(port.provider, port);
  }

  listProviders() {
    return [...this.ports.values()];
  }

  resolve(plan: RetrievalPlanDto) {
    return this.listProviders().filter((port) => port.supports(plan));
  }
}
