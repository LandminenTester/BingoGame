<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useTemplatesStore } from '../stores/templates';
import { useUiStore } from '../stores/ui';
import { translate, type TranslationKey } from '../i18n';
import { Pencil, Trash2, X, Plus } from '@lucide/vue';
import BaseInput from '../components/BaseInput.vue';
import BaseButton from '../components/BaseButton.vue';
import BaseModal from '../components/BaseModal.vue';
import type { TemplateSummary } from '../api';

const TASK_MIN = 25;
const TASK_MAX = 50;

const VISIBILITY_LABELS: Record<string, string> = {
  private: 'Privat',
  public: 'Vorbehalt',
  unlisted: 'Ungelistet',
  predefined: 'Vorgabe',
};
function visibilityLabel(v: string) {
  return VISIBILITY_LABELS[v] ?? v;
}

const templates = useTemplatesStore();
const ui = useUiStore();
const route = useRoute();
const t = (key: TranslationKey) => translate(ui.locale, key);

const blankFields = () => Array.from({ length: TASK_MIN }, (_, index) => `Aufgabe ${index + 1}`);
const name = ref('');
const currentTemplateVisibility = ref<string>('private');
const showPublishModal = ref(false);
const fields = ref(blankFields());
const error = ref('');
const pendingDelete = ref<TemplateSummary | null>(null);

onMounted(() => templates.fetchAll());

function resetForm() {
  templates.select(null);
  name.value = '';
  currentTemplateVisibility.value = 'private';
  fields.value = blankFields();
  error.value = '';
}

function loadTemplate(template: TemplateSummary) {
  templates.select(template.id);
  name.value = template.name;
  currentTemplateVisibility.value = template.visibility;
  fields.value = template.fields.map((field) => field.label);
  error.value = '';
}

function addTaskRow() {
  if (fields.value.length >= TASK_MAX) return;
  fields.value.push('');
}
function removeTaskRow(index: number) {
  if (fields.value.length <= TASK_MIN) return;
  fields.value.splice(index, 1);
}

async function submit() {
  try {
    const vis = (currentTemplateVisibility.value || 'private') as 'private' | 'public' | 'unlisted';
    const input = { name: name.value, visibility: vis, fields: fields.value };
    const result = templates.selectedId
      ? await templates.update(templates.selectedId, input)
      : await templates.create(input);
    loadTemplate(result);
    error.value = '';
  } catch (err) {
    error.value = (err as Error).message;
  }
}

async function confirmPublish() {
  showPublishModal.value = false;
  if (!templates.selectedId) return;
  try {
    const result = await templates.update(templates.selectedId, {
      name: name.value,
      visibility: 'public',
      fields: fields.value,
    });
    loadTemplate(result);
    error.value = '';
  } catch (err) {
    error.value = (err as Error).message;
  }
}

function requestDelete(template: TemplateSummary) {
  pendingDelete.value = template;
}
async function confirmDelete() {
  const template = pendingDelete.value;
  pendingDelete.value = null;
  if (!template) return;
  try {
    const wasSelected = templates.selectedId === template.id;
    await templates.remove(template.id);
    if (wasSelected) resetForm();
  } catch (err) {
    const msg = (err as Error).message;
    error.value = msg.includes('not found') || msg.includes('forbidden')
      ? t('errorCannotDeleteTemplate')
      : msg;
  }
}
</script>

<template>
  <nav class="subtabs templates-subtabs">
    <RouterLink :to="{ name: 'templates' }" :class="{ active: route.name === 'templates' }">{{
      t('myTemplates')
    }}</RouterLink>
    <RouterLink :to="{ name: 'templates-browse' }" :class="{ active: route.name === 'templates-browse' }">{{
      t('browseTemplates')
    }}</RouterLink>
  </nav>
  <template v-if="route.name === 'templates'">
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
            :class="['tpl-vis--' + template.visibility, { active: templates.selectedId === template.id }]"
            @click="loadTemplate(template)"
          >
            <span class="template-item-name">{{ template.name }}</span>
            <span :class="['visibility-badge', template.visibility]">{{ visibilityLabel(template.visibility) }}</span>
            <span class="template-item-actions">
              <button class="tpl-btn" type="button" :title="t('edit')" @click.stop="loadTemplate(template)"><Pencil :size="14" /></button>
              <button v-if="template.visibility !== 'predefined'" class="tpl-btn tpl-btn--danger" type="button" :title="t('delete')" @click.stop="requestDelete(template)"><Trash2 :size="14" /></button>
            </span>
          </article>
          <p v-if="!templates.items.length" class="muted">{{ t('noTemplates') }}</p>
        </div>
      </aside>
      <div class="template-editor">
        <div class="template-editor-header">
          <p class="template-editor-copy">{{ t('templateCopy') }}</p>
          <div class="template-editor-actions">
            <button
              v-if="templates.selectedId && currentTemplateVisibility === 'private'"
              type="button"
              class="button button--publish"
              @click="showPublishModal = true"
            >{{ t('publishTemplate') }}</button>
            <BaseButton type="submit" form="template-form">{{ t('saveTemplate') }}</BaseButton>
          </div>
        </div>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <form id="template-form" class="builder-form" @submit.prevent="submit">
          <BaseInput v-model="name" :label="t('templateName')" required maxlength="100" />
          <div class="task-pool-grid">
            <div v-for="(_, index) in fields" :key="index" class="task-pool-row">
              <span class="task-pool-index">{{ index + 1 }}</span>
              <BaseInput v-model="fields[index]" required maxlength="160" />
              <button
                v-if="fields.length > TASK_MIN"
                type="button"
                class="task-pool-remove"
                :aria-label="t('removeTaskRow')"
                @click="removeTaskRow(index)"
              >
                <X :size="12" />
              </button>
            </div>
          </div>
          <button
            v-if="fields.length < TASK_MAX"
            type="button"
            class="icon-button"
            @click="addTaskRow"
          >
            <Plus :size="12" /> {{ t('addTaskRow') }}
          </button>
          <p class="hint">{{ t('taskPoolHint') }}</p>
        </form>
      </div>
    </section>
    <BaseModal
      v-if="pendingDelete"
      :title="t('confirmDeleteTemplateTitle')"
      :body="t('confirmDeleteTemplateBody')"
      :cancel-label="t('cancel')"
      :confirm-label="t('delete')"
      danger
      @cancel="pendingDelete = null"
      @confirm="confirmDelete"
    />
    <BaseModal
      v-if="showPublishModal"
      :title="t('publicModalTitle')"
      :body="t('publicModalBody')"
      :cancel-label="t('cancel')"
      :confirm-label="t('publishTemplate')"
      @cancel="showPublishModal = false"
      @confirm="confirmPublish"
    />
  </template>
  <RouterView v-else />
</template>
