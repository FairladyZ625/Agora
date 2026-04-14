import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RuntimeRepoShimWritebackService } from './runtime-repo-shim-writeback-service.js';

const tempDirs: string[] = [];

function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-h8b-writeback-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('RuntimeRepoShimWritebackService', () => {
  it('writes a codex-facing repo shim into the project repo root', async () => {
    const repoPath = makeTempDir();
    const contextMaterializationService = {
      materialize: vi.fn().mockResolvedValue({
        target: 'codex_repo_shim',
        artifact: {
          project_id: 'proj-ctx',
          runtime: 'codex',
          filename: 'AGENTS.md',
          media_type: 'text/markdown',
          content: '# AGENTS.md\n',
        },
      }),
    };
    const service = new RuntimeRepoShimWritebackService({
      projectService: {
        requireProject: () => ({ id: 'proj-ctx' }),
        getProjectRepoPath: () => repoPath,
      },
      contextMaterializationService,
    });

    const result = await service.write({
      project_id: 'proj-ctx',
      target: 'codex_repo_shim',
    });

    expect(result.status).toBe('written');
    expect(result.file_path).toBe(join(repoPath, 'AGENTS.md'));
    expect(existsSync(result.file_path)).toBe(true);
    expect(readFileSync(result.file_path, 'utf8')).toBe('# AGENTS.md\n');
  });

  it('returns unchanged when the repo shim content already matches', async () => {
    const repoPath = makeTempDir();
    const shimPath = join(repoPath, 'CLAUDE.md');
    writeFileSync(shimPath, '# CLAUDE.md\n', 'utf8');
    const contextMaterializationService = {
      materialize: vi.fn().mockResolvedValue({
        target: 'claude_repo_shim',
        artifact: {
          project_id: 'proj-ctx',
          runtime: 'claude_code',
          filename: 'CLAUDE.md',
          media_type: 'text/markdown',
          content: '# CLAUDE.md\n',
        },
      }),
    };
    const service = new RuntimeRepoShimWritebackService({
      projectService: {
        requireProject: () => ({ id: 'proj-ctx' }),
        getProjectRepoPath: () => repoPath,
      },
      contextMaterializationService,
    });

    const result = await service.write({
      project_id: 'proj-ctx',
      target: 'claude_repo_shim',
    });

    expect(result.status).toBe('unchanged');
    expect(readFileSync(shimPath, 'utf8')).toBe('# CLAUDE.md\n');
  });

  it('requires force when a different repo shim already exists', async () => {
    const repoPath = makeTempDir();
    const shimPath = join(repoPath, 'AGENTS.md');
    writeFileSync(shimPath, '# old\n', 'utf8');
    const contextMaterializationService = {
      materialize: vi.fn().mockResolvedValue({
        target: 'codex_repo_shim',
        artifact: {
          project_id: 'proj-ctx',
          runtime: 'codex',
          filename: 'AGENTS.md',
          media_type: 'text/markdown',
          content: '# new\n',
        },
      }),
    };
    const service = new RuntimeRepoShimWritebackService({
      projectService: {
        requireProject: () => ({ id: 'proj-ctx' }),
        getProjectRepoPath: () => repoPath,
      },
      contextMaterializationService,
    });

    await expect(service.write({
      project_id: 'proj-ctx',
      target: 'codex_repo_shim',
    })).rejects.toThrow(/already exists/i);
  });

  it('writes into a missing nested repo root when the parent exists', async () => {
    const parentDir = makeTempDir();
    const repoPath = join(parentDir, 'repo');
    const contextMaterializationService = {
      materialize: vi.fn().mockResolvedValue({
        target: 'codex_repo_shim',
        artifact: {
          project_id: 'proj-ctx',
          runtime: 'codex',
          filename: 'AGENTS.md',
          media_type: 'text/markdown',
          content: '# AGENTS.md\n',
        },
      }),
    };
    const service = new RuntimeRepoShimWritebackService({
      projectService: {
        requireProject: () => ({ id: 'proj-ctx' }),
        getProjectRepoPath: () => repoPath,
      },
      contextMaterializationService,
    });

    const result = await service.write({
      project_id: 'proj-ctx',
      target: 'codex_repo_shim',
      force: true,
    });

    expect(result.status).toBe('written');
    expect(existsSync(join(repoPath, 'AGENTS.md'))).toBe(true);
  });
});
