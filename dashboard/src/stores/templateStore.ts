import { create } from 'zustand';
import * as api from '@/lib/api';
import { mapTemplateDetailDto, mapTemplateDetailToDto, mapTemplateSummaryDto } from '@/lib/dashboardExpansionMappers';
import type { TemplateDetail, TemplateSummary } from '@/types/dashboard';

interface TemplateStore {
  templates: TemplateSummary[];
  selectedTemplateId: string | null;
  selectedTemplate: TemplateDetail | null;
  loading: boolean;
  detailLoading: boolean;
  saving: boolean;
  validationResult: { valid: boolean; errors: string[] } | null;
  error: string | null;
  fetchTemplates: () => Promise<'live' | 'error'>;
  selectTemplate: (id: string | null) => Promise<void>;
  saveSelectedTemplate: (template: TemplateDetail) => Promise<'live' | 'error'>;
  validateSelectedTemplate: (template: TemplateDetail) => Promise<'live' | 'error'>;
  duplicateSelectedTemplate: (input: { templateId: string; newId: string; name?: string }) => Promise<'live' | 'error'>;
  clearError: () => void;
}

export const useTemplateStore = create<TemplateStore>()((set) => ({
  templates: [],
  selectedTemplateId: null,
  selectedTemplate: null,
  loading: false,
  detailLoading: false,
  saving: false,
  validationResult: null,
  error: null,

  fetchTemplates: async () => {
    set({ loading: true, error: null });
    try {
      const templates = (await api.listTemplates()).map(mapTemplateSummaryDto);
      set({ templates, loading: false });
      return 'live';
    } catch (error) {
      set({
        templates: [],
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return 'error';
    }
  },

  selectTemplate: async (id) => {
    if (!id) {
      set({ selectedTemplateId: null, selectedTemplate: null });
      return;
    }
    set({ selectedTemplateId: id, detailLoading: true, error: null });
    try {
      const selectedTemplate = mapTemplateDetailDto(id, await api.getTemplate(id));
      set({ selectedTemplate, detailLoading: false });
    } catch (error) {
      set({
        selectedTemplate: null,
        detailLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  saveSelectedTemplate: async (template) => {
    set({ saving: true, error: null });
    try {
      const response = await api.updateTemplate(template.id, mapTemplateDetailToDto(template));
      const selectedTemplate = mapTemplateDetailDto(response.id, response.template);
      set((state) => ({
        selectedTemplate,
        saving: false,
        templates: state.templates.map((item) => (
          item.id === response.id
            ? {
                ...item,
                name: selectedTemplate.name,
                type: selectedTemplate.type,
                description: selectedTemplate.description,
                governance: selectedTemplate.governance,
                stageCount: selectedTemplate.stageCount,
                stageCountLabel: `${selectedTemplate.stageCount} stages`,
              }
            : item
        )),
      }));
      return 'live';
    } catch (error) {
      set({
        saving: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return 'error';
    }
  },

  validateSelectedTemplate: async (template) => {
    set({ error: null, validationResult: null });
    try {
      const dto = mapTemplateDetailToDto(template);
      const result = await api.validateWorkflow({
        defaultWorkflow: dto.defaultWorkflow,
        stages: dto.stages ?? [],
      });
      set({
        validationResult: {
          valid: result.valid,
          errors: result.errors,
        },
      });
      return 'live';
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
      });
      return 'error';
    }
  },

  duplicateSelectedTemplate: async ({ templateId, newId, name }) => {
    set({ error: null });
    try {
      const response = await api.duplicateTemplate(templateId, {
        new_id: newId,
        ...(name ? { name } : {}),
      });
      const selectedTemplate = mapTemplateDetailDto(response.id, response.template);
      set((state) => ({
        selectedTemplateId: response.id,
        selectedTemplate,
        templates: [
          ...state.templates.filter((item) => item.id !== response.id),
          {
            id: response.id,
            name: selectedTemplate.name,
            type: selectedTemplate.type,
            description: selectedTemplate.description,
            governance: selectedTemplate.governance,
            stageCount: selectedTemplate.stageCount,
            stageCountLabel: `${selectedTemplate.stageCount} stages`,
          },
        ],
      }));
      return 'live';
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
      });
      return 'error';
    }
  },

  clearError: () => set({ error: null }),
}));
