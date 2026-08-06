<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { createApiKey, listApiKeys, revokeApiKey, type ApiKeySummary } from '../api';
import { useSessionStore } from '../stores/session';
import { useUiStore } from '../stores/ui';
import { translate, type TranslationKey } from '../i18n';
import BaseInput from '../components/BaseInput.vue';
import BaseButton from '../components/BaseButton.vue';

const session = useSessionStore();
const ui = useUiStore();
const t = (key: TranslationKey) => translate(ui.locale, key);
const apiKeys = ref<ApiKeySummary[]>([]);
const apiKeyName = ref('Overlay integration');
const shownApiKey = ref('');
const error = ref('');

onMounted(refresh);

async function refresh() {
  if (session.twitchUser) apiKeys.value = await listApiKeys(session.twitchUser.id).catch(() => []);
}

async function createIntegrationKey() {
  try {
    const created = await createApiKey(apiKeyName.value, [
      'session:read',
      'lobby:read',
      'leaderboard:read',
      'statistics:read',
    ]);
    shownApiKey.value = created.key;
    await refresh();
  } catch (err) {
    error.value = (err as Error).message;
  }
}

async function disableApiKey(id: string) {
  try {
    await revokeApiKey(id);
    await refresh();
  } catch (err) {
    error.value = (err as Error).message;
  }
}
</script>

<template>
  <section class="view-panel">
    <p class="eyebrow">{{ t('settings') }}</p>
    <p>{{ t('settingsCopy') }}</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <form class="api-key-form" @submit.prevent="createIntegrationKey">
      <BaseInput v-model="apiKeyName" :label="t('apiKeyName')" required maxlength="100" />
      <BaseButton type="submit">{{ t('createApiKey') }}</BaseButton>
    </form>
    <p v-if="shownApiKey" class="secret-key"><b>{{ t('shownOnce') }}</b> {{ shownApiKey }}</p>
    <div class="management-list">
      <article v-for="key in apiKeys" :key="key.id">
        <b>{{ key.name }}</b>
        <small>{{ key.scopes.join(', ') }} · {{ key.revokedAt ? t('revoked') : t('activeKey') }}</small>
        <button v-if="!key.revokedAt" class="link" type="button" @click="disableApiKey(key.id)">
          {{ t('revoke') }}
        </button>
      </article>
      <p v-if="!apiKeys.length" class="muted">{{ t('noApiKeys') }}</p>
    </div>
  </section>
</template>
