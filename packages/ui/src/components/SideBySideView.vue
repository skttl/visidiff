<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{ originalSrc: string; updatedSrc: string }>();

const leftRef = ref<HTMLDivElement | null>(null);
const rightRef = ref<HTMLDivElement | null>(null);
let syncing = false;

function onScroll(source: 'left' | 'right') {
  if (syncing) return;
  const src = source === 'left' ? leftRef.value : rightRef.value;
  const dst = source === 'left' ? rightRef.value : leftRef.value;
  if (!src || !dst) return;
  syncing = true;
  dst.scrollTop = src.scrollTop;
  requestAnimationFrame(() => (syncing = false));
}

function imgSrc(p: string) {
  return `/screenshots/${p.split('/').pop()}`;
}
</script>

<template>
  <div class="sbs">
    <div class="pane" ref="leftRef" @scroll="onScroll('left')">
      <img :src="imgSrc(originalSrc)" alt="Original" />
    </div>
    <div class="pane" ref="rightRef" @scroll="onScroll('right')">
      <img :src="imgSrc(updatedSrc)" alt="Updated" />
    </div>
  </div>
</template>

<style scoped>
.sbs { display: grid; grid-template-columns: 1fr 1fr; gap: 2px; height: 100%; background: var(--border); }
.pane { overflow: auto; background: white; }
img { display: block; width: 100%; }
</style>
