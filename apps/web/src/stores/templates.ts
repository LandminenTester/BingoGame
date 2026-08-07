import { defineStore } from 'pinia';
import {
  createTemplate,
  deleteTemplate,
  listTemplates,
  updateTemplate,
  type TemplateSummary,
} from '../api';

export interface TemplateFormInput {
  name: string;
  fields: string[];
  visibility: 'private' | 'public' | 'unlisted';
  game?: string;
}

export const useTemplatesStore = defineStore('templates', {
  state: () => ({
    items: [] as TemplateSummary[],
    selectedId: null as string | null,
    loading: false,
    error: '',
  }),
  actions: {
    async fetchAll() {
      this.loading = true;
      try {
        this.items = await listTemplates();
        this.error = '';
      } catch (error) {
        this.error = (error as Error).message;
      } finally {
        this.loading = false;
      }
    },
    select(id: string | null) {
      this.selectedId = id;
    },
    async create(input: TemplateFormInput) {
      const created = await createTemplate(input);
      await this.fetchAll();
      return created;
    },
    async update(id: string, input: TemplateFormInput) {
      const updated = await updateTemplate(id, input);
      await this.fetchAll();
      return updated;
    },
    async remove(id: string) {
      await deleteTemplate(id);
      if (this.selectedId === id) this.selectedId = null;
      await this.fetchAll();
    },
  },
});
