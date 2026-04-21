<script setup lang="ts">
import { computed } from 'vue';
import { useRunData } from '../composables/useRunData.js';
import { useFilters } from '../composables/useFilters.js';
import FilterBar from '../components/FilterBar.vue';
import ResultsTable from '../components/ResultsTable.vue';

const { data, loading, error } = useRunData();
const rows = computed(() => data.value?.comparisons ?? []);
const { search, minDiff, statusFilter, filtered } = useFilters(rows);
</script>

<template>
  <div v-if="loading">Loading...</div>
  <div v-else-if="error" class="error">{{ error }}</div>
  <template v-else-if="data">
    <FilterBar
      v-model:search="search"
      v-model:min-diff="minDiff"
      v-model:status-filter="statusFilter"
    />
    <div class="summary">
      {{ filtered.length }} of {{ rows.length }} URLs
      · {{ data.stats.succeeded }} ok · {{ data.stats.failed }} failed
    </div>
    <ResultsTable :rows="filtered" />
  </template>
</template>

<style scoped>
.summary { padding: 0.5rem 1.25rem; font-size: 0.85rem; color: var(--muted); }
.error { padding: 2rem; color: var(--err); }
</style>
