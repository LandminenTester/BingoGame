<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useLobbyStore } from '../stores/lobby';
import { useUiStore } from '../stores/ui';
import { translate, type TranslationKey } from '../i18n';

const props = defineProps<{ lobbyId: string }>();
const route = useRoute();
const lobby = useLobbyStore();
const ui = useUiStore();
const t = (key: TranslationKey) => translate(ui.locale, key);

const isHostView = computed(() => route.name === 'app-lobby');
const codeRevealed = ref(false);
const copied = ref(false);
const loadError = ref('');

onMounted(async () => {
  if (lobby.activeLobbyId === props.lobbyId) {
    lobby.connect();
    return;
  }
  if (route.name === 'guest-lobby') {
    const restored = await lobby.restoreGuestSession(props.lobbyId);
    if (!restored) loadError.value = t('guestSessionExpired');
    return;
  }
  loadError.value = t('sessionLost');
});
onBeforeUnmount(() => lobby.disconnect());

function copyCode() {
  void navigator.clipboard?.writeText(lobby.code);
  copied.value = true;
  window.setTimeout(() => (copied.value = false), 1600);
}
</script>

<template>
  <section v-if="loadError" class="centered-view">
    <p class="error" role="alert">{{ loadError }}</p>
  </section>
  <section v-else class="dashboard">
    <div class="session-heading">
      <div>
        <p class="eyebrow">{{ t('runningMode') }}</p>
        <h1>
          {{ t('sessionTitle').split('\n')[0] }}<br /><em>{{ t('sessionTitle').split('\n')[1] }}</em>
        </h1>
      </div>
      <div v-if="isHostView" class="session-actions">
        <button class="button" @click="lobby.endLobby()">{{ t('endSession') }}</button>
      </div>
    </div>
    <div class="signal-strip">
      <span class="pulse"></span><b>{{ t('signalOpen') }}</b>
      <button class="code-toggle" type="button" @click="codeRevealed = !codeRevealed">
        {{ t('code') }} <strong>{{ codeRevealed ? lobby.code : '••••••' }}</strong>
      </button>
      <button type="button" @click="copyCode">{{ copied ? t('copied') : t('copy') }}</button>
    </div>
    <div class="board-layout">
      <section class="board-section">
        <div class="section-label">
          <span>{{ t('yourCard') }}</span
          ><b>{{ lobby.completion }}/25 {{ t('completed') }}</b>
        </div>
        <div class="bingo-board" :aria-label="t('yourCard')">
          <button
            v-for="(task, index) in lobby.boardTasks"
            :key="task + index"
            class="tile"
            :class="{ marked: lobby.marked.has(index) }"
            :aria-pressed="lobby.marked.has(index)"
            :disabled="lobby.gameMode !== 'individual'"
            @click="lobby.gameMode === 'individual' && lobby.toggleField(index)"
          >
            <span class="tile-index">{{ String(index + 1).padStart(2, '0') }}</span
            ><span>{{ task }}</span
            ><i>{{ lobby.marked.has(index) ? '✓' : '+' }}</i>
          </button>
        </div>
      </section>
      <aside class="right-rail">
        <section v-if="isHostView && lobby.gameMode === 'streamer_controlled'" class="panel control-panel">
          <p class="eyebrow">{{ t('hostConsole') }}</p>
          <h2>{{ t('confirmEvent') }}</h2>
          <div class="task-cards">
            <button
              v-for="(task, index) in lobby.boardTasks"
              :key="task + index"
              class="task-card"
              :class="{ marked: lobby.marked.has(index) }"
              :disabled="lobby.marked.has(index)"
              type="button"
              @click="lobby.confirmTask(index)"
            >
              {{ task }}
            </button>
          </div>
          <small>{{ t('syncHint') }}</small>
        </section>
        <section class="panel">
          <div class="panel-heading">
            <h2>{{ lobby.hasResults ? t('leaderboard') : t('members') }}</h2>
          </div>
          <ol v-if="lobby.hasResults" class="ranking">
            <li
              v-for="entry in lobby.leaderboard"
              :key="entry.participantId"
              :class="{ winner: entry.isWinner }"
            >
              <b>{{ entry.placement }}</b
              ><span class="avatar mini">{{ entry.displayName.slice(0, 2).toUpperCase() }}</span
              ><span
                >{{ entry.displayName }}<small>{{ entry.completedAt || t('inProgress') }}</small></span
              ><strong>{{ entry.completedFields }}/25</strong>
            </li>
          </ol>
          <ul v-else class="member-list">
            <li v-for="member in lobby.members" :key="member.participantId">
              <span class="avatar mini">{{ member.displayName.slice(0, 2).toUpperCase() }}</span
              ><span>{{ member.displayName }}</span
              ><small v-if="member.role === 'host'">{{ t('hostBadge') }}</small>
            </li>
            <p v-if="!lobby.members.length" class="muted">{{ t('noMembersYet') }}</p>
          </ul>
        </section>
      </aside>
    </div>
  </section>
</template>
