<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useLobbyStore } from '../stores/lobby';
import { useSessionStore } from '../stores/session';

const props = defineProps<{ lobbyId: string }>();
const lobby = useLobbyStore();
const session = useSessionStore();
const loadError = ref('');

onMounted(async () => {
  if (session.status === 'unknown') await session.bootstrap();

  if (lobby.activeLobbyId === props.lobbyId) {
    lobby.connect();
    return;
  }

  if (session.status === 'guest' || session.status === 'anonymous') {
    const restored = await lobby.restoreGuestSession(props.lobbyId);
    if (!restored) {
      loadError.value = 'Session abgelaufen. Bitte erneut beitreten.';
    }
    return;
  }

  if (session.status === 'twitch') {
    lobby.activeLobbyId = props.lobbyId;
    lobby.connect();
    return;
  }

  loadError.value = 'Keine aktive Lobby-Session gefunden.';
});

onBeforeUnmount(() => lobby.disconnect());

function onTileClick(index: number) {
  if (lobby.gameMode === 'individual') {
    lobby.toggleField(index);
    return;
  }
  if (lobby.gameMode === 'streamer_controlled') {
    lobby.confirmTask(index, !lobby.marked.has(index));
  }
}
</script>

<template>
  <div class="popout-view">
    <p v-if="loadError" style="color: #ff8890; padding: 16px;">{{ loadError }}</p>
    <div v-else class="bingo-board" aria-label="Bingo Board">
      <button
        v-for="(task, index) in lobby.boardTasks"
        :key="task + index"
        class="tile"
        :class="{ marked: lobby.marked.has(index) }"
        :aria-pressed="lobby.marked.has(index)"
        @click="onTileClick(index)"
      >
        <span class="tile-index">{{ String(index + 1).padStart(2, '0') }}</span>
        <span>{{ task }}</span>
        <i>{{ lobby.marked.has(index) ? '✓' : '+' }}</i>
      </button>
    </div>
  </div>
</template>

<style>
html, body {
  margin: 0;
  padding: 0;
  background: transparent;
  width: 100%;
  height: 100%;
}
</style>
