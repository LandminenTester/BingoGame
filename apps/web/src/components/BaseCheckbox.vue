<script setup lang="ts">
defineProps<{ modelValue: boolean; label: string }>();
defineEmits<{ (e: 'update:modelValue', value: boolean): void }>();
</script>

<template>
  <label class="base-checkbox">
    <input
      type="checkbox"
      class="base-checkbox__input"
      :checked="modelValue"
      @change="$emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    />
    <span class="base-checkbox__box" :class="{ checked: modelValue }">
      <svg v-if="modelValue" viewBox="0 0 10 8" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M1 4L3.8 7L9 1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </span>
    <span class="base-checkbox__label">{{ label }}</span>
  </label>
</template>
