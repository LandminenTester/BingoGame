<script setup lang="ts">
defineProps<{
  modelValue: string;
  options: Array<{ value: string; label: string }>;
  label?: string;
  hideLabel?: boolean;
}>();
defineEmits<{ (e: 'update:modelValue', value: string): void }>();
</script>

<template>
  <label class="base-field">
    <span v-if="label" class="base-field-label" :class="{ 'sr-only': hideLabel }">{{ label }}</span>
    <select
      class="base-select"
      :value="modelValue"
      @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <option v-for="option in options" :key="option.value" :value="option.value">
        {{ option.label }}
      </option>
    </select>
  </label>
</template>
