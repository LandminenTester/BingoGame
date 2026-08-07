<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue';
import { useRoute } from 'vue-router';
import { ExternalLink, Minimize2, Maximize2, Copy, Check, Plus, RefreshCw } from '@lucide/vue';
import { useLobbyStore } from '../stores/lobby';
import { useUiStore } from '../stores/ui';
import { translate, type TranslationKey } from '../i18n';
import BaseInput from '../components/BaseInput.vue';
import BaseModal from '../components/BaseModal.vue';
import BaseCheckbox from '../components/BaseCheckbox.vue';

const props = defineProps<{ lobbyId: string }>();
const route = useRoute();
const lobby = useLobbyStore();
const ui = useUiStore();
const t = (key: TranslationKey) => translate(ui.locale, key);

const isHostView = computed(() => route.name === 'app-lobby');
const codeRevealed = ref(false);
const copied = ref(false);
const loadError = ref('');
const taskSearch = ref('');
const pendingTaskIndex = ref<number | null>(null);
const pendingConfirmIndex = ref<number | null>(null);
const pendingRestart = ref(false);
const roundToast = ref('');
let toastTimer: number | undefined;

const confirmBeforeMarking = ref(localStorage.getItem('bingo-confirm-tiles') === 'true');
watch(confirmBeforeMarking, (val) => localStorage.setItem('bingo-confirm-tiles', String(val)));

const boardScale = ref<'normal' | 'compact'>(
  (localStorage.getItem('bingo-board-scale') as 'normal' | 'compact') ?? 'normal',
);
watch(boardScale, (val) => localStorage.setItem('bingo-board-scale', val));
function toggleBoardScale() {
  boardScale.value = boardScale.value === 'normal' ? 'compact' : 'normal';
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(iso));
}

function openPopout() {
  window.open(
    `/popout/board/${props.lobbyId}`,
    'bingo-popout',
    'width=800,height=800,resizable=yes,menubar=no,toolbar=no,location=no',
  );
}

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
  if (route.name === 'app-lobby') {
    // F5-Wiederherstellung: WebSocket-Verbindung aufbauen → Server schickt lobby.snapshot
    lobby.reconnectToLobby(props.lobbyId);
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

const filteredTaskEntries = computed(() => {
  const query = taskSearch.value.trim().toLowerCase();
  return lobby.boardTasks
    .map((task, index) => ({ task, index }))
    .filter((entry) => !query || entry.task.toLowerCase().includes(query));
});

function requestHostToggle(index: number) {
  pendingTaskIndex.value = index;
}
function confirmHostToggle() {
  const index = pendingTaskIndex.value;
  pendingTaskIndex.value = null;
  if (index === null) return;
  lobby.confirmTask(index, !lobby.marked.has(index));
}

function onTileClick(index: number) {
  if (lobby.gameMode === 'individual') {
    if (confirmBeforeMarking.value) {
      pendingConfirmIndex.value = index;
    } else {
      lobby.toggleField(index);
    }
    return;
  }
  if (isHostView.value && lobby.gameMode === 'streamer_controlled') requestHostToggle(index);
}

function confirmIndividualToggle() {
  const index = pendingConfirmIndex.value;
  pendingConfirmIndex.value = null;
  if (index === null) return;
  lobby.toggleField(index);
}

async function confirmRestartLobby() {
  pendingRestart.value = false;
  await lobby.restartLobby();
}

watchEffect(() => {
  if (lobby.roundNumber > 0) {
    roundToast.value = t('roundStarted').replace('{n}', String(lobby.roundNumber));
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { roundToast.value = ''; }, 3500);
  }
});
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
        <p class="hint">
          {{ lobby.gameMode === 'individual' ? t('gameModeIndividualHint') : t('gameModeStreamerControlledHint') }}
        </p>
      </div>
      <div v-if="isHostView" class="session-actions">
        <button class="button secondary" @click="pendingRestart = true">
          <RefreshCw :size="14" /> {{ t('restartRound') }}
        </button>
        <button class="button" @click="lobby.endLobby()">{{ t('endSession') }}</button>
      </div>
    </div>
    <div class="signal-strip">
      <span class="pulse"></span><b>{{ t('signalOpen') }}</b>
      <button class="code-toggle" type="button" @click="codeRevealed = !codeRevealed">
        {{ t('code') }} <strong>{{ codeRevealed ? lobby.code : '••••••' }}</strong>
      </button>
      <button type="button" @click="copyCode"><Copy :size="12" /> {{ copied ? t('copied') : t('copy') }}</button>
    </div>
    <div class="board-layout">
      <section class="board-section">
        <div class="section-label">
          <span>{{ t('yourCard') }}</span>
          <div class="section-label-controls">
            <BaseCheckbox v-model="confirmBeforeMarking" :label="t('confirmTiles')" />
            <button type="button" class="board-size-btn" @click="toggleBoardScale">
              <component :is="boardScale === 'compact' ? Maximize2 : Minimize2" :size="12" />
              {{ boardScale === 'compact' ? 'Normal' : 'Kompakt' }}
            </button>
            <button type="button" class="popout-btn" @click="openPopout"><ExternalLink :size="12" /> Popout</button>
            <b>{{ lobby.completion }}/25 {{ t('completed') }}</b>
          </div>
        </div>
        <div :class="['bingo-board', { 'bingo-board--compact': boardScale === 'compact' }]" :aria-label="t('yourCard')">
          <button
            v-for="(task, index) in lobby.boardTasks"
            :key="task + index"
            class="tile"
            :class="{ marked: lobby.marked.has(index) }"
            :aria-pressed="lobby.marked.has(index)"
            :disabled="lobby.gameMode !== 'individual' && !(isHostView && lobby.gameMode === 'streamer_controlled')"
            @click="onTileClick(index)"
          >
            <span class="tile-index">{{ String(index + 1).padStart(2, '0') }}</span
            ><span>{{ task }}</span
            ><i><component :is="lobby.marked.has(index) ? Check : Plus" :size="14" /></i>
          </button>
        </div>
      </section>
      <aside class="right-rail">
        <section v-if="isHostView && lobby.gameMode === 'streamer_controlled'" class="panel control-panel">
          <p class="eyebrow">{{ t('hostConsole') }}</p>
          <div class="task-card-toolbar">
            <h2>{{ t('confirmEvent') }}</h2>
          </div>
          <BaseInput
            v-model="taskSearch"
            class="search-field"
            :label="t('searchTasks')"
            hide-label
            :placeholder="t('searchTasks')"
          />
          <div class="task-cards">
            <button
              v-for="entry in filteredTaskEntries"
              :key="entry.task + entry.index"
              class="task-card"
              :class="{ marked: lobby.marked.has(entry.index) }"
              type="button"
              @click="requestHostToggle(entry.index)"
            >
              {{ entry.task }}
            </button>
            <p v-if="!filteredTaskEntries.length" class="muted">{{ t('noMatchingTasks') }}</p>
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
                >{{ entry.displayName }}<small>{{ entry.completedAt ? formatTime(entry.completedAt) : t('inProgress') }}</small></span
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
    <BaseModal
      v-if="pendingTaskIndex !== null"
      :title="lobby.marked.has(pendingTaskIndex) ? t('confirmUnmarkTaskTitle') : t('confirmMarkTaskTitle')"
      :body="lobby.marked.has(pendingTaskIndex) ? t('confirmUnmarkTaskBody') : t('confirmMarkTaskBody')"
      :cancel-label="t('cancel')"
      :confirm-label="t('confirmAction')"
      @cancel="pendingTaskIndex = null"
      @confirm="confirmHostToggle"
    />
    <BaseModal
      v-if="pendingConfirmIndex !== null"
      :title="lobby.marked.has(pendingConfirmIndex) ? t('confirmUnmarkTaskTitle') : t('confirmMarkTaskTitle')"
      :body="lobby.marked.has(pendingConfirmIndex) ? t('confirmUnmarkTaskBody') : t('confirmMarkTaskBody')"
      :cancel-label="t('cancel')"
      :confirm-label="t('confirmAction')"
      @cancel="pendingConfirmIndex = null"
      @confirm="confirmIndividualToggle"
    />
    <BaseModal
      v-if="pendingRestart"
      :title="t('confirmRestartRoundTitle')"
      :body="t('confirmRestartRoundBody')"
      :cancel-label="t('cancel')"
      :confirm-label="t('restartRound')"
      danger
      @cancel="pendingRestart = false"
      @confirm="confirmRestartLobby"
    />
    <div v-if="roundToast" class="round-toast">{{ roundToast }}</div>
  </section>
</template>
