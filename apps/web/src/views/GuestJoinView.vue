<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowLeft } from '@lucide/vue';
import { translate, type TranslationKey } from '../i18n';
import { useSessionStore } from '../stores/session';
import { useUiStore } from '../stores/ui';
import { useLobbyStore } from '../stores/lobby';
import BaseInput from '../components/BaseInput.vue';

const session = useSessionStore();
const ui = useUiStore();
const lobby = useLobbyStore();
const router = useRouter();
const t = (key: TranslationKey) => translate(ui.locale, key);

const code = ref('');
const password = ref('');
const displayName = ref('');
const error = ref('');
const guestsNotAllowed = ref(false);
const submitting = ref(false);

async function submit() {
  const cleanCode = code.value.trim().toUpperCase();
  if (!/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(cleanCode)) {
    error.value = t('invalidCode');
    return;
  }
  submitting.value = true;
  error.value = '';
  guestsNotAllowed.value = false;
  try {
    if (session.status === 'twitch') {
      await lobby.joinByCode(cleanCode, password.value || undefined);
      await router.push({ name: 'app-lobby', params: { lobbyId: lobby.activeLobbyId } });
      return;
    }
    if (!displayName.value.trim()) {
      error.value = t('guestNameRequired');
      return;
    }
    await lobby.joinAsGuest(cleanCode, displayName.value.trim(), password.value || undefined);
    await router.push({ name: 'guest-lobby', params: { lobbyId: lobby.activeLobbyId } });
  } catch (err) {
    const errorCode = (err as Error & { code?: string }).code;
    if (errorCode === 'guests_not_allowed') guestsNotAllowed.value = true;
    else error.value = (err as Error).message;
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <section class="centered-view">
    <button v-if="session.status !== 'anonymous'" class="back-btn" type="button" @click="router.back()">
      <ArrowLeft :size="15" /> Zurück
    </button>
    <p class="eyebrow">{{ t('viewerAccess') }}</p>
    <h1>
      {{ t('joinTitle').split('\n')[0] }}<br /><em>{{ t('joinTitle').split('\n')[1] }}</em>
    </h1>
    <p>{{ t('joinCopy') }}</p>

    <template v-if="guestsNotAllowed">
      <p class="error" role="alert">{{ t('guestsNotAllowed') }}</p>
      <button class="button wide" @click="session.loginWithTwitch()">{{ t('twitchLogin') }}</button>
    </template>
    <form v-else class="join-form" @submit.prevent="submit">
      <label
        >{{ t('code') }}
        <input
          v-model="code"
          maxlength="6"
          placeholder="XAS7PK"
          autocomplete="off"
          @input="code = code.toUpperCase()"
      /></label>
      <label
        >{{ t('passwordIfSet') }}
        <input v-model="password" type="password" autocomplete="current-password"
      /></label>
      <BaseInput
        v-if="session.status !== 'twitch'"
        v-model="displayName"
        :label="t('guestName')"
        maxlength="40"
      />
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <button class="button wide" :disabled="submitting">{{ t('joinAction') }}</button>
    </form>
    <small v-if="session.status !== 'twitch'">{{ t('joinHint') }}</small>
  </section>
</template>
