import { z } from 'zod';
import {
  claudeRepoShimMaterializationResultSchema,
  codexRepoShimMaterializationResultSchema,
} from './context-materialization.js';

export const projectContextMaterializeRequestSchema = z.object({
  target: z.enum(['codex_repo_shim', 'claude_repo_shim']),
});

export const projectContextMaterializeResponseSchema = z.object({
  scope: z.literal('project_context'),
  materialization: z.discriminatedUnion('target', [
    codexRepoShimMaterializationResultSchema,
    claudeRepoShimMaterializationResultSchema,
  ]),
});

export type ProjectContextMaterializeRequestDto = z.infer<typeof projectContextMaterializeRequestSchema>;
export type ProjectContextMaterializeResponseDto = z.infer<typeof projectContextMaterializeResponseSchema>;
