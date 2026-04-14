import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type {
  ContextMaterializationResultDto,
  ProjectContextWriteRepoShimRequestDto,
  RepoShimWritebackResultDto,
} from '@agora-ts/contracts';

type ProjectServiceLike = {
  requireProject(projectId: string): { id: string };
  getProjectRepoPath(projectId: string): string | null;
};

type ContextMaterializationServiceLike = {
  materialize(request: {
    target: 'codex_repo_shim' | 'claude_repo_shim';
    project_id: string;
  }): Promise<ContextMaterializationResultDto>;
};

export interface RuntimeRepoShimWritebackServiceOptions {
  projectService: ProjectServiceLike;
  contextMaterializationService: ContextMaterializationServiceLike;
}

export class RuntimeRepoShimWritebackService {
  constructor(private readonly options: RuntimeRepoShimWritebackServiceOptions) {}

  async write(input: {
    project_id: string;
    target: ProjectContextWriteRepoShimRequestDto['target'];
    force?: boolean;
  }): Promise<RepoShimWritebackResultDto> {
    this.options.projectService.requireProject(input.project_id);
    const repoPath = this.options.projectService.getProjectRepoPath(input.project_id);
    if (!repoPath) {
      throw new Error(`Project repo path is not configured: ${input.project_id}`);
    }

    const resolvedRepoPath = resolve(repoPath);
    ensureRepoRoot(resolvedRepoPath);

    const materialization = await this.options.contextMaterializationService.materialize({
      target: input.target,
      project_id: input.project_id,
    });

    if (materialization.target !== 'codex_repo_shim' && materialization.target !== 'claude_repo_shim') {
      throw new Error(`Unexpected repo shim materialization target: ${materialization.target}`);
    }

    const filePath = resolve(resolvedRepoPath, materialization.artifact.filename);
    const content = materialization.artifact.content;

    if (existsSync(filePath)) {
      const existing = readFileSync(filePath, 'utf8');
      if (existing === content) {
        return {
          project_id: input.project_id,
          target: materialization.target,
          runtime: materialization.artifact.runtime,
          filename: materialization.artifact.filename,
          repo_path: resolvedRepoPath,
          file_path: filePath,
          status: 'unchanged',
        };
      }
      if (!(input.force ?? false)) {
        throw new Error(`Repo shim already exists with different content: ${filePath}. Pass force=true to overwrite.`);
      }
    }

    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, 'utf8');

    return {
      project_id: input.project_id,
      target: materialization.target,
      runtime: materialization.artifact.runtime,
      filename: materialization.artifact.filename,
      repo_path: resolvedRepoPath,
      file_path: filePath,
      status: 'written',
    };
  }
}

function ensureRepoRoot(repoPath: string) {
  if (!existsSync(repoPath)) {
    mkdirSync(repoPath, { recursive: true });
    return;
  }
  const stats = statSync(repoPath);
  if (!stats.isDirectory()) {
    throw new Error(`Project repo path is not a directory: ${repoPath}`);
  }
}
