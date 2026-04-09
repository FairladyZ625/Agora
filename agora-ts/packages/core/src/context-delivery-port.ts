import type { ReferenceBundleDto } from '@agora-ts/contracts';
import type { ProjectBrainAutomationAudience } from './project-brain-automation-policy.js';

export interface BuildReferenceBundleInput {
  project_id: string;
  mode: 'bootstrap' | 'disclose';
  audience: ProjectBrainAutomationAudience;
  task_id?: string;
  task_title?: string;
  task_description?: string;
  citizen_id?: string | null;
  allowed_citizen_ids?: string[];
}

export interface ContextDeliveryPort {
  buildReferenceBundle(input: BuildReferenceBundleInput): ReferenceBundleDto;
  buildReferenceBundleAsync(input: BuildReferenceBundleInput): Promise<ReferenceBundleDto>;
}
