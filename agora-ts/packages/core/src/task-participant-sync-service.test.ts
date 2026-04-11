import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import type { TeamDto, WorkflowDto } from '@agora-ts/contracts';
import { TaskContextBindingRepository, TaskRepository, createAgoraDatabase, runMigrations } from '@agora-ts/db';
import { createTaskParticipationServiceFromDb } from '@agora-ts/testing';
import { StubIMProvisioningPort } from './im-ports.js';
import { StageRosterService } from './stage-roster-service.js';
import { TaskParticipantSyncService } from './task-participant-sync-service.js';

function makeDb() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-task-participant-sync-'));
  const db = createAgoraDatabase({ dbPath: join(dir, 'task-participant-sync.db') });
  runMigrations(db);
  return {
    dir,
    db,
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const team: TeamDto = {
  members: [
    { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
    { role: 'developer', agentId: 'sonnet', member_kind: 'citizen', model_preference: 'fast_coding' },
    { role: 'reviewer', agentId: 'glm5', member_kind: 'citizen', model_preference: 'review' },
  ],
};

const workflow: WorkflowDto = {
  type: 'custom',
  stages: [
    {
      id: 'draft',
      mode: 'discuss',
      roster: {
        include_roles: ['developer'],
        keep_controller: true,
      },
      gate: { type: 'command' },
    },
    {
      id: 'review',
      mode: 'discuss',
      roster: {
        include_roles: ['reviewer'],
        keep_controller: true,
      },
      gate: { type: 'command' },
    },
  ],
};

describe('TaskParticipantSyncService', () => {
  it('seeds stage exposure, attaches the context binding, and joins initial participants', async () => {
    const fixture = makeDb();
    try {
      const { db } = fixture;
      const taskRepository = new TaskRepository(db);
      const taskContextBindingRepository = new TaskContextBindingRepository(db);
      const taskParticipationService = createTaskParticipationServiceFromDb(db, {
        participantIdGenerator: (() => {
          const ids = ['participant-1', 'participant-2', 'participant-3'];
          return () => ids.shift() ?? 'participant-x';
        })(),
      });
      const provisioningPort = new StubIMProvisioningPort({
        im_provider: 'discord',
        conversation_ref: 'discord-parent',
        thread_ref: 'discord-thread-seed',
      });
      const service = new TaskParticipantSyncService({
        taskContextBindingRepository,
        taskParticipationService,
        imProvisioningPort: provisioningPort,
        stageRosterService: new StageRosterService(),
      });

      taskRepository.insertTask({
        id: 'OC-PARTICIPANT-SYNC-1',
        title: 'Participant sync seed',
        description: '',
        type: 'custom',
        creator: 'archon',
        priority: 'normal',
        locale: 'zh-CN',
        workflow,
        team,
      });

      taskParticipationService.seedParticipants('OC-PARTICIPANT-SYNC-1', team);
      service.seedStageExposure('OC-PARTICIPANT-SYNC-1', team, workflow.stages?.[0]);

      taskContextBindingRepository.insert({
        id: 'binding-seed-1',
        task_id: 'OC-PARTICIPANT-SYNC-1',
        im_provider: 'discord',
        conversation_ref: 'discord-parent',
        thread_ref: 'discord-thread-seed',
        status: 'active',
      });
      service.attachProvisionedContext('OC-PARTICIPANT-SYNC-1', 'binding-seed-1');
      await service.joinProvisionedParticipants(
        'OC-PARTICIPANT-SYNC-1',
        {
          id: 'binding-seed-1',
          conversation_ref: 'discord-parent',
          thread_ref: 'discord-thread-seed',
        },
        ['opus', 'sonnet'],
      );

      const participants = taskParticipationService.listParticipants('OC-PARTICIPANT-SYNC-1');
      expect(provisioningPort.joined).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ participant_ref: 'opus' }),
          expect.objectContaining({ participant_ref: 'sonnet' }),
        ]),
      );
      expect(participants).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            agent_ref: 'opus',
            binding_id: 'binding-seed-1',
            desired_exposure: 'in_thread',
            exposure_reason: 'controller_preserved',
            join_status: 'joined',
          }),
          expect.objectContaining({
            agent_ref: 'sonnet',
            binding_id: 'binding-seed-1',
            desired_exposure: 'in_thread',
            exposure_reason: 'stage_roster_selected',
            join_status: 'joined',
          }),
          expect.objectContaining({
            agent_ref: 'glm5',
            binding_id: 'binding-seed-1',
            desired_exposure: 'hidden',
            exposure_reason: 'stage_roster_excluded',
            join_status: 'pending',
          }),
        ]),
      );
    } finally {
      fixture.cleanup();
    }
  });

  it('reconciles stage roster transitions by removing stale participants and joining desired ones', async () => {
    const fixture = makeDb();
    try {
      const { db } = fixture;
      const taskRepository = new TaskRepository(db);
      const taskContextBindingRepository = new TaskContextBindingRepository(db);
      const taskParticipationService = createTaskParticipationServiceFromDb(db, {
        participantIdGenerator: (() => {
          const ids = ['participant-r1', 'participant-r2', 'participant-r3'];
          return () => ids.shift() ?? 'participant-rx';
        })(),
        runtimeSessionIdGenerator: () => 'runtime-session-r1',
      });
      const provisioningPort = new StubIMProvisioningPort({
        im_provider: 'discord',
        conversation_ref: 'discord-parent',
        thread_ref: 'discord-thread-reconcile',
      });
      const tracked: Promise<unknown>[] = [];
      const service = new TaskParticipantSyncService({
        taskContextBindingRepository,
        taskParticipationService,
        imProvisioningPort: provisioningPort,
        stageRosterService: new StageRosterService(),
        trackBackgroundOperation(operation) {
          tracked.push(operation);
          return operation;
        },
      });

      const inserted = taskRepository.insertTask({
        id: 'OC-PARTICIPANT-SYNC-2',
        title: 'Participant sync reconcile',
        description: '',
        type: 'custom',
        creator: 'archon',
        priority: 'normal',
        locale: 'zh-CN',
        workflow,
        team,
      });
      const task = taskRepository.updateTask(inserted.id, inserted.version, {
        state: 'active',
        current_stage: 'draft',
      });

      taskParticipationService.seedParticipants(task.id, team);
      taskContextBindingRepository.insert({
        id: 'binding-reconcile-1',
        task_id: task.id,
        im_provider: 'discord',
        conversation_ref: 'discord-parent',
        thread_ref: 'discord-thread-reconcile',
        status: 'active',
      });
      service.attachProvisionedContext(task.id, 'binding-reconcile-1');
      await service.joinProvisionedParticipants(
        task.id,
        {
          id: 'binding-reconcile-1',
          conversation_ref: 'discord-parent',
          thread_ref: 'discord-thread-reconcile',
        },
        ['opus', 'sonnet'],
      );

      provisioningPort.joined.length = 0;
      provisioningPort.removed.length = 0;

      const reviewTask = taskRepository.updateTask(task.id, task.version, {
        current_stage: 'review',
      });
      service.reconcileStageParticipants(reviewTask, workflow.stages?.[1] ?? null);
      await Promise.allSettled(tracked);

      expect(provisioningPort.removed).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ participant_ref: 'sonnet' }),
        ]),
      );
      expect(provisioningPort.joined).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ participant_ref: 'glm5' }),
        ]),
      );

      const participants = taskParticipationService.listParticipants(task.id);
      expect(participants).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            agent_ref: 'opus',
            desired_exposure: 'in_thread',
            exposure_reason: 'controller_preserved',
            join_status: 'joined',
          }),
          expect.objectContaining({
            agent_ref: 'sonnet',
            desired_exposure: 'hidden',
            exposure_reason: 'stage_roster_excluded',
            join_status: 'left',
          }),
          expect.objectContaining({
            agent_ref: 'glm5',
            desired_exposure: 'in_thread',
            exposure_reason: 'stage_roster_selected',
            join_status: 'joined',
          }),
        ]),
      );
    } finally {
      fixture.cleanup();
    }
  });
});
