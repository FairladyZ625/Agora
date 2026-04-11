import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildBuiltInAgoraNomosProjectProfile, renderNomosProjectProfileToml } from '@agora-ts/config';
import { RuntimeRepoShimMaterializer } from './runtime-repo-shim-materializer.js';

const tempDirs: string[] = [];

function makeAgoraHomeDir() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-h8b-materializer-'));
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

describe('RuntimeRepoShimMaterializer', () => {
  it('materializes a Codex-facing repo shim from the active Nomos profile', () => {
    const agoraHomeDir = makeAgoraHomeDir();
    const projectId = 'proj-shim';
    const projectRoot = join(agoraHomeDir, 'projects', projectId);
    mkdirSync(projectRoot, { recursive: true });
    const profile = buildBuiltInAgoraNomosProjectProfile(projectId, { userAgoraDir: agoraHomeDir });
    writeFileSync(join(projectRoot, 'profile.toml'), renderNomosProjectProfileToml(profile), 'utf8');

    const materializer = new RuntimeRepoShimMaterializer({
      projectService: {
        requireProject: () => ({ id: projectId, metadata: null }),
      },
      userAgoraDir: agoraHomeDir,
    });

    const result = materializer.materializeSync({
      target: 'codex_repo_shim',
      project_id: projectId,
    });

    expect(result.target).toBe('codex_repo_shim');
    expect(result.artifact.filename).toBe('AGENTS.md');
    expect(result.artifact.runtime).toBe('codex');
    expect(result.artifact.content).toContain('# AGENTS.md');
    expect(result.artifact.content).toContain(profile.project.state_root);
  });

  it('materializes a Claude-facing repo shim from the active Nomos profile', async () => {
    const agoraHomeDir = makeAgoraHomeDir();
    const projectId = 'proj-claude';
    const projectRoot = join(agoraHomeDir, 'projects', projectId);
    mkdirSync(projectRoot, { recursive: true });
    const profile = buildBuiltInAgoraNomosProjectProfile(projectId, { userAgoraDir: agoraHomeDir });
    writeFileSync(join(projectRoot, 'profile.toml'), renderNomosProjectProfileToml(profile), 'utf8');

    const materializer = new RuntimeRepoShimMaterializer({
      projectService: {
        requireProject: () => ({ id: projectId, metadata: null }),
      },
      userAgoraDir: agoraHomeDir,
    });

    const result = await materializer.materialize({
      target: 'claude_repo_shim',
      project_id: projectId,
    });

    expect(result.target).toBe('claude_repo_shim');
    expect(result.artifact.filename).toBe('CLAUDE.md');
    expect(result.artifact.runtime).toBe('claude_code');
    expect(result.artifact.content).toContain('# CLAUDE.md');
    expect(result.artifact.content).toContain(profile.project.state_root);
  });
});
