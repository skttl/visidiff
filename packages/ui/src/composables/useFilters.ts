import { computed, ref, type Ref } from 'vue';
import type { ComparisonRecord } from '../types.js';

export type SortKey = 'diff' | 'url' | 'heightDelta' | 'status';
export type SortDir = 'asc' | 'desc';

export function useFilters(rows: Ref<ComparisonRecord[]>) {
  const search = ref('');
  const minDiff = ref(0);
  const statusFilter = ref<'all' | 'ok' | 'error' | 'mismatch'>('all');
  const sortKey = ref<SortKey>('diff');
  const sortDir = ref<SortDir>('desc');

  const filtered = computed(() => {
    let list = rows.value.slice();
    if (search.value) {
      const q = search.value.toLowerCase();
      list = list.filter((r) => r.url.originalUrl.toLowerCase().includes(q));
    }
    if (minDiff.value > 0) {
      list = list.filter((r) =>
        r.viewports.some((v: any) => (v.pixelDiffPercent ?? 0) >= minDiff.value),
      );
    }
    if (statusFilter.value !== 'all') {
      list = list.filter((r) => statusOf(r) === statusFilter.value);
    }
    list.sort((a, b) => {
      const dir = sortDir.value === 'asc' ? 1 : -1;
      switch (sortKey.value) {
        case 'diff':
          return (maxDiff(a) - maxDiff(b)) * dir;
        case 'heightDelta':
          return (Math.abs(maxHeight(a)) - Math.abs(maxHeight(b))) * dir;
        case 'url':
          return a.url.originalUrl.localeCompare(b.url.originalUrl) * dir;
        case 'status':
          return statusOf(a).localeCompare(statusOf(b)) * dir;
      }
    });
    return list;
  });

  return { search, minDiff, statusFilter, sortKey, sortDir, filtered };
}

function maxDiff(r: ComparisonRecord): number {
  return Math.max(0, ...r.viewports.map((v: any) => v.pixelDiffPercent ?? 0));
}
function maxHeight(r: ComparisonRecord): number {
  return Math.max(0, ...r.viewports.map((v: any) => Math.abs(v.heightDeltaPx ?? 0)));
}
function statusOf(r: ComparisonRecord): 'ok' | 'error' | 'mismatch' {
  if (r.viewports.some((v: any) => v.status === 'failed')) return 'error';
  if (r.url.originalStatus !== r.url.updatedStatus) return 'mismatch';
  return 'ok';
}
