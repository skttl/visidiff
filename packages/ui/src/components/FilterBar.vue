<script setup lang="ts">
defineProps<{
  search: string;
  minDiff: number;
  statusFilter: 'all' | 'ok' | 'error' | 'mismatch';
}>();
defineEmits<{
  'update:search': [string];
  'update:minDiff': [number];
  'update:statusFilter': ['all' | 'ok' | 'error' | 'mismatch'];
}>();
</script>

<template>
  <div class="filter-bar">
    <input
      placeholder="Search URL..."
      :value="search"
      @input="$emit('update:search', ($event.target as HTMLInputElement).value)"
    />
    <label>
      Min diff %
      <input
        type="number"
        min="0"
        step="0.1"
        :value="minDiff"
        @input="$emit('update:minDiff', Number(($event.target as HTMLInputElement).value))"
      />
    </label>
    <label>
      Status
      <select
        :value="statusFilter"
        @change="$emit('update:statusFilter', ($event.target as HTMLSelectElement).value as any)"
      >
        <option value="all">All</option>
        <option value="ok">OK</option>
        <option value="mismatch">Status mismatch</option>
        <option value="error">Errors</option>
      </select>
    </label>
  </div>
</template>

<style scoped>
.filter-bar {
  display: flex;
  gap: 1rem;
  align-items: center;
  padding: 0.75rem 1.25rem;
  background: white;
  border-bottom: 1px solid var(--border);
}
input, select { padding: 0.25rem 0.5rem; border: 1px solid var(--border); border-radius: 4px; }
label { display: flex; align-items: center; gap: 0.4rem; font-size: 0.9rem; color: var(--muted); }
</style>
