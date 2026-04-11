import type { RetrievalHealthDto, RetrievalPlanDto, RetrievalResultDto } from '@agora-ts/contracts';

export interface RetrievalPort {
  readonly provider: string;
  supports(plan: RetrievalPlanDto): boolean;
  retrieve(plan: RetrievalPlanDto): Promise<RetrievalResultDto[]>;
  checkHealth?(plan?: RetrievalPlanDto): Promise<RetrievalHealthDto>;
}
