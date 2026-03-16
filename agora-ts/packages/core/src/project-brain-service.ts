import { NotFoundError } from './errors.js';
import type { CitizenService } from './citizen-service.js';
import type {
  ProjectBrainAppendInput,
  ProjectBrainDocument,
  ProjectBrainDocumentKind,
  ProjectBrainQueryPort,
  ProjectBrainSearchResult,
} from './project-brain-query-port.js';
import { ProjectService } from './project-service.js';

export interface ProjectBrainServiceOptions {
  projectService: ProjectService;
  projectBrainQueryPort: ProjectBrainQueryPort;
  citizenService?: CitizenService;
}

export class ProjectBrainService {
  constructor(private readonly options: ProjectBrainServiceOptions) {}

  listDocuments(projectId: string, kind?: ProjectBrainDocumentKind): ProjectBrainDocument[] {
    this.options.projectService.requireProject(projectId);
    const docs = kind === 'citizen_scaffold'
      ? []
      : this.options.projectBrainQueryPort.listDocuments(projectId, kind);
    if (!kind || kind === 'citizen_scaffold') {
      docs.push(...this.listCitizenScaffoldDocuments(projectId));
    }
    return docs.sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));
  }

  getDocument(projectId: string, kind: ProjectBrainDocumentKind, slug?: string): ProjectBrainDocument | null {
    this.options.projectService.requireProject(projectId);
    if (kind === 'citizen_scaffold') {
      if (!slug) {
        return null;
      }
      return this.getCitizenScaffoldDocument(projectId, slug);
    }
    return this.options.projectBrainQueryPort.getDocument(projectId, kind, slug);
  }

  queryDocuments(projectId: string, query: string, kind?: ProjectBrainDocumentKind): ProjectBrainSearchResult[] {
    this.options.projectService.requireProject(projectId);
    const results = kind === 'citizen_scaffold'
      ? []
      : this.options.projectBrainQueryPort.queryDocuments(projectId, query, kind);
    if (!kind || kind === 'citizen_scaffold') {
      results.push(...this.queryCitizenScaffoldDocuments(projectId, query));
    }
    return results;
  }

  appendDocument(input: ProjectBrainAppendInput): ProjectBrainDocument {
    this.options.projectService.requireProject(input.project_id);
    return this.options.projectBrainQueryPort.appendDocument(input);
  }

  private listCitizenScaffoldDocuments(projectId: string): ProjectBrainDocument[] {
    if (!this.options.citizenService) {
      return [];
    }
    return this.options.citizenService.listCitizens(projectId).map((citizen) => this.getCitizenScaffoldDocument(projectId, citizen.citizen_id)).filter(Boolean) as ProjectBrainDocument[];
  }

  private getCitizenScaffoldDocument(projectId: string, citizenId: string): ProjectBrainDocument | null {
    if (!this.options.citizenService) {
      return null;
    }
    const citizen = this.options.citizenService.requireCitizen(citizenId);
    if (citizen.project_id !== projectId) {
      throw new NotFoundError(`Citizen ${citizenId} is not bound to project ${projectId}`);
    }
    const preview = this.options.citizenService.previewProjection(citizenId);
    const scaffoldFile = preview.files.find((file) => file.path.endsWith('.md'));
    if (!scaffoldFile) {
      return null;
    }
    return {
      project_id: projectId,
      kind: 'citizen_scaffold',
      slug: citizenId,
      title: citizen.display_name,
      path: scaffoldFile.path,
      content: scaffoldFile.content,
      created_at: citizen.created_at,
      updated_at: citizen.updated_at,
      source_task_ids: [],
      metadata: {
        adapter: preview.adapter,
        citizen_id: citizenId,
      },
    };
  }

  private queryCitizenScaffoldDocuments(projectId: string, query: string): ProjectBrainSearchResult[] {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return [];
    }
    return this.listCitizenScaffoldDocuments(projectId)
      .filter((doc) => `${doc.title ?? ''}\n${doc.content}\n${doc.path}`.toLowerCase().includes(needle))
      .map((doc) => ({
        project_id: projectId,
        kind: doc.kind,
        slug: doc.slug,
        title: doc.title,
        path: doc.path,
        snippet: buildSnippet(doc.content, needle),
      }));
  }
}

function buildSnippet(content: string, needle: string) {
  const lower = content.toLowerCase();
  const index = lower.indexOf(needle);
  if (index < 0) {
    return content.slice(0, 160).replace(/\n+/g, ' ').trim();
  }
  const start = Math.max(0, index - 60);
  const end = Math.min(content.length, index + needle.length + 100);
  return content.slice(start, end).replace(/\n+/g, ' ').trim();
}
