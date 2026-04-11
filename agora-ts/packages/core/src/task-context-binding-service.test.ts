import { describe, expect, it } from 'vitest';
import { createTestRuntime } from '@agora-ts/testing';
import { TaskContextBindingRepository } from '@agora-ts/db';
import { TaskContextBindingService } from './task-context-binding-service.js';

describe('TaskContextBindingService', () => {
  it('creates and retrieves an active binding for a task', () => {
    const runtime = createTestRuntime();
    try {
      const service = new TaskContextBindingService({
        repository: new TaskContextBindingRepository(runtime.db),
        idGenerator: () => 'binding-1',
      });
      const task = runtime.taskService.createTask({
        title: 'Binding test',
        type: 'coding',
        creator: 'archon',
        description: 'test',
        priority: 'normal',
      });

      const binding = service.createBinding({
        task_id: task.id,
        im_provider: 'discord',
        thread_ref: 'thread-123',
      });

      expect(binding.id).toBe('binding-1');
      expect(binding.task_id).toBe(task.id);
      expect(binding.im_provider).toBe('discord');
      expect(binding.thread_ref).toBe('thread-123');
      expect(binding.status).toBe('active');

      const active = service.getActiveBinding(task.id);
      expect(active?.id).toBe('binding-1');
    } finally {
      runtime.cleanup();
    }
  });

  it('returns null when no active binding exists', () => {
    const runtime = createTestRuntime();
    try {
      const service = new TaskContextBindingService({
        repository: new TaskContextBindingRepository(runtime.db),
      });
      expect(service.getActiveBinding('nonexistent')).toBeNull();
    } finally {
      runtime.cleanup();
    }
  });

  it('updates binding status and sets closed_at for terminal states', () => {
    const runtime = createTestRuntime();
    try {
      const service = new TaskContextBindingService({
        repository: new TaskContextBindingRepository(runtime.db),
        idGenerator: () => 'binding-2',
      });
      const task = runtime.taskService.createTask({
        title: 'Status test',
        type: 'coding',
        creator: 'archon',
        description: 'test',
        priority: 'normal',
      });

      service.createBinding({
        task_id: task.id,
        im_provider: 'discord',
        thread_ref: 'thread-456',
      });

      service.updateStatus('binding-2', 'archived');
      const bindings = service.listBindings(task.id);
      expect(bindings[0]?.status).toBe('archived');
      expect(bindings[0]?.closed_at).not.toBeNull();

      expect(service.getActiveBinding(task.id)).toBeNull();
    } finally {
      runtime.cleanup();
    }
  });
});
