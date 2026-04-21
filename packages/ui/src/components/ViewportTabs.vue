<script setup lang="ts">
import type { ViewportDiff } from '../types.js';

defineProps<{ viewports: ViewportDiff[]; active: number }>();
defineEmits<{ update: [number] }>();
</script>

<template>
  <div class="tabs">
    <button
      v-for="v in viewports"
      :key="v.viewport"
      :class="{ active: v.viewport === active }"
      @click="$emit('update', v.viewport)"
    >
      {{ v.viewport }}px
    </button>
  </div>
</template>

<style scoped>
.tabs { display: flex; gap: 0.25rem; padding: 0.5rem; }
button {
  padding: 0.3rem 0.8rem;
  border: 1px solid var(--border);
  background: white;
  border-radius: 4px;
  font-size: 0.85rem;
}
button.active { background: var(--primary); color: white; border-color: var(--primary); }
</style>
