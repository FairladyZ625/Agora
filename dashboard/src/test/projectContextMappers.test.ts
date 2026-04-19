import { describe, expect, it } from 'vitest';
import { mapProjectContextDeliveryDto } from '@/lib/projectContextMappers';
import type { ApiProjectContextDeliveryDto } from '@/types/api';

describe('project context mappers', () => {
  it('maps project context delivery dto into a dashboard view model', () => {
    const dto: ApiProjectContextDeliveryDto = {
      scope: 'project_context',
      delivery: {
        briefing: {
          project_id: 'proj-alpha',
          audience: 'controller',
          markdown: '# Project Context Briefing',
          source_documents: [
            {
              kind: 'decision',
              slug: 'runtime-boundary',
              title: 'Runtime Boundary',
              path: '/brain/projects/proj-alpha/knowledge/decisions/runtime-boundary.md',
            },
          ],
        },
        reference_bundle: {
          scope: 'project_context',
          mode: 'bootstrap',
          project_id: 'proj-alpha',
          task_id: 'OC-001',
          inventory: {
            scope: 'project_context',
            project_id: 'proj-alpha',
            generated_at: '2026-04-14T00:00:00.000Z',
            entries: [],
          },
          project_map: {
            index_reference_key: 'index:index',
            timeline_reference_key: 'timeline:timeline',
            inventory_count: 1,
          },
          references: [
            {
              scope: 'project_context',
              reference_key: 'decision:runtime-boundary',
              project_id: 'proj-alpha',
              kind: 'decision',
              slug: 'runtime-boundary',
              title: 'Runtime Boundary',
              path: '/brain/projects/proj-alpha/knowledge/decisions/runtime-boundary.md',
            },
          ],
        },
        attention_routing_plan: {
          scope: 'project_context',
          mode: 'bootstrap',
          project_id: 'proj-alpha',
          task_id: 'OC-001',
          audience: 'controller',
          summary: 'Start from the project map.',
          routes: [
            {
              ordinal: 1,
              reference_key: 'index:index',
              kind: 'project_map',
              rationale: 'Start from the project map.',
            },
          ],
        },
        runtime_delivery: {
          task_id: 'OC-001',
          task_title: 'Bootstrap flow',
          workspace_path: '/tmp/proj-alpha/tasks/OC-001',
          manifest_path: '/tmp/proj-alpha/tasks/OC-001/04-context/runtime-delivery-manifest.md',
          artifact_paths: {
            controller: '/tmp/proj-alpha/tasks/OC-001/04-context/project-context-controller.md',
            citizen: '/tmp/proj-alpha/tasks/OC-001/04-context/project-context-citizen.md',
            craftsman: '/tmp/proj-alpha/tasks/OC-001/04-context/project-context-craftsman.md',
          },
        },
      },
    };

    expect(mapProjectContextDeliveryDto(dto)).toEqual({
      scope: 'project_context',
      briefing: {
        projectId: 'proj-alpha',
        audience: 'controller',
        markdown: '# Project Context Briefing',
        sourceDocuments: [
          {
            kind: 'decision',
            slug: 'runtime-boundary',
            title: 'Runtime Boundary',
            path: '/brain/projects/proj-alpha/knowledge/decisions/runtime-boundary.md',
          },
        ],
      },
      referenceBundle: {
        scope: 'project_context',
        mode: 'bootstrap',
        projectId: 'proj-alpha',
        taskId: 'OC-001',
        inventoryCount: 1,
        references: [
          {
            referenceKey: 'decision:runtime-boundary',
            kind: 'decision',
            slug: 'runtime-boundary',
            title: 'Runtime Boundary',
            path: '/brain/projects/proj-alpha/knowledge/decisions/runtime-boundary.md',
          },
        ],
      },
      attentionRoutingPlan: {
        scope: 'project_context',
        mode: 'bootstrap',
        projectId: 'proj-alpha',
        taskId: 'OC-001',
        audience: 'controller',
        summary: 'Start from the project map.',
        routes: [
          {
            ordinal: 1,
            referenceKey: 'index:index',
            kind: 'project_map',
            rationale: 'Start from the project map.',
          },
        ],
      },
      runtimeDelivery: {
        taskId: 'OC-001',
        taskTitle: 'Bootstrap flow',
        workspacePath: '/tmp/proj-alpha/tasks/OC-001',
        manifestPath: '/tmp/proj-alpha/tasks/OC-001/04-context/runtime-delivery-manifest.md',
        artifactPaths: {
          controller: '/tmp/proj-alpha/tasks/OC-001/04-context/project-context-controller.md',
          citizen: '/tmp/proj-alpha/tasks/OC-001/04-context/project-context-citizen.md',
          craftsman: '/tmp/proj-alpha/tasks/OC-001/04-context/project-context-craftsman.md',
        },
      },
    });
  });
});
