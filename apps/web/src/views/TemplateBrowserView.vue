<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import {
  addFavoriteTemplate,
  listFavoriteTemplates,
  listPublicTemplates,
  removeFavoriteTemplate,
  type TemplateSummary,
} from '../api';
import { useSessionStore } from '../stores/session';
import { useUiStore } from '../stores/ui';
import { translate, type TranslationKey } from '../i18n';
import BaseInput from '../components/BaseInput.vue';
import BaseCheckbox from '../components/BaseCheckbox.vue';

const session = useSessionStore();
const ui = useUiStore();
const t = (key: TranslationKey) => translate(ui.locale, key);

const search = ref('');
const favoritesOnly = ref(false);
const templates = ref<TemplateSummary[]>([]);
const favoriteIds = ref<Set<string>>(new Set());
const error = ref('');

const visibleTemplates = computed(() =>
  favoritesOnly.value
    ? templates.value.filter((template) => favoriteIds.value.has(template.id))
    : templates.value,
);

async function loadTemplates() {
  try {
    templates.value = await listPublicTemplates(search.value || undefined);
    error.value = '';
  } catch (err) {
    error.value = (err as Error).message;
  }
}
async function loadFavorites() {
  if (!session.twitchUser) return;
  const favorites = await listFavoriteTemplates().catch(() => []);
  favoriteIds.value = new Set(favorites.map((template) => template.id));
}

onMounted(async () => {
  await Promise.all([loadTemplates(), loadFavorites()]);
});

let searchTimer: number | undefined;
watch(search, () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(loadTemplates, 250);
});

async function toggleFavorite(template: TemplateSummary) {
  if (!session.twitchUser) return;
  try {
    if (favoriteIds.value.has(template.id)) {
      await removeFavoriteTemplate(template.id);
      favoriteIds.value.delete(template.id);
    } else {
      await addFavoriteTemplate(template.id);
      favoriteIds.value.add(template.id);
    }
    favoriteIds.value = new Set(favoriteIds.value);
  } catch (err) {
    error.value = (err as Error).message;
  }
}
</script>

<template>
  <section>
    <p class="eyebrow">{{ t('browseTemplates') }}</p>
    <p>{{ t('browseTemplatesCopy') }}</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <div class="browser-toolbar">
      <BaseInput
        v-model="search"
        :label="t('searchPublicTemplates')"
        hide-label
        :placeholder="t('searchPublicTemplates')"
      />
      <BaseCheckbox v-model="favoritesOnly" :label="t('favoritesOnly')" />
    </div>

    <div class="template-browser-grid">
      <article v-for="template in visibleTemplates" :key="template.id" class="browser-card">
        <button
          v-if="session.twitchUser"
          type="button"
          class="browser-card-fav"
          :class="{ active: favoriteIds.has(template.id) }"
          :aria-label="favoriteIds.has(template.id) ? t('unfavorite') : t('favorite')"
          @click="toggleFavorite(template)"
        >
          {{ favoriteIds.has(template.id) ? '★' : '☆' }}
        </button>
        <p class="browser-card-title">{{ template.name }}</p>
        <div class="browser-card-meta">
          <span class="browser-card-chip">{{ template.fields.length }} {{ t('taskPoolCount') }}</span>
          <span v-if="template.author" class="browser-card-author">{{ t('by') }} {{ template.author.displayName }}</span>
        </div>
      </article>
      <p v-if="!visibleTemplates.length" class="muted">{{ t('noPublicTemplates') }}</p>
    </div>
  </section>
</template>
