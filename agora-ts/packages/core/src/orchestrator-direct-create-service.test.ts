import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAgoraDatabase, runMigrations } from '@agora-ts/db';
import { createProjectServiceFromDb, createTaskServiceFromDb } from '@agora-ts/testing';
import { OrchestratorDirectCreateService } from './orchestrator-direct-create-service.js';

const tempDirs: string[] = [];

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-orchestrator-direct-create-'));
  tempDirs.push(dir);
  return join(dir, 'agora.db');
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('orchestrator direct create service', () => {
  it('creates a task immediately after conversational oral confirmation', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const taskService = createTaskServiceFromDb(db);
    const service = new OrchestratorDirectCreateService({ taskService });

    const created = service.createFromConversationConfirmation({
      orchestrator_ref: 'workspace-orchestrator',
      confirmation: {
        kind: 'conversation_confirmation',
        confirmation_mode: 'oral',
        confirmed_by: 'archon',
        confirmed_at: '2026-04-10T11:05:00.000Z',
        source: 'conversation',
        source_ref: 'discord:thread-123',
      },
      create: {
        title: 'Implement direct create foundation',
        type: 'coding',
        creator: 'workspace-orchestrator',
        description: 'Create the task immediately after oral confirmation.',
        priority: 'high',
        control: {
          mode: 'normal',
        },
      },
    });

    expect(created.title).toBe('Implement direct create foundation');
    expect(created.control).toMatchObject({
      mode: 'normal',
      orchestrator_intake: {
        kind: 'direct_create',
        source: 'conversation',
        confirmation_mode: 'oral',
        orchestrator_ref: 'workspace-orchestrator',
        confirmed_by: 'archon',
        confirmed_at: '2026-04-10T11:05:00.000Z',
        source_ref: 'discord:thread-123',
      },
    });
    db.close();
  });

  it('preserves other task control metadata when direct create adds intake metadata', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const projectService = createProjectServiceFromDb(db);
    projectService.createProject({
      id: 'proj-nomos',
      name: 'Nomos Project',
    });
    const taskService = createTaskServiceFromDb(db);
    const service = new OrchestratorDirectCreateService({ taskService });

    const created = service.createFromConversationConfirmation({
      orchestrator_ref: 'workspace-orchestrator',
      confirmation: {
        kind: 'conversation_confirmation',
        confirmation_mode: 'oral',
        confirmed_by: 'archon',
        confirmed_at: '2026-04-10T11:06:00.000Z',
        source: 'conversation',
      },
      create: {
        title: 'Refine project nomos',
        type: 'document',
        creator: 'workspace-orchestrator',
        description: '',
        priority: 'normal',
        project_id: 'proj-nomos',
        control: {
          mode: 'normal',
          nomos_authoring: {
            kind: 'project_nomos',
            project_id: 'proj-nomos',
            auto_refine_on_done: true,
          },
        },
      },
    });

    expect(created.control).toMatchObject({
      nomos_authoring: {
        kind: 'project_nomos',
        project_id: 'proj-nomos',
      },
      orchestrator_intake: {
        kind: 'direct_create',
      },
    });
    db.close();
  });
});
