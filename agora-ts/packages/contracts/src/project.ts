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
  id: z.string().min(1),
  name: z.string().min(1),
  summary: z.string().default(''),
  owner: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();
export type CreateProjectRequestDto = z.infer<typeof createProjectRequestSchema>;

export const listProjectsResponseSchema = z.object({
  projects: z.array(projectSchema),
});
export type ListProjectsResponseDto = z.infer<typeof listProjectsResponseSchema>;
