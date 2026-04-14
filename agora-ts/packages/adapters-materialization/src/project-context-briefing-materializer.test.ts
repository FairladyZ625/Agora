import { describe, expect, it, vi } from 'vitest';
import { ProjectContextBriefingMaterializer } from './project-context-briefing-materializer.js';

describe('ProjectContextBriefingMaterializer', () => {
  it('delegates task-aware requests to async bootstrap context building', async () => {
    const projectBrainAutomationService = {
      buildProjectContextBriefing: vi.fn(),
      buildProjectContextBriefingAsync: vi.fn().mockResolvedValue({
        project_id: 'proj-ctx',
        audience: 'craftsman',
        markdown: '# Briefing',
        source_documents: [],
      }),
    };
    const materializer = new ProjectContextBriefingMaterializer({
      projectBrainAutomationService,
    });

    const result = await materializer.materialize({
      target: 'project_context_briefing',
      project_id: 'proj-ctx',
      audience: 'craftsman',
      task_id: 'OC-200',
      task_title: 'Implement hybrid retrieval',
      task_description: 'Need vector recall and lexical rerank.',
    });

    expect(projectBrainAutomationService.buildProjectContextBriefingAsync).toHaveBeenCalledWith({
      project_id: 'proj-ctx',
      audience: 'craftsman',
      task_id: 'OC-200',
      task_title: 'Implement hybrid retrieval',
      task_description: 'Need vector recall and lexical rerank.',
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

  it('supports synchronous task-aware materialization', () => {
    const projectBrainAutomationService = {
      buildProjectContextBriefing: vi.fn().mockReturnValue({
        project_id: 'proj-ctx',
        audience: 'controller',
        markdown: '# Sync briefing',
        source_documents: [],
      }),
      buildProjectContextBriefingAsync: vi.fn(),
    };
    const materializer = new ProjectContextBriefingMaterializer({
      projectBrainAutomationService,
    });

    const result = materializer.materializeSync({
      target: 'project_context_briefing',
      project_id: 'proj-ctx',
      audience: 'controller',
      task_id: 'OC-123',
      task_title: 'Investigate routing',
      task_description: 'Need task-aware bootstrap',
      allowed_citizen_ids: ['citizen-alpha'],
    });

    expect(projectBrainAutomationService.buildProjectContextBriefing).toHaveBeenCalledWith({
      project_id: 'proj-ctx',
      audience: 'controller',
      task_id: 'OC-123',
      task_title: 'Investigate routing',
      task_description: 'Need task-aware bootstrap',
      allowed_citizen_ids: ['citizen-alpha'],
    });
    expect(result).toEqual({
      target: 'project_context_briefing',
      artifact: {
        project_id: 'proj-ctx',
        audience: 'controller',
        markdown: '# Sync briefing',
        source_documents: [],
      },
    });
  });
});
