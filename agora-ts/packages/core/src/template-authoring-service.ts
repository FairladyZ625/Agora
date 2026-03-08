import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
import { NotFoundError } from './errors.js';

export interface TemplateAuthoringServiceOptions {
  templatesDir: string;
}

export class TemplateAuthoringService {
  constructor(private readonly options: TemplateAuthoringServiceOptions) {}

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
    const errors = this.validateStages(normalized.stages ?? []);
    return {
      valid: errors.length === 0,
      errors,
      normalized,
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
    const path = this.resolveTemplatePath(templateId);
    if (!existsSync(path)) {
      throw new NotFoundError(`Template ${templateId} not found`);
    }
    return JSON.parse(readFileSync(path, 'utf8')) as TemplateDetailDto;
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
    const targetPath = this.resolveTemplatePath(templateId);
    const tempPath = `${targetPath}.tmp`;
    try {
      writeFileSync(tempPath, `${JSON.stringify(template, null, 2)}\n`);
      renameSync(tempPath, targetPath);
    } finally {
      if (existsSync(tempPath)) {
        unlinkSync(tempPath);
      }
    }
  }

  private resolveTemplatePath(templateId: string) {
    return resolve(this.options.templatesDir, 'tasks', `${templateId}.json`);
  }
}
