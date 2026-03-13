import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAgoraDatabase, runMigrations } from '../database.js';
import { TaskRepository } from './task.repository.js';
import { ArchiveJobRepository } from './archive-job.repository.js';

const tempPaths: string[] = [];

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-archive-job-repository-'));
  tempPaths.push(dir);
  return join(dir, 'tasks.db');
}

afterEach(() => {
  vi.restoreAllMocks();
  while (tempPaths.length > 0) {
    const dir = tempPaths.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

function seedTask(repository: TaskRepository) {
  repository.insertTask({
    id: 'OC-ARCHIVE-1',
    title: 'archive guard',
    description: '',
    type: 'document',
    priority: 'normal',
    creator: 'archon',
    team: { members: [] },
    workflow: { stages: [] },
  });
}

describe('archive job repository', () => {
  it('throws a descriptive error when the inserted archive job cannot be reloaded', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    seedTask(new TaskRepository(db));
    const repository = new ArchiveJobRepository(db);
    const getArchiveJob = vi.spyOn(repository, 'getArchiveJob');

    getArchiveJob.mockReturnValueOnce(null);

    expect(() => repository.insertArchiveJob({
      task_id: 'OC-ARCHIVE-1',
      status: 'pending',
      target_path: '/tmp/archive',
      payload: {},
      writer_agent: 'writer-agent',
    })).toThrow(/failed to retrieve archive job \d+ after insert/i);
  });

  it('throws a descriptive error when the retried archive job cannot be reloaded', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    seedTask(new TaskRepository(db));
    const repository = new ArchiveJobRepository(db);
    const created = repository.insertArchiveJob({
      task_id: 'OC-ARCHIVE-1',
      status: 'failed',
      target_path: '/tmp/archive',
      payload: {},
      writer_agent: 'writer-agent',
    });
    const getArchiveJob = vi.spyOn(repository, 'getArchiveJob');

    getArchiveJob.mockReturnValueOnce(created);
    getArchiveJob.mockReturnValueOnce(null);

    expect(() => repository.retryArchiveJob(created.id)).toThrow(/failed to retrieve archive job \d+ after retry/i);
  });

  it('throws a descriptive error when the updated archive job cannot be reloaded', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    seedTask(new TaskRepository(db));
    const repository = new ArchiveJobRepository(db);
    const created = repository.insertArchiveJob({
      task_id: 'OC-ARCHIVE-1',
      status: 'pending',
      target_path: '/tmp/archive',
      payload: {},
      writer_agent: 'writer-agent',
    });
    const getArchiveJob = vi.spyOn(repository, 'getArchiveJob');

    getArchiveJob.mockReturnValueOnce(created);
    getArchiveJob.mockReturnValueOnce(null);

    expect(() => repository.updateArchiveJob(created.id, {
      status: 'failed',
      error_message: 'boom',
    })).toThrow(/failed to retrieve archive job \d+ after update/i);
  });
});
