import { describe, expect, it, vi } from 'vitest';
import { ContextMaterializationService } from './context-materialization-service.js';

describe('ContextMaterializationService', () => {
  it('dispatches project context briefing requests to the matching port', async () => {
    const port = {
      supports: vi.fn().mockImplementation((target: string) => target === 'project_context_briefing'),
      materialize: vi.fn().mockResolvedValue({
        target: 'project_context_briefing',
        artifact: {
          project_id: 'proj-ctx',
          audience: 'craftsman',
          markdown: '# Briefing',
          source_documents: [],
        },
      }),
    };
    const service = new ContextMaterializationService({
      ports: [port],
    });

    const result = await service.materialize({
      target: 'project_context_briefing',
      project_id: 'proj-ctx',
      audience: 'craftsman',
    });

    expect(port.supports).toHaveBeenCalledWith('project_context_briefing');
    expect(port.materialize).toHaveBeenCalledWith({
      target: 'project_context_briefing',
      project_id: 'proj-ctx',
      audience: 'craftsman',
    });
    expect(result).toEqual({
      target: 'project_context_briefing',
      artifact: {
        project_id: 'proj-ctx',
        audience: 'craftsman',
        markdown: '# Briefing',
        source_documents: [],
      },
    });
  });

  it('throws when no port supports the requested target', async () => {
    const service = new ContextMaterializationService({
      ports: [{
        supports: () => false,
        materialize: vi.fn(),
      }],
    });

    await expect(service.materialize({
      target: 'project_context_briefing',
      project_id: 'proj-ctx',
      audience: 'craftsman',
    })).rejects.toThrow('No context materialization port configured for target: project_context_briefing');
  });

  it('dispatches synchronous requests to a sync-capable port', () => {
    const port = {
      supports: vi.fn().mockImplementation((target: string) => target === 'project_context_briefing'),
      materializeSync: vi.fn().mockReturnValue({
        target: 'project_context_briefing',
        artifact: {
          project_id: 'proj-ctx',
          audience: 'controller',
          markdown: '# Sync Briefing',
          source_documents: [],
        },
      }),
      materialize: vi.fn(),
    };
    const service = new ContextMaterializationService({
      ports: [port],
    });

    const result = service.materializeSync({
      target: 'project_context_briefing',
      project_id: 'proj-ctx',
      audience: 'controller',
    });

    expect(port.supports).toHaveBeenCalledWith('project_context_briefing');
    expect(port.materializeSync).toHaveBeenCalledWith({
      target: 'project_context_briefing',
      project_id: 'proj-ctx',
      audience: 'controller',
    });
    expect(result).toEqual({
      target: 'project_context_briefing',
      artifact: {
        project_id: 'proj-ctx',
        audience: 'controller',
        markdown: '# Sync Briefing',
        source_documents: [],
      },
    });
  });
});
