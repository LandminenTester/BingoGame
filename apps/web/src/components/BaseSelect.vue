<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps<{
  modelValue: string;
  options: Array<{ value: string; label: string }>;
  label?: string;
  hideLabel?: boolean;
}>();
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>();

const open = ref(false);
const activeIndex = ref(0);
const root = ref<HTMLElement | null>(null);

const selectedOption = computed(
  () => props.options.find((option) => option.value === props.modelValue) ?? props.options[0],
);

function toggle() {
  open.value = !open.value;
  if (open.value) {
    const index = props.options.findIndex((option) => option.value === props.modelValue);
    activeIndex.value = index >= 0 ? index : 0;
  }
}
function close() {
  open.value = false;
}
function choose(value: string) {
  emit('update:modelValue', value);
  close();
}
function onKeydown(event: KeyboardEvent) {
  if (!open.value) {
    if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      toggle();
    }
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    close();
  } else if (event.key === 'ArrowDown') {
    event.preventDefault();
    activeIndex.value = Math.min(activeIndex.value + 1, props.options.length - 1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    activeIndex.value = Math.max(activeIndex.value - 1, 0);
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    const option = props.options[activeIndex.value];
    if (option) choose(option.value);
  }
}
function onDocumentClick(event: MouseEvent) {
  if (root.value && !root.value.contains(event.target as Node)) close();
}
onMounted(() => document.addEventListener('click', onDocumentClick));
onBeforeUnmount(() => document.removeEventListener('click', onDocumentClick));
</script>

<template>
  <div ref="root" class="base-field listbox-field">
    <span v-if="label" class="base-field-label" :class="{ 'sr-only': hideLabel }">{{ label }}</span>
    <button
      type="button"
      class="base-select listbox-trigger"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click="toggle"
      @keydown="onKeydown"
    >
      <span>{{ selectedOption?.label }}</span>
      <span class="listbox-trigger-caret" aria-hidden="true">▾</span>
    </button>
    <ul v-if="open" class="listbox-panel" role="listbox">
      <li v-for="(option, index) in options" :key="option.value">
        <button
          type="button"
          role="option"
          :aria-selected="option.value === modelValue"
          class="listbox-option"
          :class="{ active: index === activeIndex, selected: option.value === modelValue }"
          @mouseenter="activeIndex = index"
          @click="choose(option.value)"
        >
          {{ option.label }}
        </button>
      </li>
    </ul>
  </div>
</template>
