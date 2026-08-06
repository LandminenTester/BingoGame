<script setup lang="ts">
import { ref } from 'vue';
import { useUiStore } from '../stores/ui';
import { translate, type TranslationKey } from '../i18n';

const STORAGE_KEY = 'bingo-cookie-consent';
const ui = useUiStore();
const t = (key: TranslationKey) => translate(ui.locale, key);
const dismissed = ref(localStorage.getItem(STORAGE_KEY) === 'accepted');

function accept() {
  localStorage.setItem(STORAGE_KEY, 'accepted');
  dismissed.value = true;
}
</script>

<template>
  <div v-if="!dismissed" class="cookie-banner" role="dialog" aria-live="polite">
    <p>{{ t('cookieBannerText') }}</p>
    <button type="button" class="button" @click="accept">{{ t('cookieBannerAccept') }}</button>
  </div>
</template>
