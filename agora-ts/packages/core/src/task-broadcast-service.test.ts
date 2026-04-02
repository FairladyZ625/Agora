import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TaskContextBindingRepository, TaskConversationRepository, TaskRepository, createAgoraDatabase, runMigrations } from '@agora-ts/db';
import { StubIMProvisioningPort } from './im-ports.js';
import { TaskBroadcastService } from './task-broadcast-service.js';

function makeDb() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-task-broadcast-'));
  const db = createAgoraDatabase({ dbPath: join(dir, 'task-broadcast.db') });
  runMigrations(db);
  return {
    dir,
    db,
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

describe('TaskBroadcastService', () => {
  it('publishes task status updates and mirrors them into task conversation', async () => {
    const fixture = makeDb();
    try {
      const { db } = fixture;
      const taskRepository = new TaskRepository(db);
      const taskContextBindingRepository = new TaskContextBindingRepository(db);
      const taskConversationRepository = new TaskConversationRepository(db);
      const imProvisioningPort = new StubIMProvisioningPort({
        im_provider: 'discord',
        conversation_ref: 'discord-parent',
        thread_ref: 'discord-thread',
      });

      const inserted = taskRepository.insertTask({
        id: 'OC-BROADCAST-1',
        title: 'Broadcast smoke',
        description: '',
        type: 'coding',
        creator: 'archon',
        priority: 'normal',
        locale: 'zh-CN',
        workflow: {
          type: 'custom',
          stages: [
            {
              id: 'build',
              mode: 'execute',
              execution_kind: 'craftsman_dispatch',
              allowed_actions: ['execute', 'dispatch_craftsman'],
            },
          ],
        },
        team: {
          members: [
            { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
          ],
        },
      });
      taskRepository.updateTask(inserted.id, inserted.version, {
        state: 'active',
        current_stage: 'build',
        control: { mode: 'normal' },
      });

      taskContextBindingRepository.insert({
        id: 'binding-broadcast-1',
        task_id: 'OC-BROADCAST-1',
        im_provider: 'discord',
        conversation_ref: 'discord-parent',
        thread_ref: 'discord-thread',
        status: 'active',
      });

      const service = new TaskBroadcastService({
        taskContextBindingRepository,
        taskConversationRepository,
        imProvisioningPort,
      });

      service.publishTaskStatusBroadcast(taskRepository.getTask('OC-BROADCAST-1')!, {
        kind: 'controller_pinged',
        participantRefs: ['opus'],
        ensureParticipantRefsJoined: ['opus'],
        bodyLines: ['Task appears inactive for 120 seconds.'],
        occurredAt: '2026-04-02T01:02:00.000Z',
      });

      expect(imProvisioningPort.joined).toHaveLength(1);
      expect(imProvisioningPort.joined[0]).toMatchObject({
        binding_id: 'binding-broadcast-1',
        participant_ref: 'opus',
        conversation_ref: 'discord-parent',
        thread_ref: 'discord-thread',
      });
      expect(imProvisioningPort.published).toHaveLength(1);
      expect(imProvisioningPort.published[0]?.messages[0]).toMatchObject({
        kind: 'controller_pinged',
        participant_refs: ['opus'],
      });
      expect(imProvisioningPort.published[0]?.messages[0]?.body).toContain('Task appears inactive for 120 seconds.');

      const entries = taskConversationRepository.listByTask('OC-BROADCAST-1');
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        task_id: 'OC-BROADCAST-1',
        provider: 'discord',
        author_ref: 'agora-bot',
        body_format: 'plain_text',
        occurred_at: '2026-04-02T01:02:00.000Z',
      });
      expect(entries[0]?.metadata).toMatchObject({
        event_type: 'controller_pinged',
        participant_refs: ['opus'],
        current_stage: 'build',
        controller_ref: 'opus',
      });
    } finally {
      fixture.cleanup();
    }
  });

  it('publishes gate decision updates including controller-targeted follow-up', () => {
    const fixture = makeDb();
    try {
      const { db } = fixture;
      const taskRepository = new TaskRepository(db);
      const taskContextBindingRepository = new TaskContextBindingRepository(db);
      const taskConversationRepository = new TaskConversationRepository(db);
      const imProvisioningPort = new StubIMProvisioningPort({
        im_provider: 'discord',
        conversation_ref: 'discord-parent',
        thread_ref: 'discord-thread',
      });

      const inserted = taskRepository.insertTask({
        id: 'OC-GATE-1',
        title: 'Approval gate smoke',
        description: '',
        type: 'coding',
        creator: 'archon',
        priority: 'normal',
        locale: 'zh-CN',
        workflow: {
          type: 'custom',
          stages: [
            {
              id: 'review',
              mode: 'discuss',
              execution_kind: 'human_approval',
              allowed_actions: ['approve', 'reject'],
            },
          ],
        },
        team: {
          members: [
            { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
          ],
        },
      });
      const task = taskRepository.updateTask(inserted.id, inserted.version, {
        state: 'active',
        current_stage: 'review',
        control: { mode: 'normal' },
      });

      taskContextBindingRepository.insert({
        id: 'binding-gate-1',
        task_id: task.id,
        im_provider: 'discord',
        conversation_ref: 'discord-parent',
        thread_ref: 'discord-thread',
        status: 'active',
      });

      const service = new TaskBroadcastService({
        taskContextBindingRepository,
        taskConversationRepository,
        imProvisioningPort,
      });

      service.publishGateDecisionBroadcast(task, {
        decision: 'rejected',
        reviewer: 'reviewer-human',
        gateType: 'approval',
        reason: 'Need changes',
      });

      expect(imProvisioningPort.published).toHaveLength(2);
      expect(imProvisioningPort.published[0]?.messages[0]?.kind).toBe('gate_rejected');
      expect(imProvisioningPort.published[0]?.messages[0]?.body).toContain('Gate rejected: approval');
      expect(imProvisioningPort.published[1]?.messages[0]).toMatchObject({
        kind: 'controller_gate_rejected',
        participant_refs: ['opus'],
      });
      expect(imProvisioningPort.published[1]?.messages[0]?.body).toContain('Need changes');
    } finally {
      fixture.cleanup();
    }
  });

  it('archives and restores the latest IM context binding for task state transitions', async () => {
    const fixture = makeDb();
    try {
      const { db } = fixture;
      const taskRepository = new TaskRepository(db);
      const taskContextBindingRepository = new TaskContextBindingRepository(db);
      const taskConversationRepository = new TaskConversationRepository(db);
      const imProvisioningPort = new StubIMProvisioningPort({
        im_provider: 'discord',
        conversation_ref: 'discord-parent',
        thread_ref: 'discord-thread',
      });

      taskRepository.insertTask({
        id: 'OC-STATE-1',
        title: 'State transition smoke',
        description: '',
        type: 'coding',
        creator: 'archon',
        priority: 'normal',
        locale: 'zh-CN',
        workflow: {
          type: 'custom',
          stages: [
            {
              id: 'build',
              mode: 'execute',
              execution_kind: 'craftsman_dispatch',
              allowed_actions: ['execute', 'dispatch_craftsman'],
            },
          ],
        },
        team: {
          members: [
            { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
          ],
        },
      });

      taskContextBindingRepository.insert({
        id: 'binding-state-1',
        task_id: 'OC-STATE-1',
        im_provider: 'discord',
        conversation_ref: 'discord-parent',
        thread_ref: 'discord-thread',
        status: 'active',
      });

      const service = new TaskBroadcastService({
        taskContextBindingRepository,
        taskConversationRepository,
        imProvisioningPort,
      });

      service.syncImContextForTaskState('OC-STATE-1', 'active', 'paused', 'hold for review');
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(imProvisioningPort.archived).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            binding_id: 'binding-state-1',
            conversation_ref: 'discord-parent',
            thread_ref: 'discord-thread',
            mode: 'archive',
            reason: 'hold for review',
          }),
        ]),
      );
      expect(taskContextBindingRepository.getById('binding-state-1')?.status).toBe('archived');

      service.syncImContextForTaskState('OC-STATE-1', 'paused', 'active');
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(imProvisioningPort.archived).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            binding_id: 'binding-state-1',
            mode: 'unarchive',
          }),
        ]),
      );
      expect(taskContextBindingRepository.getById('binding-state-1')?.status).toBe('active');
    } finally {
      fixture.cleanup();
    }
  });
});
