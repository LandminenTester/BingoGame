<script setup lang="ts">
withDefaults(
  defineProps<{ type?: 'button' | 'submit'; secondary?: boolean; wide?: boolean }>(),
  { type: 'button' },
);
</script>

<template>
  <button :type="type" class="button" :class="{ secondary, wide }">
    <slot />
  </button>
</template>
