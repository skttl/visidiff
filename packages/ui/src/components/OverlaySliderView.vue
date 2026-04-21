<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';

const props = defineProps<{ originalSrc: string; updatedSrc: string }>();
const opacity = ref(0.5);
const blendDiff = ref(false);

function imgSrc(p: string) {
  return `/screenshots/${p.split('/').pop()}`;
}

function clamp(v: number) {
  return Math.max(0, Math.min(1, v));
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowLeft') {
    opacity.value = clamp(opacity.value - 0.1);
    e.preventDefault();
  } else if (e.key === 'ArrowRight') {
    opacity.value = clamp(opacity.value + 0.1);
    e.preventDefault();
  } else if (/^[0-9]$/.test(e.key)) {
    opacity.value = Number(e.key) / 10;
    e.preventDefault();
  } else if (e.key.toLowerCase() === 'd') {
    blendDiff.value = !blendDiff.value;
    e.preventDefault();
  }
}

onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="overlay-wrap">
    <div class="controls">
      <label>
        Opacity: {{ (opacity * 100).toFixed(0) }}%
        <input type="range" min="0" max="1" step="0.01" v-model.number="opacity" />
      </label>
      <label>
        <input type="checkbox" v-model="blendDiff" />
        Difference blend (D)
      </label>
      <span class="hint">←/→ 10% · 0-9 snap · D toggle blend</span>
    </div>
    <div class="stage">
      <img class="base" :src="imgSrc(originalSrc)" alt="Original" />
      <img
        class="over"
        :src="imgSrc(updatedSrc)"
        alt="Updated"
        :style="{ opacity, mixBlendMode: blendDiff ? 'difference' : 'normal' }"
      />
    </div>
  </div>
</template>

<style scoped>
.overlay-wrap { display: flex; flex-direction: column; height: 100%; }
.controls {
  display: flex;
  gap: 1.25rem;
  padding: 0.5rem 1rem;
  align-items: center;
  background: #f5f5f5;
  border-bottom: 1px solid var(--border);
  font-size: 0.85rem;
}
.controls label { display: flex; gap: 0.4rem; align-items: center; }
.controls input[type='range'] { width: 200px; }
.hint { color: var(--muted); margin-left: auto; font-size: 0.78rem; }
.stage { position: relative; flex: 1; overflow: auto; background: white; }
.base, .over {
  display: block;
  width: 100%;
  top: 0;
  left: 0;
}
.over { position: absolute; }
</style>
