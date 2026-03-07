import { create } from 'zustand';
import * as api from '@/lib/api';
import { mapTemplateDetailDto, mapTemplateSummaryDto } from '@/lib/dashboardExpansionMappers';
import type { TemplateDetail, TemplateSummary } from '@/types/dashboard';

interface TemplateStore {
  templates: TemplateSummary[];
  selectedTemplateId: string | null;
  selectedTemplate: TemplateDetail | null;
  loading: boolean;
  detailLoading: boolean;
  error: string | null;
  fetchTemplates: () => Promise<'live' | 'error'>;
  selectTemplate: (id: string | null) => Promise<void>;
  clearError: () => void;
}

export const useTemplateStore = create<TemplateStore>()((set) => ({
  templates: [],
  selectedTemplateId: null,
  selectedTemplate: null,
  loading: false,
  detailLoading: false,
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

  clearError: () => set({ error: null }),
}));
