import { describe, expect, it } from 'vitest';
import { InventoryBackedAgentRuntimePort } from './runtime-ports.js';

describe('runtime ports', () => {
  it('resolves runtime participants from inventory', () => {
    const port = new InventoryBackedAgentRuntimePort({
      listAgents: () => [
        {
          id: 'opus',
          host_framework: 'acpx',
          channel_providers: ['discord'],
          inventory_sources: ['registry'],
          primary_model: 'sonnet',
          workspace_dir: '/tmp/project',
          agent_origin: 'agora_managed',
          briefing_mode: 'overlay_delta',
        },
      ],
    });

    expect(port.resolveAgent('opus')).toEqual({
      agent_ref: 'opus',
      runtime_provider: 'acpx',
      runtime_actor_ref: 'opus',
      agent_origin: 'agora_managed',
      briefing_mode: 'overlay_delta',
    });
    expect(port.resolveAgent('missing')).toBeNull();
  });
});
