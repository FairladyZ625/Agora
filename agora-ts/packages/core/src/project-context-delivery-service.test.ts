import { describe, expect, it, vi } from 'vitest';
import { ProjectContextDeliveryService } from './project-context-delivery-service.js';

describe('project context delivery service', () => {
  it('materializes a task-aware project context delivery payload with runtime delivery paths', async () => {
    const contextMaterializationService = {
      materialize: vi.fn().mockResolvedValue({
        target: 'project_context_briefing',
        artifact: {
          project_id: 'proj-ctx',
          audience: 'craftsman',
          markdown: '# Project Context Briefing',
          reference_bundle: {
            scope: 'project_context',
            mode: 'bootstrap',
            project_id: 'proj-ctx',
            inventory: {
              scope: 'project_context',
              project_id: 'proj-ctx',
              generated_at: '2026-04-14T00:00:00.000Z',
              entries: [],
            },
            project_map: {
              index_reference_key: 'index:index',
              timeline_reference_key: 'timeline:timeline',
              inventory_count: 0,
            },
            references: [],
          },
          attention_routing_plan: {
            scope: 'project_context',
            mode: 'bootstrap',
            project_id: 'proj-ctx',
            audience: 'craftsman',
            summary: 'Start from the project map.',
            routes: [],
          },
          source_documents: [],
        },
      }),
    };
    const service = new ProjectContextDeliveryService({
      contextMaterializationService: contextMaterializationService as never,
      taskLookup: {
        getTask: () => ({
          id: 'OC-200',
          version: 1,
          title: 'Implement hybrid retrieval',
          description: 'Need vector recall and lexical rerank.',
          type: 'coding',
          priority: 'normal',
          creator: 'archon',
          locale: 'zh-CN',
          project_id: 'proj-ctx',
          state: 'active',
          archive_status: null,
          current_stage: null,
          skill_policy: null,
          team: {
            members: [
              { role: 'architect', agentId: 'opus', model_preference: 'strong_reasoning', member_kind: 'controller' },
              { role: 'developer', agentId: 'citizen-alpha', model_preference: 'balanced', member_kind: 'citizen' },
            ],
          },
          workflow: { type: 'default', stages: [] },
          control: null,
          scheduler: null,
          scheduler_snapshot: null,
          discord: null,
          metrics: null,
          error_detail: null,
          created_at: '2026-04-14T00:00:00.000Z',
          updated_at: '2026-04-14T00:00:00.000Z',
        }),
      },
      taskBrainBindingService: {
        getActiveBinding: () => ({
          id: 'brain-1',
          task_id: 'OC-200',
          brain_pack_ref: 'pack',
          brain_task_id: 'brain-task',
          workspace_path: '/tmp/proj-ctx/tasks/OC-200',
          metadata: null,
          status: 'active',
          created_at: '2026-04-14T00:00:00.000Z',
          updated_at: '2026-04-14T00:00:00.000Z',
        }),
      } as never,
    });

    const result = await service.getDelivery({
      project_id: 'proj-ctx',
      audience: 'craftsman',
      task_id: 'OC-200',
    });

    expect(contextMaterializationService.materialize).toHaveBeenCalledWith({
      target: 'project_context_briefing',
      project_id: 'proj-ctx',
      audience: 'craftsman',
      task_id: 'OC-200',
      task_title: 'Implement hybrid retrieval',
      task_description: 'Need vector recall and lexical rerank.',
      allowed_citizen_ids: ['citizen-alpha'],
    });
    expect(result).toEqual({
      scope: 'project_context',
      delivery: {
        briefing: expect.objectContaining({
          project_id: 'proj-ctx',
          audience: 'craftsman',
          markdown: '# Project Context Briefing',
        }),
        reference_bundle: expect.objectContaining({
          scope: 'project_context',
          project_id: 'proj-ctx',
        }),
        attention_routing_plan: expect.objectContaining({
          scope: 'project_context',
          project_id: 'proj-ctx',
          audience: 'craftsman',
        }),
        runtime_delivery: {
          task_id: 'OC-200',
          task_title: 'Implement hybrid retrieval',
          workspace_path: '/tmp/proj-ctx/tasks/OC-200',
          manifest_path: '/tmp/proj-ctx/tasks/OC-200/04-context/runtime-delivery-manifest.md',
          artifact_paths: {
            controller: '/tmp/proj-ctx/tasks/OC-200/04-context/project-context-controller.md',
            citizen: '/tmp/proj-ctx/tasks/OC-200/04-context/project-context-citizen.md',
            craftsman: '/tmp/proj-ctx/tasks/OC-200/04-context/project-context-craftsman.md',
          },
        },
      },
    });
  });

  it('returns a delivery payload without runtime delivery when no task workspace binding exists', async () => {
    const service = new ProjectContextDeliveryService({
      contextMaterializationService: {
        materialize: vi.fn().mockResolvedValue({
          target: 'project_context_briefing',
          artifact: {
            project_id: 'proj-ctx',
            audience: 'controller',
            markdown: '# Project Context Briefing',
            source_documents: [],
          },
        }),
      } as never,
    });

    const result = await service.getDelivery({
      project_id: 'proj-ctx',
      audience: 'controller',
    });

    expect(result.delivery.runtime_delivery).toBeNull();
    expect(result.delivery.reference_bundle).toBeNull();
    expect(result.delivery.attention_routing_plan).toBeNull();
  });
});
