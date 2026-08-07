<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useTemplatesStore } from '../stores/templates';
import { useLobbyStore } from '../stores/lobby';
import { useUiStore } from '../stores/ui';
import { translate, type TranslationKey } from '../i18n';
import BaseInput from '../components/BaseInput.vue';
import BaseSelect from '../components/BaseSelect.vue';
import BaseButton from '../components/BaseButton.vue';

const templates = useTemplatesStore();
const lobby = useLobbyStore();
const ui = useUiStore();
const router = useRouter();
const t = (key: TranslationKey) => translate(ui.locale, key);

const name = ref('');
const templateId = ref('');
const mode = ref<'individual' | 'streamer_controlled'>('streamer_controlled');
const win = ref<'first_line' | 'full_card'>('first_line');
const limit = ref('100');
const password = ref('');
const allowLateJoin = ref(true);
const allowGuests = ref(false);
const error = ref('');
const submitting = ref(false);

onMounted(() => {
  if (!templates.items.length) templates.fetchAll();
});

async function submit() {
  if (!templateId.value) {
    error.value = t('selectTemplateRequired');
    return;
  }
  submitting.value = true;
  try {
    const created = await lobby.createAndEnter({
      name: name.value || 'Neue Bingo-Session',
      templateId: templateId.value,
      gameMode: mode.value,
      winningCondition: win.value,
      maxParticipants: Number(limit.value) || 100,
      password: password.value || undefined,
      allowLateJoin: allowLateJoin.value,
      allowGuests: allowGuests.value,
    });
    error.value = '';
    await router.push({ name: 'app-lobby', params: { lobbyId: created.id } });
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <section class="view-panel">
    <p class="eyebrow">{{ t('newLobby') }}</p>
    <h1>{{ t('createLobby') }}</h1>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <form class="lobby-form" @submit.prevent="submit">
      <BaseInput
        v-model="name"
        :label="t('sessionName')"
        maxlength="100"
        placeholder="Friday Night Bingo"
      />
      <BaseSelect
        v-model="templateId"
        :label="t('selectTemplate')"
        :options="[
          { value: '', label: t('selectTemplate') },
          ...templates.items.map((template) => ({ value: template.id, label: template.name })),
        ]"
      />
      <BaseSelect
        v-model="mode"
        :label="t('mode')"
        :options="[
          { value: 'streamer_controlled', label: t('streamerControlled') },
          { value: 'individual', label: t('individual') },
        ]"
      />
      <div class="mode-hint-box">{{ mode === 'individual' ? t('gameModeIndividualHint') : t('gameModeStreamerControlledHint') }}</div>
      <BaseSelect
        v-model="win"
        :label="t('winningCondition')"
        :options="[
          { value: 'first_line', label: t('firstLineOption') },
          { value: 'full_card', label: t('fullCard') },
        ]"
      />
      <BaseInput v-model="limit" type="number" :label="t('participantLimit')" />
      <BaseInput
        v-model="password"
        type="password"
        :label="t('optionalPassword')"
        minlength="3"
        maxlength="128"
        autocomplete="new-password"
      />
      <div class="toggle-tags-row">
        <button
          type="button"
          :class="['toggle-tag', { active: allowLateJoin }]"
          @click="allowLateJoin = !allowLateJoin"
        >{{ t('allowLateJoinLabel') }}</button>
        <button
          type="button"
          :class="['toggle-tag', { active: allowGuests }]"
          @click="allowGuests = !allowGuests"
        >{{ t('allowGuestsLabel') }}</button>
      </div>
      <BaseButton type="submit" :disabled="submitting">{{ t('createLobby') }}</BaseButton>
    </form>
  </section>
</template>
