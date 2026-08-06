<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useTemplatesStore } from '../stores/templates';
import { useUiStore } from '../stores/ui';
import { translate, type TranslationKey } from '../i18n';
import BaseInput from '../components/BaseInput.vue';
import BaseSelect from '../components/BaseSelect.vue';
import BaseButton from '../components/BaseButton.vue';
import type { TemplateSummary } from '../api';

const templates = useTemplatesStore();
const ui = useUiStore();
const t = (key: TranslationKey) => translate(ui.locale, key);

const blankFields = () => Array.from({ length: 25 }, (_, index) => `Aufgabe ${index + 1}`);
const name = ref('');
const visibility = ref<'private' | 'public' | 'unlisted'>('private');
const fields = ref(blankFields());
const error = ref('');

onMounted(() => templates.fetchAll());

function resetForm() {
  templates.select(null);
  name.value = '';
  visibility.value = 'private';
  fields.value = blankFields();
  error.value = '';
}

function loadTemplate(template: TemplateSummary) {
  templates.select(template.id);
  name.value = template.name;
  visibility.value = template.visibility as 'private' | 'public' | 'unlisted';
  fields.value = template.fields.map((field) => field.label);
  error.value = '';
}

async function submit() {
  try {
    const input = { name: name.value, visibility: visibility.value, fields: fields.value };
    if (templates.selectedId) await templates.update(templates.selectedId, input);
    else await templates.create(input);
    resetForm();
  } catch (err) {
    error.value = (err as Error).message;
  }
}

async function remove(template: TemplateSummary) {
  if (!window.confirm(`Vorlage „${template.name}“ wirklich löschen?`)) return;
  try {
    const wasSelected = templates.selectedId === template.id;
    await templates.remove(template.id);
    if (wasSelected) resetForm();
  } catch (err) {
    error.value = (err as Error).message;
  }
}
</script>

<template>
  <section class="templates-layout">
    <aside class="templates-list-pane">
      <div class="section-label">
        <span>{{ t('templates') }}</span>
      </div>
      <button class="button wide" type="button" @click="resetForm">{{ t('newTemplate') }}</button>
      <div class="template-list">
        <article
          v-for="template in templates.items"
          :key="template.id"
          class="template-item"
          :class="{ active: templates.selectedId === template.id }"
          @click="loadTemplate(template)"
        >
          <b>{{ template.name }}</b>
          <small>{{ template.visibility }} · {{ template.fields.length }}/25</small>
          <span class="template-actions">
            <button class="link" type="button" @click.stop="remove(template)">{{ t('delete') }}</button>
          </span>
        </article>
        <p v-if="!templates.items.length" class="muted">{{ t('noTemplates') }}</p>
      </div>
    </aside>
    <div class="template-editor">
      <p class="eyebrow">{{ t('templateCopy') }}</p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <form class="builder-form" @submit.prevent="submit">
        <BaseInput v-model="name" :label="t('templateName')" required maxlength="100" />
        <BaseSelect
          v-model="visibility"
          :label="t('templateVisibility')"
          :options="[
            { value: 'private', label: t('private') },
            { value: 'public', label: t('public') },
            { value: 'unlisted', label: t('unlisted') },
          ]"
        />
        <div class="field-grid">
          <label v-for="(_, index) in fields" :key="index">
            <span>{{ index + 1 }}</span>
            <input v-model="fields[index]" required maxlength="160" />
          </label>
        </div>
        <BaseButton type="submit" wide>{{ t('saveTemplate') }}</BaseButton>
      </form>
    </div>
  </section>
</template>
