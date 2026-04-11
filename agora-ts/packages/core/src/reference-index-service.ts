import type { ContextInventoryDto, ContextInventoryEntryDto } from '@agora-ts/contracts';
import type { ProjectBrainDocument } from './project-brain-query-port.js';
import type { ProjectBrainService } from './project-brain-service.js';

export interface ReferenceIndexServiceOptions {
  projectBrainService: Pick<ProjectBrainService, 'listDocuments'>;
  clock?: () => Date;
}

export class ReferenceIndexService {
  private readonly now: NonNullable<ReferenceIndexServiceOptions['clock']>;

  constructor(private readonly options: ReferenceIndexServiceOptions) {
    this.now = options.clock ?? (() => new Date());
  }

  buildProjectInventory(projectId: string): ContextInventoryDto {
    const documents = this.options.projectBrainService.listDocuments(projectId);
    const entries = documents
      .map((document) => mapDocumentToInventoryEntry(document))
      .sort(compareInventoryEntries);
    return {
      scope: 'project_brain',
      project_id: projectId,
      generated_at: this.now().toISOString(),
      entries,
    };
  }
}

export function toReferenceKey(document: Pick<ProjectBrainDocument, 'kind' | 'slug'>) {
  return `${document.kind}:${document.slug}`;
}

function mapDocumentToInventoryEntry(document: ProjectBrainDocument): ContextInventoryEntryDto {
  return {
    scope: 'project_brain',
    reference_key: toReferenceKey(document),
    project_id: document.project_id,
    kind: document.kind,
    slug: document.slug,
    title: document.title,
    path: document.path,
    updated_at: document.updated_at,
    recommended: document.kind === 'index' || document.kind === 'timeline',
    metadata: {
      layer: resolveLayer(document.kind),
    },
  };
}

function compareInventoryEntries(left: ContextInventoryEntryDto, right: ContextInventoryEntryDto) {
  const leftRank = rankKind(left.kind);
  const rightRank = rankKind(right.kind);
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }
  return (right.updated_at ?? '').localeCompare(left.updated_at ?? '');
}

function rankKind(kind: string) {
  switch (kind) {
    case 'index':
      return 0;
    case 'timeline':
      return 1;
    case 'decision':
      return 2;
    case 'fact':
      return 3;
    case 'reference':
      return 4;
    case 'open_question':
      return 5;
    case 'recap':
      return 6;
    case 'citizen_scaffold':
      return 7;
    default:
      return 99;
  }
}

function resolveLayer(kind: ProjectBrainDocument['kind']) {
  if (kind === 'index' || kind === 'timeline') {
    return 'project_map';
  }
  if (kind === 'recap') {
    return 'task_recap';
  }
  if (kind === 'citizen_scaffold') {
    return 'participant_scaffold';
  }
  return 'knowledge';
}
