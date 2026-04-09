import type { ContextSourceBindingDto, ProjectRecord } from '@agora-ts/contracts';
import { contextSourceBindingSchema } from '@agora-ts/contracts';
import type { ProjectService } from './project-service.js';

export interface ContextSourceBindingServiceOptions {
  projectService: Pick<ProjectService, 'requireProject' | 'updateProjectMetadata'>;
}

export class ContextSourceBindingService {
  constructor(private readonly options: ContextSourceBindingServiceOptions) {}

  listProjectBindings(projectId: string): ContextSourceBindingDto[] {
    const project = this.options.projectService.requireProject(projectId);
    return extractProjectBindings(project);
  }

  replaceProjectBindings(projectId: string, bindings: ContextSourceBindingDto[]): ProjectRecord {
    const project = this.options.projectService.requireProject(projectId);
    const normalized = bindings.map((binding) => normalizeProjectBinding(projectId, binding));
    const nextMetadata = mergeProjectBindings(project.metadata, normalized);
    return this.options.projectService.updateProjectMetadata(projectId, nextMetadata);
  }
}

function extractProjectBindings(project: ProjectRecord): ContextSourceBindingDto[] {
  const root = asRecord(project.metadata);
  const agora = asRecord(root?.agora);
  const contextHarness = asRecord(agora?.context_harness);
  const rawBindings = Array.isArray(contextHarness?.project_context_sources)
    ? contextHarness.project_context_sources
    : [];
  return rawBindings
    .map((item) => contextSourceBindingSchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => result.data)
    .filter((binding) => binding.scope === 'project' && (binding.project_id === undefined || binding.project_id === project.id))
    .map((binding) => ({
      ...binding,
      project_id: binding.project_id ?? project.id,
    }));
}

function normalizeProjectBinding(projectId: string, binding: ContextSourceBindingDto): ContextSourceBindingDto {
  const parsed = contextSourceBindingSchema.parse({
    ...binding,
    scope: 'project',
    project_id: projectId,
  });
  return {
    ...parsed,
    project_id: projectId,
  };
}

function mergeProjectBindings(
  metadata: Record<string, unknown> | null | undefined,
  bindings: ContextSourceBindingDto[],
): Record<string, unknown> {
  const root = asRecord(metadata) ?? {};
  const agora = asRecord(root.agora) ?? {};
  const contextHarness = asRecord(agora.context_harness) ?? {};
  return {
    ...root,
    agora: {
      ...agora,
      context_harness: {
        ...contextHarness,
        project_context_sources: bindings,
      },
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}
