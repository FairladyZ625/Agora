import { z } from 'zod';
import {
  projectContextBriefingArtifactSchema,
  projectContextBriefingRequestSchema,
} from './context-briefing-api.js';

export const contextMaterializationTargetSchema = z.enum([
  'project_context_briefing',
  'codex_repo_shim',
  'claude_repo_shim',
]);

export const projectContextBriefingMaterializationRequestSchema = projectContextBriefingRequestSchema.extend({
  target: z.literal('project_context_briefing'),
  project_id: z.string().trim().min(1),
});

export const contextMaterializationRequestSchema = z.discriminatedUnion('target', [
  projectContextBriefingMaterializationRequestSchema,
  z.object({
    target: z.literal('codex_repo_shim'),
    project_id: z.string().trim().min(1),
  }),
  z.object({
    target: z.literal('claude_repo_shim'),
    project_id: z.string().trim().min(1),
  }),
]);

export const repoShimArtifactSchema = z.object({
  project_id: z.string().trim().min(1),
  runtime: z.enum(['codex', 'claude_code']),
  filename: z.enum(['AGENTS.md', 'CLAUDE.md']),
  media_type: z.literal('text/markdown'),
  content: z.string(),
});

export const projectContextBriefingMaterializationResultSchema = z.object({
  target: z.literal('project_context_briefing'),
  artifact: projectContextBriefingArtifactSchema,
});

export const codexRepoShimMaterializationResultSchema = z.object({
  target: z.literal('codex_repo_shim'),
  artifact: repoShimArtifactSchema.extend({
    runtime: z.literal('codex'),
    filename: z.literal('AGENTS.md'),
  }),
});

export const claudeRepoShimMaterializationResultSchema = z.object({
  target: z.literal('claude_repo_shim'),
  artifact: repoShimArtifactSchema.extend({
    runtime: z.literal('claude_code'),
    filename: z.literal('CLAUDE.md'),
  }),
});

export const contextMaterializationResultSchema = z.discriminatedUnion('target', [
  projectContextBriefingMaterializationResultSchema,
  codexRepoShimMaterializationResultSchema,
  claudeRepoShimMaterializationResultSchema,
]);

export type ContextMaterializationTargetDto = z.infer<typeof contextMaterializationTargetSchema>;
export type ProjectContextBriefingMaterializationRequestDto = z.infer<typeof projectContextBriefingMaterializationRequestSchema>;
export type ContextMaterializationRequestDto = z.infer<typeof contextMaterializationRequestSchema>;
export type ProjectContextBriefingMaterializationResultDto = z.infer<typeof projectContextBriefingMaterializationResultSchema>;
export type RepoShimArtifactDto = z.infer<typeof repoShimArtifactSchema>;
export type CodexRepoShimMaterializationResultDto = z.infer<typeof codexRepoShimMaterializationResultSchema>;
export type ClaudeRepoShimMaterializationResultDto = z.infer<typeof claudeRepoShimMaterializationResultSchema>;
export type ContextMaterializationResultDto = z.infer<typeof contextMaterializationResultSchema>;
