<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import { getHistory, type HistoryLobby } from '../api';
import { useSessionStore } from '../stores/session';
import { useUiStore } from '../stores/ui';
import { translate, type TranslationKey } from '../i18n';

const session = useSessionStore();
const ui = useUiStore();
const route = useRoute();
const t = (key: TranslationKey) => translate(ui.locale, key);
const history = ref<HistoryLobby[]>([]);

onMounted(async () => {
  if (session.twitchUser) history.value = await getHistory(session.twitchUser.id).catch(() => []);
});
</script>

<template>
  <section class="view-panel">
    <nav class="subtabs">
      <RouterLink :to="{ name: 'history' }" :class="{ active: route.name === 'history' }">{{
        t('history')
      }}</RouterLink>
      <RouterLink :to="{ name: 'stats' }" :class="{ active: route.name === 'stats' }">{{
        t('stats')
      }}</RouterLink>
    </nav>
    <template v-if="route.name === 'history'">
      <p class="eyebrow">{{ t('history') }}</p>
      <p>{{ t('historyCopy') }}</p>
      <div class="management-list">
        <article v-for="entry in history" :key="entry.id">
          <b>{{ entry.name }}</b>
          <small
            >{{ entry.code }} · {{ entry.status }} · {{ entry._count.participants }}
            {{ t('participantsLabel') }} · {{ entry.results.length }} {{ t('completedCards') }}</small
          >
        </article>
        <p v-if="!history.length" class="muted">{{ t('noHostedSessions') }}</p>
      </div>
    </template>
    <RouterView v-else />
  </section>
</template>
