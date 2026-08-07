<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { Star } from 'lucide-vue-next';
import {
  addApprovedPublisher,
  addFavoriteTemplate,
  listFavoriteTemplates,
  listPendingTemplates,
  listPublicTemplates,
  removeFavoriteTemplate,
  type TemplateSummary,
} from '../api';
import { useSessionStore } from '../stores/session';
import { useUiStore } from '../stores/ui';
import { translate, type TranslationKey } from '../i18n';
import BaseInput from '../components/BaseInput.vue';
import BaseCheckbox from '../components/BaseCheckbox.vue';

const SUPER_PUBLISHER_LOGIN = 'landminentester';

const session = useSessionStore();
const ui = useUiStore();
const t = (key: TranslationKey) => translate(ui.locale, key);

const isSuperPublisher = computed(() => session.twitchUser?.login === SUPER_PUBLISHER_LOGIN);

const activeTab = ref<'browse' | 'pending'>('browse');
const search = ref('');
const favoritesOnly = ref(false);
const templates = ref<TemplateSummary[]>([]);
const pendingTemplates = ref<TemplateSummary[]>([]);
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
async function loadPending() {
  if (!isSuperPublisher.value) return;
  pendingTemplates.value = await listPendingTemplates().catch(() => []);
}

onMounted(async () => {
  await Promise.all([loadTemplates(), loadFavorites(), loadPending()]);
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

async function approvePublisher(loginName: string) {
  try {
    await addApprovedPublisher(loginName);
    await loadPending();
  } catch (err) {
    error.value = (err as Error).message;
  }
}
</script>

<template>
  <section>
    <p class="eyebrow">{{ t('browseTemplates') }}</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <nav v-if="isSuperPublisher" class="subtabs" style="margin-bottom:16px;">
      <a
        href="#"
        :class="{ active: activeTab === 'browse' }"
        @click.prevent="activeTab = 'browse'"
      >{{ t('browseTemplates') }}</a>
      <a
        href="#"
        :class="{ active: activeTab === 'pending' }"
        @click.prevent="activeTab = 'pending'"
      >{{ t('pendingApprovalTab') }} <span v-if="pendingTemplates.length" style="color:var(--accent)">({{ pendingTemplates.length }})</span></a>
    </nav>

    <template v-if="activeTab === 'browse'">
      <p>{{ t('browseTemplatesCopy') }}</p>
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
            <Star :size="15" :fill="favoriteIds.has(template.id) ? 'currentColor' : 'none'" />
          </button>
          <p class="browser-card-title">{{ template.name }}</p>
          <div class="browser-card-meta">
            <span class="browser-card-chip">{{ template.fields.length }} {{ t('taskPoolCount') }}</span>
            <span v-if="template.author" class="browser-card-author">{{ t('by') }} {{ template.author.displayName }}</span>
          </div>
          <ul class="browser-card-tasks">
            <li v-for="field in template.fields.slice(0, 5)" :key="field.id">{{ field.label }}</li>
            <li v-if="template.fields.length > 5" class="browser-card-more">
              +{{ template.fields.length - 5 }} {{ t('taskPoolCount').toLowerCase() }}
            </li>
          </ul>
        </article>
        <p v-if="!visibleTemplates.length" class="muted">{{ t('noPublicTemplates') }}</p>
      </div>
    </template>

    <template v-else-if="activeTab === 'pending'">
      <p class="hint">Vorlagen die auf Admin-Freigabe warten. Kanal freischalten = alle öffentlichen Vorlagen dieses Kanals erscheinen im Browse.</p>
      <div class="pending-list">
        <article v-for="template in pendingTemplates" :key="template.id" class="pending-card">
          <div class="pending-card-info">
            <span class="pending-card-name">{{ template.name }}</span>
            <span class="pending-card-author">von {{ template.author?.displayName ?? template.author?.loginName ?? '–' }}</span>
          </div>
          <button
            v-if="template.author"
            class="button"
            type="button"
            style="font-size:12px;padding:7px 14px;"
            @click="approvePublisher(template.author.loginName)"
          >
            {{ t('approvePublisher') }}
          </button>
        </article>
        <p v-if="!pendingTemplates.length" class="muted">Keine ausstehenden Vorlagen.</p>
      </div>
    </template>
  </section>
</template>
