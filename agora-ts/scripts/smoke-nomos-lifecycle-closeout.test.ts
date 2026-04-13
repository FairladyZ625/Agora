import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { parseAsync, createCliProgram, ensureBundledAgoraAssetsInstalled } = vi.hoisted(() => {
  const parseAsync = vi.fn();
  const createCliProgram = vi.fn(() => ({ parseAsync }));
  const ensureBundledAgoraAssetsInstalled = vi.fn();
  return { parseAsync, createCliProgram, ensureBundledAgoraAssetsInstalled };
});

vi.mock('../apps/cli/src/index.js', () => ({
  createCliProgram,
}));

vi.mock('../packages/config/src/runtime-assets.js', () => ({
  ensureBundledAgoraAssetsInstalled,
}));

import {
  BufferStream,
  parseLineValue,
  requireLineValue,
  runCli,
  runSmokeNomosLifecycleCloseoutMain,
} from './smoke-nomos-lifecycle-closeout';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  vi.restoreAllMocks();
});

describe('smoke-nomos-lifecycle-closeout', () => {
  beforeEach(() => {
    parseAsync.mockReset();
    createCliProgram.mockClear();
    ensureBundledAgoraAssetsInstalled.mockReset();
  });

  it('buffers output chunks in insertion order', () => {
    const stream = new BufferStream();
    stream.write('hello');
    stream.write(' world');
    expect(stream.toString()).toBe('hello world');
  });

  it('parses required line prefixes', () => {
    expect(parseLineValue('Project State: /tmp/state\n', 'Project State: ')).toBe('/tmp/state');
    expect(() => requireLineValue('missing\n', 'Project State: ')).toThrow('failed to parse "Project State: "');
  });

  it('runs the CLI with injected stdout and stderr streams', async () => {
    parseAsync.mockResolvedValue(undefined);
    process.exitCode = undefined;

    const result = await runCli(['projects', 'list'], {
      configPath: '/tmp/agora.json',
      dbPath: '/tmp/agora.db',
    });

    expect(createCliProgram).toHaveBeenCalledWith(expect.objectContaining({
      configPath: '/tmp/agora.json',
      dbPath: '/tmp/agora.db',
      stdout: expect.any(BufferStream),
      stderr: expect.any(BufferStream),
    }));
    expect(parseAsync).toHaveBeenCalledWith(['projects', 'list'], { from: 'user' });
    expect(result.exitCode).toBe(0);
  });

  it('surfaces CLI failures from process.exitCode', async () => {
    parseAsync.mockImplementation(async () => {
      process.exitCode = 2;
    });

    await expect(runCli(['projects', 'delete', 'proj'], {
      configPath: '/tmp/agora.json',
      dbPath: '/tmp/agora.db',
    })).rejects.toThrow('cli command failed: projects delete proj');
  });

  it('runs the focused lifecycle closeout smoke and prints the summary payload', async () => {
    const projectStateRoot = mkdtempSync(join(tmpdir(), 'agora-nomos-lifecycle-state-'));
    tempDirs.push(projectStateRoot);
    const harvestDraftPath = join(projectStateRoot, 'tasks', 'OC-NOMOS-LIFECYCLE-SMOKE', '07-outputs', 'project-harvest-draft.md');
    const controllerContextPath = join(projectStateRoot, 'tasks', 'OC-NOMOS-LIFECYCLE-SMOKE', '04-context', 'project-brain-context-controller.md');
    const craftsmanContextPath = join(projectStateRoot, 'tasks', 'OC-NOMOS-LIFECYCLE-SMOKE', '04-context', 'project-brain-context-craftsman.md');
    const citizenContextPath = join(projectStateRoot, 'tasks', 'OC-NOMOS-LIFECYCLE-SMOKE', '04-context', 'project-brain-context-citizen.md');

    createCliProgram.mockImplementation(({ stdout, stderr }) => ({
      parseAsync: vi.fn(async (args: string[]) => {
        if (args[0] === 'projects' && args[1] === 'create') {
          stdout.write(`Project State: ${projectStateRoot}\n`);
          stdout.write('Bootstrap Task: BOOTSTRAP-1\n');
          return;
        }
        if (args[0] === 'cancel') {
          stdout.write('任务 BOOTSTRAP-1 已取消\n');
          return;
        }
        if (args[0] === 'create') {
          mkdirSync(join(projectStateRoot, 'tasks', 'OC-NOMOS-LIFECYCLE-SMOKE', '04-context'), { recursive: true });
          mkdirSync(join(projectStateRoot, 'tasks', 'OC-NOMOS-LIFECYCLE-SMOKE', '07-outputs'), { recursive: true });
          writeFileSync(controllerContextPath, '# controller\n', 'utf8');
          writeFileSync(craftsmanContextPath, '# craftsman\n', 'utf8');
          writeFileSync(citizenContextPath, '# citizen\n', 'utf8');
          writeFileSync(harvestDraftPath, '# harvest\n', 'utf8');
          stdout.write('任务已创建: OC-NOMOS-LIFECYCLE-SMOKE\n');
          return;
        }
        if (args[0] === 'advance') {
          stdout.write('任务 OC-NOMOS-LIFECYCLE-SMOKE 已完成\n');
          return;
        }
        if (args[0] === 'archive' && args[1] === 'jobs' && args[2] === 'list') {
          stdout.write(JSON.stringify([{
            id: 7,
            status: 'pending',
            payload: {
              closeout_review: {
                harvest_draft_path: harvestDraftPath,
              },
            },
          }]));
          return;
        }
        if (args[0] === 'archive' && args[1] === 'jobs' && args[2] === 'complete') {
          rmSync(join(projectStateRoot, 'tasks', 'OC-NOMOS-LIFECYCLE-SMOKE'), { recursive: true, force: true });
          stdout.write('archive job 已完成: 7 -> synced\n');
          return;
        }
        if (args[0] === 'archive' && args[1] === 'jobs' && args[2] === 'show') {
          stdout.write(JSON.stringify({
            id: 7,
            status: 'synced',
            payload: {
              closeout_review: {
                harvest_draft_path: harvestDraftPath,
              },
            },
          }));
          return;
        }
        if (args[0] === 'projects' && args[1] === 'archive') {
          stdout.write('Project 已归档: proj-nomos-lifecycle-smoke\n');
          return;
        }
        if (args[0] === 'projects' && args[1] === 'delete') {
          stderr.write('tasks are still bound');
          process.exitCode = 2;
        }
      }),
    }));

    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const originalArgv = process.argv;
    process.argv = ['node', '/tmp/smoke-nomos-lifecycle-closeout.ts'];

    try {
      await runSmokeNomosLifecycleCloseoutMain();
    } finally {
      process.argv = originalArgv;
    }

    expect(ensureBundledAgoraAssetsInstalled).toHaveBeenCalled();
    expect(stdoutWrite).toHaveBeenCalledWith(expect.stringContaining('"archive_job_status": "synced"'));
    expect(stdoutWrite).toHaveBeenCalledWith(expect.stringContaining('"harvest_draft_present": true'));
    expect(stdoutWrite).toHaveBeenCalledWith(expect.stringContaining('"workspace_destroyed_after_sync": true'));
    expect(stdoutWrite).toHaveBeenCalledWith(expect.stringContaining('"delete_blocked": true'));
    stdoutWrite.mockRestore();
  });
});
