import { z } from 'zod';

const projectStatusSchema = z.enum(['active', 'archived']);
export type ProjectStatusDto = z.infer<typeof projectStatusSchema>;

export const projectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  summary: z.string().nullable(),
  status: projectStatusSchema,
  owner: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ProjectDto = z.infer<typeof projectSchema>;

export const createProjectRequestSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  summary: z.string().default(''),
  owner: z.string().min(1).optional(),
  repo_path: z.string().min(1).optional(),
  initialize_repo: z.boolean().optional(),
  nomos_id: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();
export type CreateProjectRequestDto = z.infer<typeof createProjectRequestSchema>;

export const listProjectsResponseSchema = z.object({
  projects: z.array(projectSchema),
});
export type ListProjectsResponseDto = z.infer<typeof listProjectsResponseSchema>;

export const projectKnowledgeKindSchema = z.enum(['decision', 'fact', 'open_question', 'reference']);
export type ProjectKnowledgeKindDto = z.infer<typeof projectKnowledgeKindSchema>;

export const projectBrainIndexSchema = z.object({
  project_id: z.string().min(1),
  kind: z.literal('index'),
  slug: z.literal('index'),
  title: z.string().nullable(),
  path: z.string().min(1),
  content: z.string(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  source_task_ids: z.array(z.string()),
});
export type ProjectBrainIndexDto = z.infer<typeof projectBrainIndexSchema>;

export const projectBrainTimelineSchema = z.object({
  project_id: z.string().min(1),
  kind: z.literal('timeline'),
  slug: z.literal('timeline'),
  title: z.string().nullable(),
  path: z.string().min(1),
  content: z.string(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  source_task_ids: z.array(z.string()),
});
export type ProjectBrainTimelineDto = z.infer<typeof projectBrainTimelineSchema>;

export const projectRecapSummarySchema = z.object({
  project_id: z.string().min(1),
  task_id: z.string().min(1),
  path: z.string().min(1),
  title: z.string().nullable(),
  content: z.string(),
  updated_at: z.string().nullable(),
});
export type ProjectRecapSummaryDto = z.infer<typeof projectRecapSummarySchema>;

export const projectKnowledgeDocumentSchema = z.object({
  project_id: z.string().min(1),
  kind: projectKnowledgeKindSchema,
  slug: z.string().min(1),
  title: z.string().nullable(),
  path: z.string().min(1),
  content: z.string(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  source_task_ids: z.array(z.string()),
});
export type ProjectKnowledgeDocumentDto = z.infer<typeof projectKnowledgeDocumentSchema>;

export const projectWorkbenchResponseSchema = z.object({
  project: projectSchema,
  index: projectBrainIndexSchema.nullable(),
  timeline: projectBrainTimelineSchema.nullable(),
  recaps: z.array(projectRecapSummarySchema),
  knowledge: z.array(projectKnowledgeDocumentSchema),
  citizens: z.array(z.object({
    citizen_id: z.string().min(1),
    project_id: z.string().min(1),
    role_id: z.string().min(1),
    display_name: z.string().min(1),
    persona: z.string().nullable(),
    boundaries: z.array(z.string()),
    skills_ref: z.array(z.string()),
    channel_policies: z.record(z.string(), z.unknown()),
    brain_scaffold_mode: z.enum(['role_default', 'custom']),
    runtime_projection: z.object({
      adapter: z.string().min(1),
      auto_provision: z.boolean(),
      metadata: z.record(z.string(), z.unknown()),
    }),
    status: z.enum(['active', 'archived']),
    created_at: z.string(),
    updated_at: z.string(),
  })),
});
export type ProjectWorkbenchResponseDto = z.infer<typeof projectWorkbenchResponseSchema>;
