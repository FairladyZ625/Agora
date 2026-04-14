#!/usr/bin/env tsx
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ContextMaterializationService,
  type ContextMaterializationPort,
} from '../packages/core/src/index.js';
import { createAgoraDatabase, runMigrations, SubtaskRepository } from '../packages/db/src/index.js';
import { FilesystemTaskBrainWorkspaceAdapter } from '../packages/adapters-brain/src/index.js';
import {
  createCraftsmanDispatcherFromDb,
  createProjectServiceFromDb,
  createTaskBrainBindingServiceFromDb,
  createTaskServiceFromDb,
} from '../packages/testing/src/index.js';

async function main() {
  const root = mkdtempSync(join(tmpdir(), 'agora-task-runtime-consumption-'));
  const dbPath = join(root, 'agora.db');
  const brainPackRoot = join(root, 'brain-pack');
  const projectStateRoot = join(root, 'project-state');
  const db = createAgoraDatabase({ dbPath });
  runMigrations(db);

  try {
    const projectService = createProjectServiceFromDb(db);
    projectService.createProject({
      id: 'proj-runtime-consume',
      name: 'Runtime Consumption Smoke',
      owner: 'archon',
    });

    const contextMaterializationPort: ContextMaterializationPort = {
      supports(target) {
        return target === 'project_context_briefing';
      },
      materializeSync(request) {
        if (request.target !== 'project_context_briefing') {
          throw new Error(`unsupported target: ${request.target}`);
        }
        return {
          target: 'project_context_briefing',
          artifact: {
            project_id: request.project_id,
            audience: request.audience,
            markdown: [
              '---',
              'doc_type: project_context_briefing',
              `audience: ${request.audience}`,
              '---',
              `# ${request.audience}`,
              '',
              `Task: ${request.task_id ?? '-'}`,
            ].join('\n'),
            source_documents: [],
          },
        };
      },
      async materialize(request) {
        return this.materializeSync!(request);
      },
    };
    const contextMaterializationService = new ContextMaterializationService({
      ports: [contextMaterializationPort],
    });

    const dispatcher = createCraftsmanDispatcherFromDb(db, {
      executionIdGenerator: () => 'exec-runtime-smoke-1',
      adapters: {
        claude: {
          name: 'claude',
          dispatchTask() {
            return {
              status: 'running',
              session_id: 'claude:exec-runtime-smoke-1',
              started_at: '2026-04-14T00:00:00.000Z',
              payload: null,
            };
          },
        },
      },
    });

    const service = createTaskServiceFromDb(db, {
      taskIdGenerator: () => 'OC-RUNTIME-CONSUME-1',
      craftsmanDispatcher: dispatcher,
      projectService,
      taskBrainBindingService: createTaskBrainBindingServiceFromDb(db, {
        idGenerator: () => 'brain-runtime-consume-1',
      }),
      taskBrainWorkspacePort: new FilesystemTaskBrainWorkspaceAdapter({
        brainPackRoot,
        projectStateRootResolver: (projectId) => join(projectStateRoot, projectId),
      }),
      contextMaterializationService,
    });
    const subtasks = new SubtaskRepository(db);

    service.createTask({
      title: 'Runtime consumption smoke',
      type: 'coding',
      creator: 'archon',
      description: 'prove runtime consumes manifest-first task context',
      priority: 'high',
      project_id: 'proj-runtime-consume',
      team_override: {
        members: [
          { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
          { role: 'developer', agentId: 'sonnet', member_kind: 'citizen', model_preference: 'fast_coding' },
          { role: 'craftsman', agentId: 'claude', member_kind: 'craftsman', model_preference: 'coding_cli' },
        ],
      },
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'implement',
            mode: 'execute',
            execution_kind: 'craftsman_dispatch',
            allowed_actions: ['dispatch_craftsman'],
            roster: { include_roles: ['developer'], keep_controller: true },
            gate: { type: 'all_subtasks_done' },
          },
        ],
      },
    });

    subtasks.insertSubtask({
      id: 'sub-runtime-consume-1',
      task_id: 'OC-RUNTIME-CONSUME-1',
      stage_id: 'implement',
      title: 'Implement runtime consumption contract',
      assignee: 'claude',
      status: 'pending',
      craftsman_type: 'claude',
      craftsman_prompt: 'Read the runtime delivery manifest first.',
    });

    const dispatch = service.dispatchCraftsman({
      task_id: 'OC-RUNTIME-CONSUME-1',
      subtask_id: 'sub-runtime-consume-1',
      caller_id: 'opus',
      adapter: 'claude',
      mode: 'one_shot',
      interaction_expectation: 'one_shot',
      workdir: '/tmp/runtime-consume',
    }) as { execution: { brief_path: string | null } };

    const workspacePath = join(projectStateRoot, 'proj-runtime-consume', 'tasks', 'OC-RUNTIME-CONSUME-1');
    const manifestPath = join(workspacePath, '04-context', 'runtime-delivery-manifest.md');
    const bootstrapPath = join(workspacePath, '00-bootstrap.md');
    const roleBriefPath = join(workspacePath, '05-agents', 'claude', '00-role-brief.md');
    const executionBriefPath = dispatch.execution.brief_path;

    if (!existsSync(manifestPath)) {
      throw new Error(`missing runtime delivery manifest: ${manifestPath}`);
    }
    if (!readFileSync(bootstrapPath, 'utf8').includes(manifestPath)) {
      throw new Error('bootstrap did not point to runtime delivery manifest');
    }
    if (!readFileSync(roleBriefPath, 'utf8').includes(manifestPath)) {
      throw new Error('role brief did not point to runtime delivery manifest');
    }
    if (!executionBriefPath || !existsSync(executionBriefPath)) {
      throw new Error('execution brief was not materialized');
    }
    const executionBrief = readFileSync(executionBriefPath, 'utf8');
    if (!executionBrief.includes(`Runtime Delivery Manifest: ${manifestPath}`)) {
      throw new Error('execution brief did not point to runtime delivery manifest');
    }
    if (!executionBrief.includes('project-context-craftsman.md')) {
      throw new Error('execution brief did not keep the craftsman audience context');
    }

    console.log(JSON.stringify({
      ok: true,
      workspace_path: workspacePath,
      manifest_path: manifestPath,
      execution_brief_path: executionBriefPath,
      files: [
        bootstrapPath,
        manifestPath,
        roleBriefPath,
        executionBriefPath,
      ],
    }, null, 2));
  } finally {
    if (process.env.KEEP_SMOKE_DIR !== '1') {
      rmSync(root, { recursive: true, force: true });
    }
  }
}

await main();
