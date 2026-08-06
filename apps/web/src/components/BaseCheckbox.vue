<script setup lang="ts">
defineProps<{ modelValue: boolean; label: string }>();
defineEmits<{ (e: 'update:modelValue', value: boolean): void }>();
</script>

<template>
  <label class="base-checkbox">
    <input
      type="checkbox"
      :checked="modelValue"
      @change="$emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    />
    <span>{{ label }}</span>
  </label>
</template>
