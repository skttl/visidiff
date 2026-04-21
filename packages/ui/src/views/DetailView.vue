<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useRunData } from '../composables/useRunData.js';
import ViewportTabs from '../components/ViewportTabs.vue';
import SideBySideView from '../components/SideBySideView.vue';
import DiffImageView from '../components/DiffImageView.vue';
import OverlaySliderView from '../components/OverlaySliderView.vue';
import DiffBadge from '../components/DiffBadge.vue';

const route = useRoute();
const router = useRouter();
const { data } = useRunData();

const record = computed(() =>
  data.value?.comparisons.find((c) => c.url.id === route.params.id),
);
const viewports = computed(() => record.value?.viewports ?? []);
const activeViewport = ref<number>(0);
const mode = ref<'sbs' | 'diff' | 'overlay'>('overlay');

watch(
  viewports,
  (vs) => {
    if (vs.length > 0 && !vs.some((v) => v.viewport === activeViewport.value)) {
      activeViewport.value = vs[0]!.viewport;
    }
  },
  { immediate: true },
);

const current = computed(() => viewports.value.find((v) => v.viewport === activeViewport.value));
</script>

<template>
  <div v-if="!record" class="empty">URL not found.</div>
  <div v-else class="detail">
    <header class="detail-head">
      <button @click="router.push({ name: 'results' })">← Back</button>
      <div class="urls">
        <div><strong>Original:</strong> {{ record.url.originalUrl }}</div>
        <div><strong>Updated:</strong> {{ record.url.updatedUrl }}</div>
      </div>
      <DiffBadge :percent="current?.pixelDiffPercent ?? null" />
    </header>
    <ViewportTabs
      :viewports="viewports"
      :active="activeViewport"
      @update="(v) => (activeViewport = v)"
    />
    <div class="mode-tabs">
      <button :class="{ active: mode === 'overlay' }" @click="mode = 'overlay'">Overlay</button>
      <button :class="{ active: mode === 'diff' }" @click="mode = 'diff'">Diff</button>
      <button :class="{ active: mode === 'sbs' }" @click="mode = 'sbs'">Side-by-side</button>
    </div>
    <div class="viewer">
      <template v-if="current">
        <OverlaySliderView
          v-if="mode === 'overlay'"
          :original-src="current.originalPath"
          :updated-src="current.updatedPath"
        />
        <DiffImageView v-else-if="mode === 'diff'" :diff-src="current.diffPath" />
        <SideBySideView
          v-else
          :original-src="current.originalPath"
          :updated-src="current.updatedPath"
        />
      </template>
    </div>
  </div>
</template>

<style scoped>
.detail { display: flex; flex-direction: column; height: calc(100vh - 52px); }
.detail-head {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border);
  background: white;
}
.detail-head button { padding: 0.25rem 0.6rem; }
.urls { flex: 1; font-family: ui-monospace, monospace; font-size: 0.82rem; }
.mode-tabs { display: flex; gap: 0.25rem; padding: 0.25rem 0.75rem; background: white; border-bottom: 1px solid var(--border); }
.mode-tabs button { padding: 0.3rem 0.8rem; border: 1px solid var(--border); background: white; border-radius: 4px; font-size: 0.85rem; }
.mode-tabs button.active { background: var(--primary); color: white; border-color: var(--primary); }
.viewer { flex: 1; overflow: hidden; }
.empty { padding: 2rem; }
</style>
