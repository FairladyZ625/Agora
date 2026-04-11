import { z } from 'zod';

export const contextInventoryEntrySchema = z.object({
  scope: z.string().trim().min(1),
  reference_key: z.string().trim().min(1),
  project_id: z.string().min(1).nullable().optional(),
  kind: z.string().trim().min(1),
  slug: z.string().trim().min(1),
  title: z.string().nullable(),
  path: z.string().min(1),
  updated_at: z.string().nullable().optional(),
  recommended: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const contextInventorySchema = z.object({
  scope: z.string().trim().min(1),
  project_id: z.string().min(1).nullable().optional(),
  generated_at: z.string().datetime(),
  entries: z.array(contextInventoryEntrySchema),
});

export const referenceBundleProjectMapSchema = z.object({
  index_reference_key: z.string().nullable(),
  timeline_reference_key: z.string().nullable(),
  inventory_count: z.number().int().nonnegative(),
});

export const referenceBundleSchema = z.object({
  scope: z.string().trim().min(1),
  mode: z.string().trim().min(1),
  project_id: z.string().min(1),
  task_id: z.string().min(1).nullable().optional(),
  project_map: referenceBundleProjectMapSchema,
  inventory: contextInventorySchema,
  references: z.array(contextInventoryEntrySchema),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type ContextInventoryEntryDto = z.infer<typeof contextInventoryEntrySchema>;
export type ContextInventoryDto = z.infer<typeof contextInventorySchema>;
export type ReferenceBundleDto = z.infer<typeof referenceBundleSchema>;
