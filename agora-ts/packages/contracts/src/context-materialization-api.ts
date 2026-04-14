import { z } from 'zod';
import {
  claudeRepoShimMaterializationResultSchema,
  codexRepoShimMaterializationResultSchema,
} from './context-materialization.js';

export const projectContextMaterializeRequestSchema = z.object({
  target: z.enum(['codex_repo_shim', 'claude_repo_shim']),
});

export const projectContextWriteRepoShimRequestSchema = z.object({
  target: z.enum(['codex_repo_shim', 'claude_repo_shim']),
  force: z.boolean().optional(),
});

export const projectContextMaterializeResponseSchema = z.object({
  scope: z.literal('project_context'),
  materialization: z.discriminatedUnion('target', [
    codexRepoShimMaterializationResultSchema,
    claudeRepoShimMaterializationResultSchema,
  ]),
});

export const repoShimWritebackResultSchema = z.object({
  project_id: z.string().trim().min(1),
  target: z.enum(['codex_repo_shim', 'claude_repo_shim']),
  runtime: z.enum(['codex', 'claude_code']),
  filename: z.enum(['AGENTS.md', 'CLAUDE.md']),
  repo_path: z.string().trim().min(1),
  file_path: z.string().trim().min(1),
  status: z.enum(['written', 'unchanged']),
});

export const projectContextWriteRepoShimResponseSchema = z.object({
  scope: z.literal('project_context'),
  writeback: repoShimWritebackResultSchema,
});

export type ProjectContextMaterializeRequestDto = z.infer<typeof projectContextMaterializeRequestSchema>;
export type ProjectContextMaterializeResponseDto = z.infer<typeof projectContextMaterializeResponseSchema>;
export type ProjectContextWriteRepoShimRequestDto = z.infer<typeof projectContextWriteRepoShimRequestSchema>;
export type RepoShimWritebackResultDto = z.infer<typeof repoShimWritebackResultSchema>;
export type ProjectContextWriteRepoShimResponseDto = z.infer<typeof projectContextWriteRepoShimResponseSchema>;
