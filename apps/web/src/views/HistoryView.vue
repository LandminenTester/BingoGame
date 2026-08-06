<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import { getHistory, setLobbyStatus, type HistoryLobby } from '../api';
import { useSessionStore } from '../stores/session';
import { useUiStore } from '../stores/ui';
import { translate, type TranslationKey } from '../i18n';
import BaseModal from '../components/BaseModal.vue';

const ACTIVE_STATUSES = new Set(['draft', 'open', 'running', 'paused']);

const session = useSessionStore();
const ui = useUiStore();
const route = useRoute();
const t = (key: TranslationKey) => translate(ui.locale, key);
const history = ref<HistoryLobby[]>([]);
const expanded = ref<Set<string>>(new Set());
const pendingEnd = ref<HistoryLobby | null>(null);
const error = ref('');

onMounted(refresh);

async function refresh() {
  if (session.twitchUser) history.value = await getHistory(session.twitchUser.id).catch(() => []);
}

function toggleExpanded(id: string) {
  const next = new Set(expanded.value);
  next.has(id) ? next.delete(id) : next.add(id);
  expanded.value = next;
}

function requestEnd(entry: HistoryLobby) {
  pendingEnd.value = entry;
}
async function confirmEnd() {
  const entry = pendingEnd.value;
  pendingEnd.value = null;
  if (!entry) return;
  try {
    await setLobbyStatus(entry.id, entry.status === 'open' ? 'cancelled' : 'completed');
    await refresh();
  } catch (err) {
    error.value = (err as Error).message;
  }
}
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
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <div class="management-list">
        <article v-for="entry in history" :key="entry.id">
          <div class="api-key-card">
            <div>
              <b>{{ entry.name }}</b>
              <small
                >{{ entry.code }} · {{ entry.status }} · {{ entry._count.participants }}
                {{ t('participantsLabel') }} · {{ entry.results.length }} {{ t('completedCards') }}</small
              >
            </div>
            <button
              v-if="ACTIVE_STATUSES.has(entry.status)"
              class="icon-button danger"
              type="button"
              @click="requestEnd(entry)"
            >
              {{ t('endSessionAction') }}
            </button>
          </div>
          <button class="participants-toggle" type="button" @click="toggleExpanded(entry.id)">
            {{ t('participantsToggle') }} ({{ entry.participants.length }})
          </button>
          <ul v-if="expanded.has(entry.id)" class="participant-progress-list">
            <li v-for="participant in entry.participants" :key="participant.participantId">
              <span>{{ participant.displayName }}</span>
              <b>{{ participant.completedFields }}/{{ participant.totalFields }} {{ t('progressLabel') }}</b>
            </li>
            <li v-if="!entry.participants.length">
              <span class="muted">{{ t('noMembersYet') }}</span>
            </li>
          </ul>
        </article>
        <p v-if="!history.length" class="muted">{{ t('noHostedSessions') }}</p>
      </div>
    </template>
    <RouterView v-else />
    <BaseModal
      v-if="pendingEnd"
      :title="t('confirmEndSessionTitle')"
      :body="t('confirmEndSessionBody')"
      :cancel-label="t('cancel')"
      :confirm-label="t('endSessionAction')"
      danger
      @cancel="pendingEnd = null"
      @confirm="confirmEnd"
    />
  </section>
</template>
