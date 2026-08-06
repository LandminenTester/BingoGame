<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { createApiKey, listApiKeys, revokeApiKey, type ApiKeySummary } from '../api';
import { useSessionStore } from '../stores/session';
import { useUiStore } from '../stores/ui';
import { translate, type TranslationKey } from '../i18n';
import BaseInput from '../components/BaseInput.vue';
import BaseCheckbox from '../components/BaseCheckbox.vue';
import BaseButton from '../components/BaseButton.vue';

const SCOPES = ['session:read', 'lobby:read', 'leaderboard:read', 'statistics:read'] as const;
const SCOPE_LABEL_KEYS: Record<(typeof SCOPES)[number], TranslationKey> = {
  'session:read': 'scopeSessionRead',
  'lobby:read': 'scopeLobbyRead',
  'leaderboard:read': 'scopeLeaderboardRead',
  'statistics:read': 'scopeStatisticsRead',
};

const session = useSessionStore();
const ui = useUiStore();
const t = (key: TranslationKey) => translate(ui.locale, key);
const apiKeys = ref<ApiKeySummary[]>([]);
const apiKeyName = ref('Overlay integration');
const selectedScopes = ref<Record<string, boolean>>({
  'session:read': true,
  'lobby:read': true,
  'leaderboard:read': false,
  'statistics:read': false,
});
const shownApiKey = ref('');
const error = ref('');

onMounted(refresh);

async function refresh() {
  if (session.twitchUser) apiKeys.value = await listApiKeys(session.twitchUser.id).catch(() => []);
}

async function createIntegrationKey() {
  const scopes = SCOPES.filter((scope) => selectedScopes.value[scope]);
  if (!scopes.length) {
    error.value = t('atLeastOneScope');
    return;
  }
  try {
    const created = await createApiKey(apiKeyName.value, scopes);
    shownApiKey.value = created.key;
    error.value = '';
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
    <p class="hint">{{ t('scopesLabel') }}</p>
    <div class="scope-checkboxes">
      <BaseCheckbox
        v-for="scope in SCOPES"
        :key="scope"
        v-model="selectedScopes[scope]"
        :label="t(SCOPE_LABEL_KEYS[scope])"
      />
    </div>
    <p v-if="shownApiKey" class="secret-key"><b>{{ t('shownOnce') }}</b> {{ shownApiKey }}</p>
    <div class="management-list">
      <article v-for="key in apiKeys" :key="key.id" class="api-key-card">
        <div>
          <b>{{ key.name }}</b>
          <div class="scope-badges">
            <span v-for="scope in key.scopes" :key="scope" class="scope-badge">{{ scope }}</span>
          </div>
          <small>{{ key.revokedAt ? t('revoked') : t('activeKey') }}</small>
        </div>
        <button
          v-if="!key.revokedAt"
          class="icon-button danger"
          type="button"
          @click="disableApiKey(key.id)"
        >
          {{ t('removeApiKey') }}
        </button>
      </article>
      <p v-if="!apiKeys.length" class="muted">{{ t('noApiKeys') }}</p>
    </div>
  </section>
</template>
