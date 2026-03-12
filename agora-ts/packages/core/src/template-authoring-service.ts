import type {
  DuplicateTemplateRequestDto,
  TemplateDetailDto,
  TemplateStageDto,
  TemplateValidationResponseDto,
  UpdateTemplateWorkflowRequestDto,
  ValidateWorkflowRequestDto,
} from '@agora-ts/contracts';
import {
  templateDetailSchema,
  validateWorkflowRequestSchema,
} from '@agora-ts/contracts';
import { TemplateRepository, type AgoraDatabase } from '@agora-ts/db';
import { NotFoundError } from './errors.js';
import { normalizeTemplateGraph, validateTemplateGraph } from './template-graph-service.js';

export interface TemplateAuthoringServiceOptions {
  templatesDir: string;
  db?: AgoraDatabase;
}

export class TemplateAuthoringService {
  private readonly templateRepository: TemplateRepository | null;

  constructor(private readonly options: TemplateAuthoringServiceOptions) {
    this.templateRepository = options.db ? new TemplateRepository(options.db) : null;
    this.templateRepository?.seedFromDir(options.templatesDir);
    this.templateRepository?.repairMemberKindsFromDir(options.templatesDir);
    this.templateRepository?.repairStageSemanticsFromDir(options.templatesDir);
    this.templateRepository?.repairGraphsFromDir(options.templatesDir);
  }

  validateTemplate(template: TemplateDetailDto): TemplateValidationResponseDto {
    const parsed = templateDetailSchema.safeParse(template);
    if (!parsed.success) {
      return {
        valid: false,
        errors: parsed.error.issues.map((issue) => issue.message),
        normalized: null,
      };
    }

    const normalized = parsed.data;
    const graphNormalized = normalizeTemplateGraph(normalized);
    const errors = [
      ...this.validateStages(graphNormalized.stages ?? []),
      ...validateTemplateGraph(graphNormalized.graph!),
    ];
    return {
      valid: errors.length === 0,
      errors,
      normalized: graphNormalized,
    };
  }

  validateWorkflow(input: ValidateWorkflowRequestDto): TemplateValidationResponseDto {
    const parsed = validateWorkflowRequestSchema.safeParse(input);
    if (!parsed.success) {
      return {
        valid: false,
        errors: parsed.error.issues.map((issue) => issue.message),
        normalized: null,
      };
    }
    return this.validateTemplate({
      name: 'workflow',
      type: 'workflow',
      stages: parsed.data.stages,
      defaultWorkflow: parsed.data.defaultWorkflow,
    });
  }

  saveTemplate(templateId: string, template: TemplateDetailDto) {
    const normalizedTemplate = {
      ...template,
      type: templateId,
    } satisfies TemplateDetailDto;
    const validation = this.validateTemplate(normalizedTemplate);
    if (!validation.valid || !validation.normalized) {
      throw new Error(validation.errors.join('; '));
    }
    this.writeTemplate(templateId, validation.normalized);
    return {
      id: templateId,
      saved: true,
      template: validation.normalized,
    };
  }

  updateTemplateWorkflow(templateId: string, workflow: UpdateTemplateWorkflowRequestDto) {
    const existing = this.getTemplate(templateId);
    return this.saveTemplate(templateId, {
      ...existing,
      defaultWorkflow: workflow.defaultWorkflow ?? existing.defaultWorkflow,
      stages: workflow.stages,
    });
  }

  duplicateTemplate(templateId: string, input: DuplicateTemplateRequestDto) {
    const existing = this.getTemplate(templateId);
    const duplicated = this.saveTemplate(input.new_id, {
      ...existing,
      name: input.name ?? `${existing.name} Copy`,
      type: input.new_id,
    });
    return {
      id: duplicated.id,
      template: duplicated.template,
    };
  }

  getTemplate(templateId: string): TemplateDetailDto {
    const stored = this.templateRepository?.getTemplate(templateId);
    if (stored) {
      return normalizeTemplateGraph(stored.template);
    }
    throw new NotFoundError(`Template ${templateId} not found`);
  }

  private validateStages(stages: TemplateStageDto[]): string[] {
    if (stages.length === 0) {
      return ['template must include at least one stage'];
    }
    const seen = new Set<string>();
    const errors: string[] = [];
    for (const stage of stages) {
      if (!stage.id || stage.id.trim().length === 0) {
        errors.push('stage id is required');
        continue;
      }
      if (seen.has(stage.id)) {
        errors.push(`duplicate stage id: ${stage.id}`);
        continue;
      }
      seen.add(stage.id);
    }
    return errors;
  }

  private writeTemplate(templateId: string, template: TemplateDetailDto) {
    if (!this.templateRepository) {
      throw new Error('TemplateAuthoringService requires a database-backed template repository');
    }
    this.templateRepository.saveTemplate(templateId, template, 'user');
  }
}
