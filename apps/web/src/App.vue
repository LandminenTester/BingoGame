<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { locales, resolveLocale, translate, type Locale, type TranslationKey } from './i18n';
import { participants, rankings, tasks } from './mock';

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
const t = (key: TranslationKey) => translate(locale.value, key);
const completion = computed(() => marked.value.size);
const nav: { id: View; label: TranslationKey }[] = [
  { id: 'dashboard', label: 'dashboard' }, { id: 'join', label: 'join' }, { id: 'templates', label: 'templates' },
  { id: 'history', label: 'history' }, { id: 'stats', label: 'stats' }, { id: 'settings', label: 'settings' },
];

onMounted(() => document.documentElement.dataset.theme = theme.value);
watch(locale, (value) => localStorage.setItem('bingo-locale', value));
watch(theme, (value) => { localStorage.setItem('bingo-theme', value); document.documentElement.dataset.theme = value; });

function toggleField(index: number) {
  const next = new Set(marked.value);
  next.has(index) ? next.delete(index) : next.add(index);
  marked.value = next;
}
function copyCode() {
  void navigator.clipboard?.writeText(code.value);
  copied.value = true;
  window.setTimeout(() => (copied.value = false), 1600);
}
function submitJoin() {
  const cleanCode = joinCode.value.trim().toUpperCase();
  if (!/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(cleanCode)) { joinError.value = t('invalidCode'); return; }
  code.value = cleanCode; joinError.value = ''; view.value = 'dashboard';
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
      <div class="user-panel"><span class="avatar">PP</span><span><b>PixelPanda</b><small>{{ t('streamerAccount') }}</small></span><button class="more" :aria-label="t('accountOptions')">•••</button></div>
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
        <div class="session-heading"><div><p class="eyebrow">{{ t('runningMode') }}</p><h1>{{ t('sessionTitle').split('\n')[0] }}<br /><em>{{ t('sessionTitle').split('\n')[1] }}</em></h1><p class="muted">{{ t('sessionDescription') }}</p></div><div class="session-actions"><button class="button secondary" @click="sessionPaused = !sessionPaused">{{ sessionPaused ? t('resume') : t('pause') }}</button><button class="button">{{ t('endSession') }}</button></div></div>
        <div class="signal-strip"><span class="pulse"></span><b>{{ sessionPaused ? t('sessionPaused') : t('signalOpen') }}</b><span>{{ t('firstLine') }}</span><button @click="copyCode">{{ t('code') }} <strong>{{ code }}</strong> · {{ copied ? t('copied') : t('copy') }}</button></div>
        <div class="board-layout">
          <section class="board-section"><div class="section-label"><span>{{ t('yourCard') }}</span><b>{{ completion }}/25 {{ t('completed') }}</b></div><div class="bingo-board" :aria-label="t('yourCard')">
            <button v-for="(task, index) in tasks" :key="task" class="tile" :class="{ marked: marked.has(index) }" :aria-pressed="marked.has(index)" @click="toggleField(index)"><span class="tile-index">{{ String(index + 1).padStart(2, '0') }}</span><span>{{ task }}</span><i>{{ marked.has(index) ? '✓' : '+' }}</i></button>
          </div><p class="board-note">{{ t('mockMode') }}</p></section>
          <aside class="right-rail"><section class="panel control-panel"><p class="eyebrow">{{ t('hostConsole') }}</p><h2>{{ t('confirmEvent') }}</h2><select :aria-label="t('confirmEvent')"><option v-for="task in tasks.slice(0, 6)" :key="task">{{ task }}</option></select><button class="button wide">{{ t('confirm') }}</button><small>{{ t('syncHint') }}</small></section>
            <section class="panel"><div class="panel-heading"><h2>{{ t('leaderboard') }}</h2><button class="link">{{ t('viewAll') }}</button></div><ol class="ranking"><li v-for="entry in rankings" :key="entry.participantId" :class="{ winner: entry.isWinner }"><b>{{ entry.placement }}</b><span class="avatar mini">{{ entry.displayName.slice(0, 2).toUpperCase() }}</span><span>{{ entry.displayName }}<small>{{ entry.completedAt || t('inProgress') }}</small></span><strong>{{ entry.completedFields }}/25</strong></li></ol></section>
          </aside>
        </div>
      </section>

      <section v-else-if="view === 'join'" class="centered-view"><p class="eyebrow">{{ t('viewerAccess') }}</p><h1>{{ t('joinTitle') }}</h1><p>{{ t('joinCopy') }}</p><form class="join-form" @submit.prevent="submitJoin"><label>{{ t('code') }}<input v-model="joinCode" maxlength="6" placeholder="XAS7PK" autocomplete="off" @input="joinCode = joinCode.toUpperCase()" /></label><p v-if="joinError" class="error" role="alert">{{ joinError }}</p><button class="button wide">{{ t('joinAction') }}</button></form><small>{{ t('joinHint') }}</small></section>

      <section v-else class="placeholder-view"><p class="eyebrow">{{ t('prototypeScreen') }}</p><h1>{{ t(view) }}</h1><p v-if="view === 'templates'">{{ t('templateCopy') }}</p><p v-else-if="view === 'history'">{{ t('historyCopy') }}</p><p v-else-if="view === 'stats'">{{ t('statsCopy') }}</p><p v-else>{{ t('settingsCopy') }}</p><div class="placeholder-grid"><div v-for="item in 3" :key="item" class="ghost-panel"><span></span><span></span><span></span></div></div></section>
    </section>
  </main>
</template>
