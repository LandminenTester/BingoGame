<script setup lang="ts">
import { RouterLink, RouterView, useRouter } from 'vue-router';
import { locales, translate, type TranslationKey } from '../i18n';
import { useSessionStore } from '../stores/session';
import { useUiStore } from '../stores/ui';
import BaseSelect from '../components/BaseSelect.vue';

const session = useSessionStore();
const ui = useUiStore();
const router = useRouter();
const t = (key: TranslationKey) => translate(ui.locale, key);

const nav: { name: string; label: TranslationKey }[] = [
  { name: 'templates', label: 'templates' },
  { name: 'create-lobby', label: 'createLobby' },
  { name: 'history', label: 'history' },
  { name: 'settings', label: 'settings' },
];

async function signOut() {
  await session.logout();
  await router.push({ name: 'landing' });
}
</script>

<template>
  <main class="app-shell">
    <aside class="sidebar" aria-label="Main navigation">
      <div class="brand"><span class="brand-mark">S</span><span>SIGNAL<br /><b>BINGO</b></span></div>
      <nav>
        <RouterLink
          v-for="item in nav"
          :key="item.name"
          v-slot="{ navigate, isActive }"
          :to="{ name: item.name }"
          custom
        >
          <button :class="{ active: isActive }" @click="navigate">
            <span class="nav-dot"></span>{{ t(item.label) }}
          </button>
        </RouterLink>
      </nav>
      <div class="user-panel">
        <span class="avatar">{{
          session.twitchUser?.displayName.slice(0, 2).toUpperCase() ?? 'PP'
        }}</span>
        <span
          ><b>{{ session.twitchUser?.displayName ?? 'PixelPanda' }}</b
          ><small>{{ t('streamerAccount') }}</small></span
        >
        <button class="more" :aria-label="t('accountOptions')" @click="signOut">↪</button>
      </div>
    </aside>

    <section class="content">
      <header class="topbar">
        <button class="quiet enter-code" @click="router.push({ name: 'guest-join' })">
          {{ t('enterCode') }}
        </button>
        <div class="top-controls">
          <BaseSelect
            v-model="ui.locale"
            :label="t('language')"
            hide-label
            :options="
              locales.map((language) => ({ value: language.code, label: language.meta.nativeName }))
            "
          />
          <button
            class="quiet"
            :aria-label="t(ui.theme === 'dark' ? 'themeToLight' : 'themeToDark')"
            @click="ui.toggleTheme()"
          >
            {{ ui.theme === 'dark' ? '☀' : '◐' }}
          </button>
        </div>
      </header>
      <RouterView />
    </section>
  </main>
</template>
