<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string;
    body?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
  }>(),
  { confirmLabel: 'OK', cancelLabel: 'Cancel' },
);
const emit = defineEmits<{ (e: 'confirm'): void; (e: 'cancel'): void }>();
</script>

<template>
  <Teleport to="body">
    <div class="modal-overlay" role="presentation" @click.self="emit('cancel')">
      <div class="modal-card" role="alertdialog" aria-modal="true" :aria-label="title">
        <h2>{{ title }}</h2>
        <p v-if="body">{{ body }}</p>
        <div class="modal-actions">
          <button type="button" class="button secondary" @click="emit('cancel')">
            {{ cancelLabel }}
          </button>
          <button
            type="button"
            class="button"
            :class="{ danger }"
            autofocus
            @click="emit('confirm')"
          >
            {{ confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
