<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  addApprovedPublisher,
  createApiKey,
  listApiKeys,
  listApprovedPublishers,
  removeApprovedPublisher,
  revokeApiKey,
  type ApiKeySummary,
  type ApprovedPublisher,
} from '../api';
import { useSessionStore } from '../stores/session';
import { useUiStore } from '../stores/ui';
import { translate, type TranslationKey } from '../i18n';
import BaseInput from '../components/BaseInput.vue';
import BaseCheckbox from '../components/BaseCheckbox.vue';
import BaseButton from '../components/BaseButton.vue';

const SUPER_PUBLISHER_LOGIN = 'landminentester';
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

const isSuperPublisher = computed(() => session.twitchUser?.login === SUPER_PUBLISHER_LOGIN);
const publishers = ref<ApprovedPublisher[]>([]);
const newPublisherLogin = ref('');

onMounted(refresh);

async function refresh() {
  if (session.twitchUser) apiKeys.value = await listApiKeys(session.twitchUser.id).catch(() => []);
  if (isSuperPublisher.value) publishers.value = await listApprovedPublishers().catch(() => []);
}

async function addPublisher() {
  if (!newPublisherLogin.value.trim()) return;
  try {
    await addApprovedPublisher(newPublisherLogin.value.trim());
    newPublisherLogin.value = '';
    publishers.value = await listApprovedPublishers().catch(() => []);
  } catch (err) {
    error.value = (err as Error).message;
  }
}
async function removePublisher(id: string) {
  try {
    await removeApprovedPublisher(id);
    publishers.value = await listApprovedPublishers().catch(() => []);
  } catch (err) {
    error.value = (err as Error).message;
  }
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

    <div v-if="isSuperPublisher" class="publisher-panel">
      <p class="eyebrow">{{ t('publishersManageTitle') }}</p>
      <h2>{{ t('publishersManageTitle') }}</h2>
      <p class="hint">{{ t('publishersManageCopy') }}</p>
      <form class="publisher-manage-form" @submit.prevent="addPublisher">
        <BaseInput
          v-model="newPublisherLogin"
          :label="t('channelLoginPlaceholder')"
          hide-label
          :placeholder="t('channelLoginPlaceholder')"
        />
        <button type="submit" class="button">{{ t('addChannel') }}</button>
      </form>
      <ul class="publisher-list">
        <li v-for="publisher in publishers" :key="publisher.id">
          <span>{{ publisher.loginName }}</span>
          <button class="icon-button danger" type="button" @click="removePublisher(publisher.id)">
            {{ t('removeChannel') }}
          </button>
        </li>
      </ul>
    </div>
  </section>
</template>
