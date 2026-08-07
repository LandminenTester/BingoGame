<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { Star, X } from '@lucide/vue';
import {
  addApprovedPublisher,
  addFavoriteTemplate,
  duplicateTemplate,
  getTemplate,
  listFavoriteTemplates,
  listPendingTemplates,
  listPublicTemplates,
  removeFavoriteTemplate,
  removeVoteTemplate,
  voteTemplate,
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
const activeGame = ref('');
const templates = ref<TemplateSummary[]>([]);
const pendingTemplates = ref<TemplateSummary[]>([]);
const favoriteIds = ref<Set<string>>(new Set());
const error = ref('');

const selectedTemplate = ref<TemplateSummary | null>(null);
const addedNotice = ref('');

const allGames = computed(() => {
  const games = templates.value.map((t) => t.game).filter((g): g is string => Boolean(g));
  return [...new Set(games)].sort();
});

const visibleTemplates = computed(() => {
  let list = templates.value;
  if (favoritesOnly.value) list = list.filter((t) => favoriteIds.value.has(t.id));
  if (activeGame.value) list = list.filter((t) => t.game === activeGame.value);
  return list;
});

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
  favoriteIds.value = new Set(favorites.map((t) => t.id));
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

async function openCard(template: TemplateSummary) {
  try {
    const detail = await getTemplate(template.id);
    selectedTemplate.value = { ...template, ...detail };
    addedNotice.value = '';
  } catch (err) {
    error.value = (err as Error).message;
  }
}

async function addToMyTemplates() {
  if (!selectedTemplate.value) return;
  try {
    await duplicateTemplate(selectedTemplate.value.id);
    addedNotice.value = t('addedToMyTemplates');
  } catch (err) {
    error.value = (err as Error).message;
  }
}

async function vote(template: TemplateSummary, value: 1 | -1) {
  if (!session.twitchUser) return;
  try {
    if (template.myVote === value) {
      await removeVoteTemplate(template.id);
      template.myVote = null;
      if (value === 1) template.upvotes = (template.upvotes ?? 0) - 1;
      else template.downvotes = (template.downvotes ?? 0) - 1;
    } else {
      await voteTemplate(template.id, value);
      if (template.myVote === 1) template.upvotes = (template.upvotes ?? 1) - 1;
      if (template.myVote === -1) template.downvotes = (template.downvotes ?? 1) - 1;
      template.myVote = value;
      if (value === 1) template.upvotes = (template.upvotes ?? 0) + 1;
      else template.downvotes = (template.downvotes ?? 0) + 1;
    }
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
      <a href="#" :class="{ active: activeTab === 'browse' }" @click.prevent="activeTab = 'browse'">{{ t('browseTemplates') }}</a>
      <a href="#" :class="{ active: activeTab === 'pending' }" @click.prevent="activeTab = 'pending'">
        {{ t('pendingApprovalTab') }}
        <span v-if="pendingTemplates.length" style="color:var(--accent)">({{ pendingTemplates.length }})</span>
      </a>
    </nav>

    <template v-if="activeTab === 'browse'">
      <p>{{ t('browseTemplatesCopy') }}</p>
      <div class="browser-toolbar">
        <BaseInput v-model="search" :label="t('searchPublicTemplates')" hide-label :placeholder="t('searchPublicTemplates')" />
        <BaseCheckbox v-model="favoritesOnly" :label="t('favoritesOnly')" />
      </div>

      <div v-if="allGames.length" class="game-filter-chips">
        <button
          :class="['game-chip', { active: !activeGame }]"
          type="button"
          @click="activeGame = ''"
        >{{ t('gameFilterAll') }}</button>
        <button
          v-for="g in allGames"
          :key="g"
          :class="['game-chip', { active: activeGame === g }]"
          type="button"
          @click="activeGame = activeGame === g ? '' : g"
        >{{ g }}</button>
      </div>

      <div class="template-browser-grid">
        <article
          v-for="template in visibleTemplates"
          :key="template.id"
          class="browser-card"
          @click="openCard(template)"
        >
          <button
            v-if="session.twitchUser"
            type="button"
            class="browser-card-fav"
            :class="{ active: favoriteIds.has(template.id) }"
            :aria-label="favoriteIds.has(template.id) ? t('unfavorite') : t('favorite')"
            @click.stop="toggleFavorite(template)"
          >
            <Star :size="15" :fill="favoriteIds.has(template.id) ? 'currentColor' : 'none'" />
          </button>
          <p class="browser-card-title">{{ template.name }}</p>
          <div class="browser-card-meta">
            <span class="browser-card-chip">{{ template.fields.length }} {{ t('taskPoolCount') }}</span>
            <span v-if="template.game" class="browser-card-chip">{{ template.game }}</span>
            <span v-if="template.author" class="browser-card-author">{{ t('by') }} {{ template.author.displayName }}</span>
          </div>
          <ul class="browser-card-tasks">
            <li v-for="field in template.fields.slice(0, 5)" :key="field.id">{{ field.label }}</li>
            <li v-if="template.fields.length > 5" class="browser-card-more">
              +{{ template.fields.length - 5 }} {{ t('taskPoolCount').toLowerCase() }}
            </li>
          </ul>
          <div class="vote-row" @click.stop>
            <button
              :class="['vote-btn', 'up', { active: template.myVote === 1 }]"
              type="button"
              :disabled="!session.twitchUser"
              :title="session.twitchUser ? undefined : t('twitchLoginRequired')"
              @click.stop="vote(template, 1)"
            >▲ {{ template.upvotes ?? 0 }}</button>
            <button
              :class="['vote-btn', 'down', { active: template.myVote === -1 }]"
              type="button"
              :disabled="!session.twitchUser"
              :title="session.twitchUser ? undefined : t('twitchLoginRequired')"
              @click.stop="vote(template, -1)"
            >▼ {{ template.downvotes ?? 0 }}</button>
          </div>
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
          >{{ t('approvePublisher') }}</button>
        </article>
        <p v-if="!pendingTemplates.length" class="muted">Keine ausstehenden Vorlagen.</p>
      </div>
    </template>

    <!-- Template Detail Modal -->
    <div v-if="selectedTemplate" class="modal-backdrop" @click.self="selectedTemplate = null">
      <div class="modal browser-card-detail-modal" role="dialog" aria-modal="true">
        <div class="modal-header">
          <h2>{{ selectedTemplate.name }}</h2>
          <button type="button" class="icon-button" :aria-label="t('closeModal')" @click="selectedTemplate = null">
            <X :size="18" />
          </button>
        </div>
        <div class="browser-card-meta">
          <span class="browser-card-chip">{{ selectedTemplate.fields.length }} {{ t('taskPoolCount') }}</span>
          <span v-if="selectedTemplate.game" class="browser-card-chip">{{ selectedTemplate.game }}</span>
          <span v-if="selectedTemplate.author" class="browser-card-author">{{ t('by') }} {{ selectedTemplate.author.displayName }}</span>
        </div>
        <ul class="task-list">
          <li v-for="(field, idx) in selectedTemplate.fields" :key="field.id">
            <span class="task-num">{{ idx + 1 }}</span>
            {{ field.label }}
          </li>
        </ul>
        <p v-if="addedNotice" class="hint">{{ addedNotice }}</p>
        <div class="browser-card-detail-actions">
          <button
            v-if="session.twitchUser && !addedNotice"
            type="button"
            class="button"
            @click="addToMyTemplates"
          >{{ t('addToMyTemplates') }}</button>
          <button type="button" class="button secondary" @click="selectedTemplate = null">{{ t('closeModal') }}</button>
        </div>
      </div>
    </div>
  </section>
</template>
