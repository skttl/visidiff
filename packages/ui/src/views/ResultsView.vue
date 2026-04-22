<script setup lang="ts">
import { computed } from 'vue';
import { useRunData } from '../composables/useRunData.js';
import { useFilters } from '../composables/useFilters.js';
import FilterBar from '../components/FilterBar.vue';
import ResultsTable from '../components/ResultsTable.vue';

const { data, loading, error } = useRunData();
const rows = computed(() => data.value?.comparisons ?? []);
const failed = computed(() => data.value?.failedComparisons ?? []);
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

    <div v-if="failed.length" class="failed-section">
      <h3 class="failed-heading">Failed pages ({{ failed.length }})</h3>
      <table class="failed-table">
        <thead>
          <tr>
            <th>URL</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="f in failed" :key="f.url.id">
            <td class="url">{{ f.url.originalUrl }}</td>
            <td class="reason">{{ f.url.error || 'Unknown error' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </template>
</template>

<style scoped>
.summary { padding: 0.5rem 1.25rem; font-size: 0.85rem; color: var(--muted); }
.error { padding: 2rem; color: var(--err); }
.failed-section { margin-top: 1rem; padding: 0.5rem 1.25rem; }
.failed-heading { font-size: 1rem; margin: 0 0 0.5rem; color: var(--err, #c00); }
.failed-table { width: 100%; border-collapse: collapse; background: white; font-size: 0.9rem; }
.failed-table th, .failed-table td { padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid var(--border); }
.failed-table th { background: #f5f5f5; font-weight: 600; }
.failed-table .url { font-family: ui-monospace, monospace; font-size: 0.82rem; max-width: 420px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.failed-table .reason { color: var(--err, #c00); }
</style>
