import type {
  ContextMaterializationRequestDto,
  ContextMaterializationResultDto,
  ContextMaterializationTargetDto,
} from '@agora-ts/contracts';
import type { ContextMaterializationPort } from './context-materialization-port.js';

export interface ContextMaterializationServiceOptions {
  ports: ContextMaterializationPort[];
}

export class ContextMaterializationService {
  constructor(private readonly options: ContextMaterializationServiceOptions) {}

  supports(target: ContextMaterializationTargetDto) {
    return this.options.ports.some((port) => port.supports(target));
  }

  async materialize(request: ContextMaterializationRequestDto): Promise<ContextMaterializationResultDto> {
    const port = this.options.ports.find((candidate) => candidate.supports(request.target));
    if (!port) {
      throw new Error(`No context materialization port configured for target: ${request.target}`);
    }
    return port.materialize(request);
  }

  materializeSync(request: ContextMaterializationRequestDto): ContextMaterializationResultDto {
    const port = this.options.ports.find((candidate) => candidate.supports(request.target) && candidate.materializeSync);
    if (!port?.materializeSync) {
      throw new Error(`No synchronous context materialization port configured for target: ${request.target}`);
    }
    return port.materializeSync(request);
  }
}
