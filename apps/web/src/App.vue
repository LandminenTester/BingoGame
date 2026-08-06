<script setup lang="ts">
import { onMounted } from 'vue';
import { useUiStore } from './stores/ui';
import CookieBanner from './components/CookieBanner.vue';

const ui = useUiStore();
onMounted(() => ui.applyTheme());
</script>

<template>
  <RouterView />
  <CookieBanner />
</template>
