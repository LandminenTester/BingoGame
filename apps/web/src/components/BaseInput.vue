<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue: string;
    type?: string;
    label?: string;
    placeholder?: string;
    required?: boolean;
    minlength?: number | string;
    maxlength?: number | string;
    autocomplete?: string;
  }>(),
  { type: 'text' },
);
defineEmits<{ (e: 'update:modelValue', value: string): void }>();
</script>

<template>
  <label class="base-field">
    <span v-if="label" class="base-field-label">{{ label }}</span>
    <input
      class="base-input"
      :type="type"
      :value="modelValue"
      :placeholder="placeholder"
      :required="required"
      :minlength="minlength"
      :maxlength="maxlength"
      :autocomplete="autocomplete"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
  </label>
</template>
