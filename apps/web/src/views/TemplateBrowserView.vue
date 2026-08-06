<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import {
  addApprovedPublisher,
  addFavoriteTemplate,
  listApprovedPublishers,
  listFavoriteTemplates,
  listPublicTemplates,
  removeApprovedPublisher,
  removeFavoriteTemplate,
  type ApprovedPublisher,
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

const search = ref('');
const favoritesOnly = ref(false);
const templates = ref<TemplateSummary[]>([]);
const favoriteIds = ref<Set<string>>(new Set());
const error = ref('');

const publishers = ref<ApprovedPublisher[]>([]);
const newPublisherLogin = ref('');
const isSuperPublisher = computed(() => session.twitchUser?.login === SUPER_PUBLISHER_LOGIN);

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
async function loadPublishers() {
  if (!isSuperPublisher.value) return;
  publishers.value = await listApprovedPublishers().catch(() => []);
}

onMounted(async () => {
  await Promise.all([loadTemplates(), loadFavorites(), loadPublishers()]);
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

async function addPublisher() {
  if (!newPublisherLogin.value.trim()) return;
  try {
    await addApprovedPublisher(newPublisherLogin.value.trim());
    newPublisherLogin.value = '';
    await loadPublishers();
  } catch (err) {
    error.value = (err as Error).message;
  }
}
async function removePublisher(id: string) {
  try {
    await removeApprovedPublisher(id);
    await loadPublishers();
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

    <div v-if="isSuperPublisher" class="publisher-manage">
      <b>{{ t('publishersManageTitle') }}</b>
      <p class="hint">{{ t('publishersManageCopy') }}</p>
      <form class="publisher-manage-form" @submit.prevent="addPublisher">
        <BaseInput
          v-model="newPublisherLogin"
          :label="t('channelLoginPlaceholder')"
          hide-label
          :placeholder="t('channelLoginPlaceholder')"
        />
        <button type="submit" class="button">{{ t('addChannel') }}</button>
      </form>
      <ul class="publisher-list">
        <li v-for="publisher in publishers" :key="publisher.id">
          <span>{{ publisher.loginName }}</span>
          <button class="icon-button danger" type="button" @click="removePublisher(publisher.id)">
            {{ t('removeChannel') }}
          </button>
        </li>
      </ul>
    </div>

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
        <b>{{ template.name }}</b>
        <small
          >{{ template.fields.length }} {{ t('taskPoolCount') }}<template v-if="template.author">
            · {{ t('by') }} {{ template.author.displayName }}</template
          ></small
        >
      </article>
      <p v-if="!visibleTemplates.length" class="muted">{{ t('noPublicTemplates') }}</p>
    </div>
  </section>
</template>
