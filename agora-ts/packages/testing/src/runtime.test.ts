import { describe, expect, it } from 'vitest';
import { createTestRuntime } from './index.js';

describe('agora-ts testing helpers', () => {
  it('creates an isolated runtime with authoring-capable services', () => {
    const runtime = createTestRuntime({
      taskIdGenerator: () => 'OC-700',
    });

    const task = runtime.taskService.createTask({
      title: 'testing helper task',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'high',
    });
    const agents = runtime.dashboardQueryService.getAgentsStatus();

    expect(task.id).toBe('OC-700');
    expect(runtime.db).toBeDefined();
    expect(agents.summary.active_tasks).toBe(1);
    expect(runtime.inboxService).toBeDefined();
    expect(runtime.templateAuthoringService).toBeDefined();
    expect(runtime.templatesDir.startsWith(runtime.dir)).toBe(true);

    runtime.cleanup();
  });
});
