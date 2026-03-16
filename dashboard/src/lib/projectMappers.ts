import type { ApiProjectDto, ApiProjectWorkbenchDto } from '@/types/api';
import type { ProjectCitizen, ProjectIndexDoc, ProjectKnowledgeDoc, ProjectRecap, ProjectSummary, ProjectWorkbench } from '@/types/project';

export function mapProjectDto(dto: ApiProjectDto): ProjectSummary {
  return {
    id: dto.id,
    name: dto.name,
    summary: dto.summary,
    owner: dto.owner,
    status: dto.status,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  };
}

function mapProjectIndexDoc(dto: ApiProjectWorkbenchDto['index']): ProjectIndexDoc | null {
  if (!dto) {
    return null;
  }
  return {
    kind: 'index',
    slug: 'index',
    title: dto.title,
    path: dto.path,
    content: dto.content,
    updatedAt: dto.updated_at,
  };
}

function mapProjectRecap(dto: ApiProjectWorkbenchDto['recaps'][number]): ProjectRecap {
  return {
    taskId: dto.task_id,
    title: dto.title,
    summaryPath: dto.path,
    updatedAt: dto.updated_at,
  };
}

function mapProjectKnowledge(dto: ApiProjectWorkbenchDto['knowledge'][number]): ProjectKnowledgeDoc {
  return {
    kind: dto.kind,
    slug: dto.slug,
    title: dto.title,
    path: dto.path,
    content: dto.content,
    sourceTaskIds: dto.source_task_ids,
    updatedAt: dto.updated_at,
  };
}

function mapProjectCitizen(dto: ApiProjectWorkbenchDto['citizens'][number]): ProjectCitizen {
  return {
    citizenId: dto.citizen_id,
    roleId: dto.role_id,
    displayName: dto.display_name,
    status: dto.status,
  };
}

export function mapProjectWorkbenchDto(dto: ApiProjectWorkbenchDto): ProjectWorkbench {
  return {
    project: mapProjectDto(dto.project),
    index: mapProjectIndexDoc(dto.index),
    recaps: dto.recaps.map(mapProjectRecap),
    knowledge: dto.knowledge.map(mapProjectKnowledge),
    citizens: dto.citizens.map(mapProjectCitizen),
  };
}
