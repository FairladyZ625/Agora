import type { CreateProjectAgentRosterEntryDto, IProjectAgentRosterRepository, ProjectAgentRosterEntryRecord } from '@agora-ts/contracts';

export interface ProjectAgentRosterServiceOptions {
  repository: IProjectAgentRosterRepository;
}

export class ProjectAgentRosterService {
  private readonly roster: IProjectAgentRosterRepository;

  constructor(options: ProjectAgentRosterServiceOptions) {
    this.roster = options.repository;
  }

  seedProjectRoster(projectId: string, entries: CreateProjectAgentRosterEntryDto[] = []): ProjectAgentRosterEntryRecord[] {
    return entries.map((entry, index) => this.roster.upsertEntry({
      id: `par-${projectId}-${index + 1}`,
      project_id: projectId,
      agent_ref: entry.agent_ref,
      kind: entry.kind,
      default_inclusion: entry.default_inclusion ?? true,
      status: 'active',
    }));
  }

  hasConfiguredRoster(projectId: string): boolean {
    return this.roster.listByProject(projectId).length > 0;
  }

  requireActiveAgent(projectId: string, agentRef: string): ProjectAgentRosterEntryRecord {
    const entry = this.roster.getByProjectAgent(projectId, agentRef);
    if (!entry || entry.status !== 'active') {
      throw new Error(`controller agent ${agentRef} is not an active project roster member`);
    }
    return entry;
  }
}
