<script setup lang="ts">
import { computed } from 'vue';
const props = defineProps<{ percent: number | null }>();

const tier = computedTier(props.percent);

function computedTier(p: number | null) {
  if (p === null) return { label: 'N/A', color: '#888' };
  if (p < 1) return { label: `${p.toFixed(2)}%`, color: '#16a34a' };
  if (p < 5) return { label: `${p.toFixed(2)}%`, color: '#ca8a04' };
  return { label: `${p.toFixed(2)}%`, color: '#dc2626' };
}
</script>

<template>
  <span class="badge" :style="{ background: tier.color }">{{ tier.label }}</span>
</template>

<style scoped>
.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  color: white;
  font-variant-numeric: tabular-nums;
  font-size: 0.8rem;
}
</style>
