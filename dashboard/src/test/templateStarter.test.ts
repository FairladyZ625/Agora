import { describe, expect, it } from 'vitest';
import { buildStarterTemplateDto, normalizeTemplateDraftId } from '@/lib/templateStarter';

describe('template starter helpers', () => {
  it('normalizes template draft ids and falls back when the input is empty', () => {
    expect(normalizeTemplateDraftId(' Workflow Starter ', 'fallback')).toBe('workflow_starter');
    expect(normalizeTemplateDraftId('@@@', 'fallback')).toBe('fallback');
  });

  it('builds a starter template dto with controller team and two starter stages', () => {
    const dto = buildStarterTemplateDto({
      id: 'workflow_starter',
      name: 'Workflow Starter',
    });

    expect(dto.type).toBe('workflow_starter');
    expect(dto.defaultTeam).toMatchObject({
      architect: {
        member_kind: 'controller',
        suggested: ['opus'],
      },
    });
    expect(dto.stages).toEqual([
      expect.objectContaining({ id: 'discuss', name: 'Discuss' }),
      expect.objectContaining({ id: 'summarize', name: 'Summarize' }),
    ]);
  });
});
