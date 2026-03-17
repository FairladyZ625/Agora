import { createCitizenRequestSchema, type CitizenDefinitionDto, type CitizenProjectionPreviewDto, type CreateCitizenRequestDto } from '@agora-ts/contracts';
import { CitizenRepository, type AgoraDatabase } from '@agora-ts/db';
import { NotFoundError } from './errors.js';
import type { CitizenProjectionPort } from './citizen-projection-port.js';
import { ProjectService } from './project-service.js';
import type { RolePackService } from './role-pack-service.js';

export interface CitizenServiceOptions {
  projectService?: ProjectService;
  rolePackService: RolePackService;
  projectionPorts?: CitizenProjectionPort[];
}

export class CitizenService {
  private readonly citizens: CitizenRepository;
  private readonly projectService: ProjectService;
  private readonly rolePackService: RolePackService;
  private readonly projectionPorts: Map<string, CitizenProjectionPort>;

  constructor(db: AgoraDatabase, options: CitizenServiceOptions) {
    this.citizens = new CitizenRepository(db);
    this.projectService = options.projectService ?? new ProjectService(db);
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
