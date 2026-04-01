import { createCitizenRequestSchema, type CitizenDefinitionDto, type CitizenProjectionPreviewDto, type CreateCitizenRequestDto, type ICitizenRepository } from '@agora-ts/contracts';
import { NotFoundError } from './errors.js';
import type { CitizenProjectionPort } from './citizen-projection-port.js';
import type { ProjectService } from './project-service.js';
import type { RolePackService } from './role-pack-service.js';

export interface CitizenServiceOptions {
  repository: ICitizenRepository;
  projectService: ProjectService;
  rolePackService: RolePackService;
  projectionPorts?: CitizenProjectionPort[];
}

export class CitizenService {
  private readonly citizens: ICitizenRepository;
  private readonly projectService: ProjectService;
  private readonly rolePackService: RolePackService;
  private readonly projectionPorts: Map<string, CitizenProjectionPort>;

  constructor(options: CitizenServiceOptions) {
    this.citizens = options.repository;
    this.projectService = options.projectService;
    this.rolePackService = options.rolePackService;
    this.projectionPorts = new Map((options.projectionPorts ?? []).map((port) => [port.adapter, port]));
  }

  createCitizen(input: CreateCitizenRequestDto): CitizenDefinitionDto {
    const parsed = createCitizenRequestSchema.parse(input);
    this.projectService.requireProject(parsed.project_id);
    const role = this.rolePackService.getRoleDefinition(parsed.role_id);
    if (!role) {
      throw new NotFoundError(`Role not found: ${parsed.role_id}`);
    }
    if (role.member_kind === 'craftsman') {
      throw new Error(`Role ${parsed.role_id} cannot be projected as a citizen`);
    }
    if (!role.payload.citizen_scaffold) {
      throw new Error(`Role ${parsed.role_id} does not define citizen_scaffold`);
    }
    return this.citizens.insertCitizen(parsed);
  }

  getCitizen(citizenId: string): CitizenDefinitionDto | null {
    return this.citizens.getCitizen(citizenId);
  }

  requireCitizen(citizenId: string): CitizenDefinitionDto {
    const citizen = this.getCitizen(citizenId);
    if (!citizen) {
      throw new NotFoundError(`Citizen not found: ${citizenId}`);
    }
    return citizen;
  }

  listCitizens(projectId?: string, status?: CitizenDefinitionDto['status']): CitizenDefinitionDto[] {
    if (projectId) {
      this.projectService.requireProject(projectId);
    }
    return this.citizens.listCitizens(projectId, status);
  }

  previewProjection(citizenId: string): CitizenProjectionPreviewDto {
    const citizen = this.requireCitizen(citizenId);
    const project = this.projectService.requireProject(citizen.project_id);
    const role = this.rolePackService.getRoleDefinition(citizen.role_id);
    if (!role) {
      throw new NotFoundError(`Role not found: ${citizen.role_id}`);
    }
    const projectionPort = this.projectionPorts.get(citizen.runtime_projection.adapter);
    if (!projectionPort) {
      throw new Error(`Citizen projection adapter not configured: ${citizen.runtime_projection.adapter}`);
    }
    return projectionPort.renderPreview({
      citizen,
      roleDefinition: role.payload,
      project: {
        id: project.id,
        name: project.name,
        summary: project.summary,
        owner: project.owner,
        status: project.status,
      },
    });
  }
}
