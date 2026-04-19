import { describe, expect, it, vi } from 'vitest';
import { CcConnectAgoraContextDeliveryClient } from './agora-context-delivery-client.js';

describe('CcConnectAgoraContextDeliveryClient', () => {
  it('posts task-scoped context delivery requests to the canonical task route', async () => {
    const fetchJson = vi.fn(async () => ({
      status: 200,
      json: {
        scope: 'project_context',
        delivery: {
          briefing: {
            project_id: 'proj-ctx',
            audience: 'craftsman',
            markdown: '# Project Context Briefing',
            source_documents: [],
          },
          reference_bundle: null,
          attention_routing_plan: null,
          runtime_delivery: null,
        },
      },
    }));
    const client = new CcConnectAgoraContextDeliveryClient({ fetchJson });

    await client.getTaskContextDelivery({
      apiBaseUrl: 'http://127.0.0.1:8420/',
      apiToken: 'secret-token',
      taskId: 'OC-200',
      audience: 'craftsman',
      allowedCitizenIds: ['citizen-alpha'],
    });

    expect(fetchJson).toHaveBeenCalledWith(
      'http://127.0.0.1:8420/api/tasks/OC-200/context/delivery',
      expect.objectContaining({
        method: 'POST',
        timeoutMs: 5000,
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer secret-token',
        },
        body: JSON.stringify({
          audience: 'craftsman',
          allowed_citizen_ids: ['citizen-alpha'],
        }),
      }),
    );
  });

  it('posts current-thread context delivery requests to the canonical im route', async () => {
    const fetchJson = vi.fn(async () => ({
      status: 200,
      json: {
        scope: 'project_context',
        delivery: {
          briefing: {
            project_id: 'proj-ctx',
            audience: 'controller',
            markdown: '# Project Context Briefing',
            source_documents: [],
          },
          reference_bundle: null,
          attention_routing_plan: null,
          runtime_delivery: {
            task_id: 'OC-201',
            task_title: 'Current thread task',
            workspace_path: '/tmp/proj-ctx/tasks/OC-201',
            manifest_path: '/tmp/proj-ctx/tasks/OC-201/04-context/runtime-delivery-manifest.md',
            artifact_paths: {
              controller: '/tmp/proj-ctx/tasks/OC-201/04-context/project-context-controller.md',
              citizen: '/tmp/proj-ctx/tasks/OC-201/04-context/project-context-citizen.md',
              craftsman: '/tmp/proj-ctx/tasks/OC-201/04-context/project-context-craftsman.md',
            },
          },
        },
      },
    }));
    const client = new CcConnectAgoraContextDeliveryClient({ fetchJson });

    const response = await client.getCurrentTaskContextDelivery({
      apiBaseUrl: 'http://127.0.0.1:8420',
      provider: 'discord',
      threadRef: 'thread-7',
      conversationRef: 'channel-1',
      audience: 'controller',
    });

    expect(fetchJson).toHaveBeenCalledWith(
      'http://127.0.0.1:8420/api/im/tasks/current/context/delivery',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          provider: 'discord',
          thread_ref: 'thread-7',
          conversation_ref: 'channel-1',
          audience: 'controller',
        }),
      }),
    );
    expect(response.delivery.runtime_delivery?.task_id).toBe('OC-201');
  });

  it('surfaces canonical api error messages without inventing provider-specific fallback payloads', async () => {
    const client = new CcConnectAgoraContextDeliveryClient({
      fetchJson: vi.fn(async () => ({
        status: 404,
        json: {
          message: 'task context binding not found for current IM context',
        },
      })),
    });

    await expect(client.getCurrentTaskContextDelivery({
      apiBaseUrl: 'http://127.0.0.1:8420',
      provider: 'discord',
      threadRef: 'thread-7',
      audience: 'controller',
    })).rejects.toThrow('task context binding not found for current IM context');
  });
});
