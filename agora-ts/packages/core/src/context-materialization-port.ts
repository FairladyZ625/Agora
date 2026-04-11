import type {
  ContextMaterializationRequestDto,
  ContextMaterializationResultDto,
  ContextMaterializationTargetDto,
} from '@agora-ts/contracts';

export interface ContextMaterializationPort {
  supports(target: ContextMaterializationTargetDto): boolean;
  materializeSync?(request: ContextMaterializationRequestDto): ContextMaterializationResultDto;
  materialize(request: ContextMaterializationRequestDto): Promise<ContextMaterializationResultDto>;
}
