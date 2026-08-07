<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
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
  { name: 'create-lobby', label: 'createLobby' },
  { name: 'templates', label: 'templates' },
  { name: 'history', label: 'history' },
  { name: 'settings', label: 'settings' },
];

const accountMenuOpen = ref(false);
const accountRoot = ref<HTMLElement | null>(null);

function toggleAccountMenu() {
  accountMenuOpen.value = !accountMenuOpen.value;
}
function onDocumentClick(event: MouseEvent) {
  if (accountRoot.value && !accountRoot.value.contains(event.target as Node))
    accountMenuOpen.value = false;
}
onMounted(() => document.addEventListener('click', onDocumentClick));
onBeforeUnmount(() => document.removeEventListener('click', onDocumentClick));

async function signOut() {
  accountMenuOpen.value = false;
  await session.logout();
  await router.push({ name: 'landing' });
}
</script>

<template>
  <main class="app-shell">
    <aside class="sidebar" aria-label="Main navigation">
      <div class="brand"><span class="brand-mark">S</span><span>SIGNAL<br /><b>BINGO</b></span></div>
      <div ref="accountRoot" class="account-panel">
        <button
          v-if="session.twitchUser"
          type="button"
          class="account-trigger"
          :aria-expanded="accountMenuOpen"
          @click="toggleAccountMenu"
        >
          <span class="avatar">{{ session.twitchUser.displayName.slice(0, 2).toUpperCase() }}</span>
          <span
            ><b>{{ session.twitchUser.displayName }}</b
            ><small>{{ t('streamerAccount') }}</small></span
          >
        </button>
        <div v-else class="account-signin">
          <b>{{ t('pleaseSignIn') }}</b>
          <span>{{ t('pleaseSignInHint') }}</span>
          <button class="button" type="button" @click="session.loginWithTwitch()">
            {{ t('twitchLogin') }}
          </button>
        </div>
        <div v-if="accountMenuOpen" class="account-menu" role="menu">
          <button type="button" role="menuitem" @click="signOut">
            {{ t('accountMenuLogout') }}
          </button>
        </div>
      </div>
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
      <div class="legal-links">
        <RouterLink :to="{ name: 'imprint' }">{{ t('imprint') }}</RouterLink>
        <RouterLink :to="{ name: 'privacy' }">{{ t('privacyPolicy') }}</RouterLink>
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
