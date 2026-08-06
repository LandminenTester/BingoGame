<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { locales, resolveLocale, translate, type Locale, type TranslationKey } from './i18n';
import { participants, rankings, tasks } from './mock';
import { beginTwitchLogin, confirmLobbyTask, connectLobbyEvents, getCurrentUser, joinLobby as joinLobbyRequest, listTemplates, logout, markCardField, setLobbyStatus, type CurrentUser, type TemplateSummary } from './api';

type View = 'dashboard' | 'join' | 'templates' | 'history' | 'stats' | 'settings';
const view = ref<View>('dashboard');
const locale = ref<Locale>(resolveLocale(localStorage.getItem('bingo-locale')));
const theme = ref<'dark' | 'light'>((localStorage.getItem('bingo-theme') as 'dark' | 'light') || 'dark');
const code = ref('XAS7PK');
const joinCode = ref('');
const joinError = ref('');
const copied = ref(false);
const sessionPaused = ref(false);
const marked = ref(new Set<number>([0, 2, 5, 8, 11, 13, 17, 22]));
const boardTasks = ref([...tasks]);
const cardFieldIds = ref<string[]>([]);
const templateFieldIds = ref<string[]>([]);
const activeLobbyId = ref<string | null>(null);
const selectedTaskIndex = ref(0);
let eventSocket: WebSocket | undefined;
const currentUser = ref<CurrentUser | null>(null);
const remoteTemplates = ref<TemplateSummary[]>([]);
const t = (key: TranslationKey) => translate(locale.value, key);
const completion = computed(() => marked.value.size);
const nav: { id: View; label: TranslationKey }[] = [
  { id: 'dashboard', label: 'dashboard' }, { id: 'join', label: 'join' }, { id: 'templates', label: 'templates' },
  { id: 'history', label: 'history' }, { id: 'stats', label: 'stats' }, { id: 'settings', label: 'settings' },
];

onMounted(async () => { document.documentElement.dataset.theme = theme.value; currentUser.value = await getCurrentUser().catch(() => null); });
watch(view, async (value) => { if (value === 'templates') remoteTemplates.value = await listTemplates().catch(() => []); });
onBeforeUnmount(() => eventSocket?.close());
watch(locale, (value) => localStorage.setItem('bingo-locale', value));
watch(theme, (value) => { localStorage.setItem('bingo-theme', value); document.documentElement.dataset.theme = value; });

async function toggleField(index: number) {
  const next = new Set(marked.value);
  const completed = !next.has(index);
  if (activeLobbyId.value && cardFieldIds.value[index]) {
    try { await markCardField(activeLobbyId.value, cardFieldIds.value[index], completed); } catch (error) { joinError.value = (error as Error).message; return; }
  }
  completed ? next.add(index) : next.delete(index); marked.value = next;
}
function copyCode() {
  void navigator.clipboard?.writeText(code.value);
  copied.value = true;
  window.setTimeout(() => (copied.value = false), 1600);
}
async function submitJoin() {
  const cleanCode = joinCode.value.trim().toUpperCase();
  if (!/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(cleanCode)) { joinError.value = t('invalidCode'); return; }
  if (!currentUser.value) { beginTwitchLogin(); return; }
  try { const joined = await joinLobbyRequest(cleanCode); activeLobbyId.value = joined.lobbyId; cardFieldIds.value = joined.card?.fields.map((field) => field.id) ?? []; templateFieldIds.value = joined.card?.fields.map((field) => field.templateField.id) ?? []; boardTasks.value = joined.card?.fields.map((field) => field.templateField.label) ?? boardTasks.value; marked.value = new Set(joined.card?.fields.flatMap((field, index) => field.completedAt ? [index] : []) ?? []); subscribeToLobby(joined.lobbyId); code.value = cleanCode; joinError.value = ''; view.value = 'dashboard'; }
  catch (error) { joinError.value = (error as Error).message; }
}
async function signOut() { await logout(); currentUser.value = null; }
function subscribeToLobby(lobbyId: string) {
  eventSocket?.close(); eventSocket = connectLobbyEvents(lobbyId, (event) => {
    if (event.type === 'lobby.snapshot') {
      const participant = event.lobby?.participants?.find((entry: any) => entry.user?.twitchUserId === currentUser.value?.id);
      const fields = participant?.card?.fields; if (!fields) return;
      cardFieldIds.value = fields.map((field: any) => field.id); templateFieldIds.value = fields.map((field: any) => field.templateField.id);
      boardTasks.value = fields.map((field: any) => field.templateField.label); marked.value = new Set(fields.flatMap((field: any, index: number) => field.completedAt ? [index] : [])); return;
    }
    const id = event.templateFieldId ?? event.fieldId; if (!id || typeof event.completed !== 'boolean') return;
    const index = event.templateFieldId ? templateFieldIds.value.indexOf(id) : cardFieldIds.value.indexOf(id); if (index < 0) return;
    const next = new Set(marked.value); event.completed ? next.add(index) : next.delete(index); marked.value = next;
  });
}
async function confirmSelectedTask() {
  const fieldId = templateFieldIds.value[selectedTaskIndex.value];
  if (!activeLobbyId.value || !fieldId) return;
  try { await confirmLobbyTask(activeLobbyId.value, fieldId, true); const next = new Set(marked.value); next.add(selectedTaskIndex.value); marked.value = next; }
  catch (error) { joinError.value = (error as Error).message; }
}
async function toggleSessionPause() {
  if (!activeLobbyId.value) { sessionPaused.value = !sessionPaused.value; return; }
  const paused = !sessionPaused.value;
  try { await setLobbyStatus(activeLobbyId.value, paused ? 'paused' : 'running'); sessionPaused.value = paused; } catch (error) { joinError.value = (error as Error).message; }
}
</script>

<template>
  <main class="app-shell">
    <aside class="sidebar" aria-label="Main navigation">
      <div class="brand"><span class="brand-mark">S</span><span>SIGNAL<br /><b>BINGO</b></span></div>
      <nav>
        <button v-for="item in nav" :key="item.id" :class="{ active: view === item.id }" @click="view = item.id">
          <span class="nav-dot"></span>{{ t(item.label) }}
        </button>
      </nav>
      <div class="user-panel"><span class="avatar">{{ currentUser?.displayName.slice(0, 2).toUpperCase() ?? 'PP' }}</span><span><b>{{ currentUser?.displayName ?? 'PixelPanda' }}</b><small>{{ currentUser ? t('streamerAccount') : 'Twitch login required' }}</small></span><button v-if="currentUser" class="more" :aria-label="t('accountOptions')" @click="signOut">↪</button><button v-else class="more" :aria-label="t('accountOptions')" @click="beginTwitchLogin">↗</button></div>
    </aside>

    <section class="content">
      <header class="topbar">
        <div class="live-chip"><span></span>{{ t('live') }} <b>00:21:09</b></div>
        <div class="top-controls">
          <label class="language-picker"><span class="sr-only">Language</span><select v-model="locale"><option v-for="language in locales" :key="language.code" :value="language.code">{{ language.meta.nativeName }}</option></select></label>
          <button class="quiet" :aria-label="t(theme === 'dark' ? 'themeToLight' : 'themeToDark')" @click="theme = theme === 'dark' ? 'light' : 'dark'">{{ theme === 'dark' ? '☀' : '◐' }}</button>
        </div>
      </header>

      <section v-if="view === 'dashboard'" class="dashboard">
        <div class="session-heading"><div><p class="eyebrow">{{ t('runningMode') }}</p><h1>{{ t('sessionTitle').split('\n')[0] }}<br /><em>{{ t('sessionTitle').split('\n')[1] }}</em></h1><p class="muted">{{ t('sessionDescription') }}</p></div><div class="session-actions"><button class="button secondary" @click="toggleSessionPause">{{ sessionPaused ? t('resume') : t('pause') }}</button><button class="button" @click="activeLobbyId && setLobbyStatus(activeLobbyId, 'completed')">{{ t('endSession') }}</button></div></div>
        <div class="signal-strip"><span class="pulse"></span><b>{{ sessionPaused ? t('sessionPaused') : t('signalOpen') }}</b><span>{{ t('firstLine') }}</span><button @click="copyCode">{{ t('code') }} <strong>{{ code }}</strong> · {{ copied ? t('copied') : t('copy') }}</button></div>
        <div class="board-layout">
          <section class="board-section"><div class="section-label"><span>{{ t('yourCard') }}</span><b>{{ completion }}/25 {{ t('completed') }}</b></div><div class="bingo-board" :aria-label="t('yourCard')">
            <button v-for="(task, index) in boardTasks" :key="task" class="tile" :class="{ marked: marked.has(index) }" :aria-pressed="marked.has(index)" @click="toggleField(index)"><span class="tile-index">{{ String(index + 1).padStart(2, '0') }}</span><span>{{ task }}</span><i>{{ marked.has(index) ? '✓' : '+' }}</i></button>
          </div><p class="board-note">{{ t('mockMode') }}</p></section>
          <aside class="right-rail"><section class="panel control-panel"><p class="eyebrow">{{ t('hostConsole') }}</p><h2>{{ t('confirmEvent') }}</h2><select v-model="selectedTaskIndex" :aria-label="t('confirmEvent')"><option v-for="(task, index) in boardTasks" :key="task" :value="index">{{ task }}</option></select><button class="button wide" @click="confirmSelectedTask">{{ t('confirm') }}</button><small>{{ t('syncHint') }}</small></section>
            <section class="panel"><div class="panel-heading"><h2>{{ t('leaderboard') }}</h2><button class="link">{{ t('viewAll') }}</button></div><ol class="ranking"><li v-for="entry in rankings" :key="entry.participantId" :class="{ winner: entry.isWinner }"><b>{{ entry.placement }}</b><span class="avatar mini">{{ entry.displayName.slice(0, 2).toUpperCase() }}</span><span>{{ entry.displayName }}<small>{{ entry.completedAt || t('inProgress') }}</small></span><strong>{{ entry.completedFields }}/25</strong></li></ol></section>
          </aside>
        </div>
      </section>

      <section v-else-if="view === 'join'" class="centered-view"><p class="eyebrow">{{ t('viewerAccess') }}</p><h1>{{ t('joinTitle') }}</h1><p>{{ t('joinCopy') }}</p><form class="join-form" @submit.prevent="submitJoin"><label>{{ t('code') }}<input v-model="joinCode" maxlength="6" placeholder="XAS7PK" autocomplete="off" @input="joinCode = joinCode.toUpperCase()" /></label><p v-if="joinError" class="error" role="alert">{{ joinError }}</p><button class="button wide">{{ t('joinAction') }}</button></form><small>{{ t('joinHint') }}</small></section>

      <section v-else class="placeholder-view"><p class="eyebrow">{{ t('prototypeScreen') }}</p><h1>{{ t(view) }}</h1><template v-if="view === 'templates'"><p>{{ t('templateCopy') }}</p><div class="template-list"><article v-for="template in remoteTemplates" :key="template.id" class="template-item"><b>{{ template.name }}</b><small>{{ template.visibility }} · {{ template.fields.length }}/25</small></article><p v-if="!remoteTemplates.length" class="muted">No visible templates yet.</p></div></template><p v-else-if="view === 'history'">{{ t('historyCopy') }}</p><p v-else-if="view === 'stats'">{{ t('statsCopy') }}</p><p v-else>{{ t('settingsCopy') }}</p><div v-if="view !== 'templates'" class="placeholder-grid"><div v-for="item in 3" :key="item" class="ghost-panel"><span></span><span></span><span></span></div></div></section>
    </section>
  </main>
</template>
