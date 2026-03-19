import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgoraDatabase, runMigrations } from '../database.js';
import { ProjectRepository } from './project.repository.js';
import { ProjectBrainIndexJobRepository } from './project-brain-index-job.repository.js';

const tempPaths: string[] = [];

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-project-brain-index-job-'));
  tempPaths.push(dir);
  return join(dir, 'runtime.db');
}

afterEach(() => {
  while (tempPaths.length > 0) {
    const dir = tempPaths.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

function seedProject(repository: ProjectRepository) {
  repository.insertProject({
    id: 'proj-brain',
    name: 'Project Brain',
  });
}

describe('project brain index job repository', () => {
  it('enqueues a pending job and reloads it by document identity', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    seedProject(new ProjectRepository(db));
    const repository = new ProjectBrainIndexJobRepository(db);

    const job = repository.enqueue({
      project_id: 'proj-brain',
      document_kind: 'fact',
      document_slug: 'runtime-boundary',
      reason: 'knowledge_upsert',
    });

    expect(job).toMatchObject({
      project_id: 'proj-brain',
      document_kind: 'fact',
      document_slug: 'runtime-boundary',
      reason: 'knowledge_upsert',
      status: 'pending',
      attempt_count: 0,
      last_error: null,
    });
    expect(repository.getByDocument('proj-brain', 'fact', 'runtime-boundary')?.id).toBe(job.id);
  });

  it('deduplicates by document identity and revives failed jobs back to pending', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    seedProject(new ProjectRepository(db));
    const repository = new ProjectBrainIndexJobRepository(db);

    const created = repository.enqueue({
      project_id: 'proj-brain',
      document_kind: 'fact',
      document_slug: 'runtime-boundary',
      reason: 'knowledge_upsert',
    });
    repository.claimNextPending();
    repository.markFailed(created.id, 'embedding failed');

    const revived = repository.enqueue({
      project_id: 'proj-brain',
      document_kind: 'fact',
      document_slug: 'runtime-boundary',
      reason: 'brain_append',
    });

    expect(revived.id).toBe(created.id);
    expect(revived.status).toBe('pending');
    expect(revived.reason).toBe('brain_append');
    expect(revived.last_error).toBeNull();
    expect(repository.listJobs({ project_id: 'proj-brain' })).toHaveLength(1);
  });

  it('claims pending jobs in updated order and marks them running', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    seedProject(new ProjectRepository(db));
    const repository = new ProjectBrainIndexJobRepository(db);

    repository.enqueue({
      project_id: 'proj-brain',
      document_kind: 'fact',
      document_slug: 'a-doc',
      reason: 'knowledge_upsert',
    });
    repository.enqueue({
      project_id: 'proj-brain',
      document_kind: 'fact',
      document_slug: 'b-doc',
      reason: 'knowledge_upsert',
    });

    const claimed = repository.claimNextPending();

    expect(claimed).toMatchObject({
      document_slug: 'a-doc',
      status: 'running',
      attempt_count: 1,
    });
  });

  it('marks running jobs succeeded and preserves completion timestamps', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    seedProject(new ProjectRepository(db));
    const repository = new ProjectBrainIndexJobRepository(db);

    const created = repository.enqueue({
      project_id: 'proj-brain',
      document_kind: 'fact',
      document_slug: 'runtime-boundary',
      reason: 'knowledge_upsert',
    });
    repository.claimNextPending();

    const completed = repository.markSucceeded(created.id);

    expect(completed.status).toBe('succeeded');
    expect(completed.completed_at).not.toBeNull();
    expect(completed.last_error).toBeNull();
  });

  it('marks running jobs failed and records the last error', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    seedProject(new ProjectRepository(db));
    const repository = new ProjectBrainIndexJobRepository(db);

    const created = repository.enqueue({
      project_id: 'proj-brain',
      document_kind: 'fact',
      document_slug: 'runtime-boundary',
      reason: 'knowledge_upsert',
    });
    repository.claimNextPending();

    const failed = repository.markFailed(created.id, 'qdrant unavailable');

    expect(failed.status).toBe('failed');
    expect(failed.last_error).toBe('qdrant unavailable');
    expect(failed.completed_at).not.toBeNull();
  });
});
