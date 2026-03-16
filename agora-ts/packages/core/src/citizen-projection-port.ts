import type { CitizenDefinitionDto, CitizenProjectionPreviewDto, RoleDefinitionDto } from '@agora-ts/contracts';

export interface CitizenProjectionPreviewRequest {
  citizen: CitizenDefinitionDto;
  roleDefinition: RoleDefinitionDto;
  project: {
    id: string;
    name: string;
    summary: string | null;
    owner: string | null;
    status: string;
  };
}

export interface CitizenProjectionPort {
  readonly adapter: string;
  renderPreview(input: CitizenProjectionPreviewRequest): CitizenProjectionPreviewDto;
}
