<script setup lang="ts">
import { useRouter } from 'vue-router';
import type { ComparisonRecord } from '../types.js';
import DiffBadge from './DiffBadge.vue';
import Thumbnail from './Thumbnail.vue';

defineProps<{ rows: ComparisonRecord[] }>();
const router = useRouter();

function maxDiff(r: ComparisonRecord): number {
  return Math.max(0, ...r.viewports.map((v: any) => v.pixelDiffPercent ?? 0));
}
function maxHeight(r: ComparisonRecord): number {
  const values = r.viewports.map((v: any) => v.heightDeltaPx ?? 0);
  return values.reduce((m: number, v: number) => (Math.abs(v) > Math.abs(m) ? v : m), 0);
}
function open(rec: ComparisonRecord) {
  router.push({ name: 'detail', params: { id: rec.url.id } });
}
</script>

<template>
  <table class="results">
    <thead>
      <tr>
        <th></th>
        <th>URL</th>
        <th>Original</th>
        <th>Updated</th>
        <th>Diff</th>
        <th>Height Δ</th>
        <th>Group</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="r in rows" :key="r.url.id" @click="open(r)">
        <td>
          <Thumbnail v-if="r.viewports[0]" :src="r.viewports[0].updatedPath" :alt="r.url.updatedUrl" />
        </td>
        <td class="url">{{ r.url.originalUrl }}</td>
        <td>{{ r.url.originalStatus ?? '-' }}</td>
        <td>{{ r.url.updatedStatus ?? '-' }}</td>
        <td><DiffBadge :percent="maxDiff(r)" /></td>
        <td>{{ maxHeight(r) === 0 ? '—' : (maxHeight(r) > 0 ? '+' : '') + maxHeight(r) + 'px' }}</td>
        <td class="group">{{ r.url.group }}</td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.results { width: 100%; border-collapse: collapse; background: white; }
th, td { padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid var(--border); font-size: 0.9rem; }
th { background: #f5f5f5; font-weight: 600; position: sticky; top: 0; }
tbody tr { cursor: pointer; }
tbody tr:hover { background: #f9f9fb; }
.url, .group { font-family: ui-monospace, monospace; font-size: 0.82rem; }
.url { max-width: 420px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
