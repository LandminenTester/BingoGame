<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useTemplatesStore } from '../stores/templates';
import { useUiStore } from '../stores/ui';
import { translate, type TranslationKey } from '../i18n';
import BaseInput from '../components/BaseInput.vue';
import BaseSelect from '../components/BaseSelect.vue';
import BaseButton from '../components/BaseButton.vue';
import BaseModal from '../components/BaseModal.vue';
import type { TemplateSummary } from '../api';

const TASK_MIN = 25;
const TASK_MAX = 50;

const templates = useTemplatesStore();
const ui = useUiStore();
const route = useRoute();
const t = (key: TranslationKey) => translate(ui.locale, key);

const blankFields = () => Array.from({ length: TASK_MIN }, (_, index) => `Aufgabe ${index + 1}`);
const name = ref('');
const visibility = ref<'private' | 'public' | 'unlisted'>('private');
const fields = ref(blankFields());
const error = ref('');
const pendingDelete = ref<TemplateSummary | null>(null);

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
    const input = { name: name.value, visibility: visibility.value, fields: fields.value };
    if (templates.selectedId) await templates.update(templates.selectedId, input);
    else await templates.create(input);
    resetForm();
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
    error.value = (err as Error).message;
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
            :class="{ active: templates.selectedId === template.id }"
            @click="loadTemplate(template)"
          >
            <b>{{ template.name }}</b>
            <small>{{ template.visibility }} · {{ template.fields.length }} {{ t('taskPoolCount') }}</small>
            <span class="template-item-actions">
              <button class="icon-button" type="button" @click.stop="loadTemplate(template)">
                {{ t('edit') }}
              </button>
              <button class="icon-button danger" type="button" @click.stop="requestDelete(template)">
                {{ t('delete') }}
              </button>
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
          <div class="task-pool-list">
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
                ×
              </button>
            </div>
          </div>
          <button
            v-if="fields.length < TASK_MAX"
            type="button"
            class="icon-button"
            @click="addTaskRow"
          >
            + {{ t('addTaskRow') }}
          </button>
          <p class="hint">{{ t('taskPoolHint') }}</p>
          <BaseButton type="submit" wide>{{ t('saveTemplate') }}</BaseButton>
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
  </template>
  <RouterView v-else />
</template>
