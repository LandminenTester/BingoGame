<script setup lang="ts">
import { useRouter } from 'vue-router';
import { translate, type TranslationKey } from '../i18n';
import { useSessionStore } from '../stores/session';
import { useUiStore } from '../stores/ui';

const session = useSessionStore();
const ui = useUiStore();
const router = useRouter();
const t = (key: TranslationKey) => translate(ui.locale, key);
</script>

<template>
  <section class="centered-view landing-view">
    <p class="eyebrow">{{ t('readyToBroadcast') }}</p>
    <h1>
      {{ t('landingTitle').split('\n')[0] }}<br /><em>{{ t('landingTitle').split('\n')[1] }}</em>
    </h1>
    <p>{{ t('landingCopy') }}</p>
    <div class="landing-actions">
      <button class="button wide" @click="session.loginWithTwitch()">{{ t('twitchLogin') }}</button>
      <button class="button secondary wide" @click="router.push({ name: 'guest-join' })">
        {{ t('join') }}
      </button>
    </div>
  </section>
</template>
