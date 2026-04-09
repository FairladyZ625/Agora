import { z } from 'zod';

export const contextSourceScopeSchema = z.enum(['workspace', 'project']);
export const contextSourceKindSchema = z.enum(['local_path', 'docs_repo', 'obsidian_rest']);
export const contextSourceAccessSchema = z.enum(['read_only']);

export const contextSourceBindingSchema = z.object({
  source_id: z.string().trim().min(1),
  scope: contextSourceScopeSchema,
  project_id: z.string().min(1).nullable().optional(),
  kind: contextSourceKindSchema,
  label: z.string().trim().min(1),
  location: z.string().trim().min(1),
  access: contextSourceAccessSchema.default('read_only'),
  enabled: z.boolean().default(true),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type ContextSourceBindingDto = z.infer<typeof contextSourceBindingSchema>;
