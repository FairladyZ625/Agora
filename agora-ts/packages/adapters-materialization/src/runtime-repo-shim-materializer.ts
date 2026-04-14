import {
  renderRepoAgentsShim,
  renderRepoClaudeShim,
  resolveRepoShimNomosProjectProfile,
} from '@agora-ts/config';
import type {
  ContextMaterializationRequestDto,
  ContextMaterializationResultDto,
  ContextMaterializationTargetDto,
} from '@agora-ts/contracts';
import type { ContextMaterializationPort } from '@agora-ts/core';

type ProjectServiceLike = {
  requireProject(projectId: string): {
    id: string;
    metadata?: Record<string, unknown> | null;
  };
};

export interface RuntimeRepoShimMaterializerOptions {
  projectService: ProjectServiceLike;
  userAgoraDir?: string;
}

export class RuntimeRepoShimMaterializer implements ContextMaterializationPort {
  constructor(private readonly options: RuntimeRepoShimMaterializerOptions) {}

  supports(target: ContextMaterializationTargetDto) {
    return target === 'codex_repo_shim' || target === 'claude_repo_shim';
  }

  materializeSync(request: ContextMaterializationRequestDto): ContextMaterializationResultDto {
    if (request.target !== 'codex_repo_shim' && request.target !== 'claude_repo_shim') {
      throw new Error(`Unsupported materialization target: ${request.target}`);
    }
    const project = this.options.projectService.requireProject(request.project_id);
    const profile = resolveRepoShimNomosProjectProfile(project.id, project.metadata ?? null, {
      ...(this.options.userAgoraDir ? { userAgoraDir: this.options.userAgoraDir } : {}),
    });
    if (request.target === 'codex_repo_shim') {
      return {
        target: 'codex_repo_shim',
        artifact: {
          project_id: project.id,
          runtime: 'codex',
          filename: 'AGENTS.md',
          media_type: 'text/markdown',
          content: renderRepoAgentsShim({ profile }),
        },
      };
    }
    return {
      target: 'claude_repo_shim',
      artifact: {
        project_id: project.id,
        runtime: 'claude_code',
        filename: 'CLAUDE.md',
        media_type: 'text/markdown',
        content: renderRepoClaudeShim({ profile }),
      },
    };
  }

  async materialize(request: ContextMaterializationRequestDto): Promise<ContextMaterializationResultDto> {
    return this.materializeSync(request);
  }
}
