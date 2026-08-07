<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import { LogIn, StopCircle, ChevronDown, ChevronUp } from 'lucide-vue-next';
import { getHistory, setLobbyStatus, type HistoryLobby } from '../api';
import { useSessionStore } from '../stores/session';
import { useUiStore } from '../stores/ui';
import { translate, type TranslationKey } from '../i18n';
import BaseModal from '../components/BaseModal.vue';

const ACTIVE_STATUSES = new Set(['draft', 'open', 'running', 'paused']);

const STATUS_CLASS: Record<string, string> = {
  running: 'history-status--running',
  paused: 'history-status--paused',
  completed: 'history-status--completed',
  cancelled: 'history-status--cancelled',
  draft: 'history-status--draft',
  open: 'history-status--open',
};

const session = useSessionStore();
const ui = useUiStore();
const route = useRoute();
const t = (key: TranslationKey) => translate(ui.locale, key);
const history = ref<HistoryLobby[]>([]);
const expanded = ref<Set<string>>(new Set());
const pendingEnd = ref<HistoryLobby | null>(null);
const error = ref('');

const fmt = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function formatDate(iso: string) {
  return fmt.format(new Date(iso));
}

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
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <div class="history-list">
        <article v-for="entry in history" :key="entry.id" class="history-card">
          <div class="history-card-header">
            <p class="history-card-title">{{ entry.name }}</p>
            <span :class="['history-status', STATUS_CLASS[entry.status] ?? '']">{{ entry.status }}</span>
          </div>
          <div class="history-card-meta">
            <span class="history-chip">{{ formatDate(entry.createdAt) }}</span>
            <span class="history-chip">{{ entry.code }}</span>
            <span class="history-chip">{{ entry._count.participants }} {{ t('participantsLabel') }}</span>
            <span class="history-chip">{{ entry.results.length }} {{ t('completedCards') }}</span>
          </div>
          <div class="history-card-actions">
            <RouterLink
              v-if="ACTIVE_STATUSES.has(entry.status)"
              :to="{ name: 'app-lobby', params: { lobbyId: entry.id } }"
              class="button"
            >
              <LogIn :size="14" /> {{ t('rejoinSession') }}
            </RouterLink>
            <button
              v-if="ACTIVE_STATUSES.has(entry.status)"
              class="button danger"
              type="button"
              @click="requestEnd(entry)"
            >
              <StopCircle :size="14" /> {{ t('endSessionAction') }}
            </button>
            <button class="history-participants-toggle" type="button" @click="toggleExpanded(entry.id)">
              {{ t('participantsToggle') }} ({{ entry.participants.length }})
              <component :is="expanded.has(entry.id) ? ChevronUp : ChevronDown" :size="12" />
            </button>
          </div>
          <div v-if="expanded.has(entry.id)" class="history-participants">
            <div
              v-for="participant in entry.participants"
              :key="participant.participantId"
              class="history-participant"
            >
              <span class="avatar mini">{{ participant.displayName.slice(0, 2).toUpperCase() }}</span>
              <span class="history-participant-name">{{ participant.displayName }}</span>
              <div>
                <div class="progress-bar-track">
                  <div
                    class="progress-bar-fill"
                    :style="{ width: participant.totalFields > 0 ? `${(participant.completedFields / participant.totalFields) * 100}%` : '0%' }"
                  ></div>
                </div>
                <span class="history-participant-score">
                  {{ participant.completedFields }}/{{ participant.totalFields }}
                </span>
              </div>
            </div>
            <p v-if="!entry.participants.length" class="muted">{{ t('noMembersYet') }}</p>
          </div>
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
