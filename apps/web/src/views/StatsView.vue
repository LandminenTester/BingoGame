<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { getStatistics, resetStatistics, type ChannelStatistics } from '../api';
import { useSessionStore } from '../stores/session';
import { useUiStore } from '../stores/ui';
import { translate, type TranslationKey } from '../i18n';

const session = useSessionStore();
const ui = useUiStore();
const t = (key: TranslationKey) => translate(ui.locale, key);
const statistics = ref<ChannelStatistics | null>(null);
const error = ref('');

onMounted(async () => {
  if (session.twitchUser) statistics.value = await getStatistics(session.twitchUser.id).catch(() => null);
});

async function clear() {
  if (!window.confirm('Alle gehosteten Sessions und Statistiken wirklich löschen?')) return;
  try {
    await resetStatistics();
    statistics.value = { totalSessions: 0, totalParticipants: 0, completedCards: 0 };
  } catch (err) {
    error.value = (err as Error).message;
  }
}
</script>

<template>
  <div>
    <p>{{ t('statsCopy') }}</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <div class="stat-grid">
      <article>
        <b>{{ statistics?.totalSessions ?? 0 }}</b>
        <span>{{ t('sessions') }}</span>
      </article>
      <article>
        <b>{{ statistics?.totalParticipants ?? 0 }}</b>
        <span>{{ t('participantsLabel') }}</span>
      </article>
      <article>
        <b>{{ statistics?.completedCards ?? 0 }}</b>
        <span>{{ t('completedCards') }}</span>
      </article>
    </div>
    <button class="button secondary" type="button" @click="clear">{{ t('resetStatistics') }}</button>
  </div>
</template>
