import { templateDetailSchema, type TemplateDetailDto } from '@agora-ts/contracts';

export function normalizeTemplateDraftId(rawValue: string, fallback: string) {
  const trimmed = rawValue.trim().toLowerCase();
  const normalized = trimmed
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/__+/g, '_');

  return normalized.length > 0 ? normalized : fallback;
}

export function buildStarterTemplateDto(input: { id: string; name?: string }): TemplateDetailDto {
  return templateDetailSchema.parse({
    type: input.id,
    name: input.name?.trim() || 'Workflow Starter',
    description: '',
    governance: 'standard',
    defaultWorkflow: 'linear',
    defaultTeam: {
      architect: {
        member_kind: 'controller',
        suggested: ['opus'],
      },
    },
    stages: [
      { id: 'discuss', name: 'Discuss', mode: 'discuss' },
      {
        id: 'summarize',
        name: 'Summarize',
        mode: 'discuss',
        gate: { type: 'approval', approver: 'architect' },
      },
    ],
  });
}
