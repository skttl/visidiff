<script setup lang="ts">
import DiffSlider from '~/components/DiffSlider.vue'

interface ResultItem {
  width: number
  percent: number
  size: { width: number; height: number }
  files: { a: string; b: string; diff: string }
}

const props = defineProps<{ result: ResultItem; urlA: string; urlB: string }>()

const tab = ref<'side' | 'overlay' | 'diff'>('side')

const scrollA = ref<HTMLDivElement | null>(null)
const scrollB = ref<HTMLDivElement | null>(null)
const scrollOverlay = ref<HTMLDivElement | null>(null)
const scrollDiff = ref<HTMLDivElement | null>(null)
const minimapEl = ref<HTMLDivElement | null>(null)

let syncing = false

const minimapScrollRatio = ref(0)
const minimapViewportHeight = ref(0)

const imgMaxWidth = computed(() => `${props.result.size.width}px`)

function getActiveScroll(): HTMLDivElement | null {
  if (tab.value === 'side') return scrollA.value
  if (tab.value === 'overlay') return scrollOverlay.value
  return scrollDiff.value
}

function updateMinimapIndicator() {
  const el = getActiveScroll()
  if (!el) return
  const scrollable = el.scrollHeight - el.clientHeight
  minimapScrollRatio.value = scrollable > 0 ? el.scrollTop / scrollable : 0
  minimapViewportHeight.value = el.clientHeight / el.scrollHeight
}

function onScrollA() {
  if (syncing || !scrollA.value || !scrollB.value) return
  syncing = true
  scrollB.value.scrollTop = scrollA.value.scrollTop
  scrollB.value.scrollLeft = scrollA.value.scrollLeft
  requestAnimationFrame(() => (syncing = false))
  updateMinimapIndicator()
}
function onScrollB() {
  if (syncing || !scrollA.value || !scrollB.value) return
  syncing = true
  scrollA.value.scrollTop = scrollB.value.scrollTop
  scrollA.value.scrollLeft = scrollB.value.scrollLeft
  requestAnimationFrame(() => (syncing = false))
  updateMinimapIndicator()
}
function onScrollOther() {
  updateMinimapIndicator()
}

watch(tab, () => {
  nextTick(updateMinimapIndicator)
})

let minimapDragging = false

function minimapScrollTo(e: PointerEvent) {
  if (!minimapEl.value) return
  const rect = minimapEl.value.getBoundingClientRect()
  const ratio = Math.min(Math.max((e.clientY - rect.top) / rect.height, 0), 1)
  const el = getActiveScroll()
  if (!el) return
  const scrollable = el.scrollHeight - el.clientHeight
  el.scrollTop = scrollable * ratio
  if (tab.value === 'side' && scrollB.value) {
    scrollB.value.scrollTop = el.scrollTop
  }
  updateMinimapIndicator()
}

function onMinimapPointerDown(e: PointerEvent) {
  minimapDragging = true
  ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  minimapScrollTo(e)
}
function onMinimapPointerMove(e: PointerEvent) {
  if (!minimapDragging) return
  minimapScrollTo(e)
}
function onMinimapPointerUp(e: PointerEvent) {
  minimapDragging = false
  ;(e.currentTarget as Element).releasePointerCapture(e.pointerId)
}

const minimapIndicatorHeight = computed(() => Math.min(Math.max(minimapViewportHeight.value * 100, 4), 100))
const minimapIndicatorTop = computed(() => {
  const h = minimapIndicatorHeight.value
  const top = minimapScrollRatio.value * (100 - h)
  return `${Math.min(Math.max(top, 0), 100 - h)}%`
})

const colorClass = computed(() => {
  const p = props.result.percent
  if (p < 1) return 'text-emerald-400'
  if (p < 5) return 'text-amber-400'
  return 'text-rose-400'
})

function formatUrl(url: string) {
  try {
    const parsed = new URL(url)
    return `${parsed.host}${parsed.pathname}${parsed.search}`
  } catch {
    return url
  }
}
</script>

<template>
  <article class="overflow-hidden rounded-[1.25rem] border border-slate-800/80 bg-slate-900/80 shadow-2xl shadow-black/20 backdrop-blur-xl">
    <header class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 px-4 py-4">
      <div class="flex items-baseline gap-3">
        <h3 class="text-lg font-semibold text-white">{{ result.width }}px</h3>
        <span class="text-xs text-slate-400">
          {{ result.size.width }} × {{ result.size.height }}
        </span>
      </div>
      <div class="flex items-center gap-3">
        <span class="rounded-full border border-slate-800/80 bg-slate-950/70 px-3 py-1 text-sm" :class="colorClass">
          {{ result.percent.toFixed(2) }}% different
        </span>
        <div class="inline-flex overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-950/70 p-1 text-sm shadow-inner shadow-black/20">
          <button
            v-for="t in (['side', 'overlay', 'diff'] as const)"
            :key="t"
            class="rounded-xl px-3 py-1.5 transition"
            :class="tab === t ? 'bg-slate-700 text-white shadow-sm shadow-black/30' : 'text-slate-300 hover:bg-slate-800'"
            @click="tab = t"
          >
            {{ t === 'side' ? 'Side-by-side' : t === 'overlay' ? 'Overlay' : 'Diff' }}
          </button>
        </div>
      </div>
    </header>

    <div class="flex gap-0">
      <div class="min-w-0 flex-1">
        <div v-if="tab === 'side'" class="grid grid-cols-1 gap-px bg-slate-800/80 xl:grid-cols-2">
          <div class="bg-slate-950/90 p-3">
            <div class="mb-2 truncate text-xs text-slate-400" :title="urlA">
              <span>A — </span>
              <a :href="urlA" target="_blank" rel="noopener noreferrer" class="text-sky-400 hover:text-sky-300 hover:underline">
                {{ formatUrl(urlA) }}
              </a>
            </div>
            <div
              ref="scrollA"
              class="max-h-[72vh] overflow-auto rounded-2xl border border-slate-800/80 bg-slate-900"
              @scroll.passive="onScrollA"
            >
              <img :src="result.files.a" :alt="`A ${result.width}`" class="block w-full" :style="{ maxWidth: imgMaxWidth }" />
            </div>
          </div>
          <div class="bg-slate-950/90 p-3">
            <div class="mb-2 truncate text-xs text-slate-400" :title="urlB">
              <span>B — </span>
              <a :href="urlB" target="_blank" rel="noopener noreferrer" class="text-sky-400 hover:text-sky-300 hover:underline">
                {{ formatUrl(urlB) }}
              </a>
            </div>
            <div
              ref="scrollB"
              class="max-h-[72vh] overflow-auto rounded-2xl border border-slate-800/80 bg-slate-900"
              @scroll.passive="onScrollB"
            >
              <img :src="result.files.b" :alt="`B ${result.width}`" class="block w-full" :style="{ maxWidth: imgMaxWidth }" />
            </div>
          </div>
        </div>

        <div v-else-if="tab === 'overlay'" class="bg-slate-950/90 p-3">
          <div
            ref="scrollOverlay"
            class="max-h-[72vh] overflow-auto rounded-2xl border border-slate-800/80 bg-slate-900"
            @scroll.passive="onScrollOther"
          >
            <div :style="{ maxWidth: imgMaxWidth }">
              <DiffSlider :a="result.files.a" :b="result.files.b" />
            </div>
          </div>
        </div>

        <div v-else class="checker p-3">
          <div
            ref="scrollDiff"
            class="max-h-[72vh] overflow-auto rounded-2xl border border-slate-800/80 bg-slate-900/90"
            @scroll.passive="onScrollOther"
          >
            <img :src="result.files.diff" :alt="`Diff ${result.width}`" class="block w-full" :style="{ maxWidth: imgMaxWidth }" />
          </div>
        </div>
      </div>

      <div
        ref="minimapEl"
        class="relative ml-2 mr-2 my-3 flex-none cursor-pointer select-none overflow-hidden rounded-xl border border-slate-700/60 bg-slate-950"
        style="width: min(200px, 10%)"
        @pointerdown="onMinimapPointerDown"
        @pointermove="onMinimapPointerMove"
        @pointerup="onMinimapPointerUp"
        @pointercancel="onMinimapPointerUp"
      >
        <img :src="result.files.diff" alt="minimap" class="block w-full" draggable="false" />
        <div
          class="pointer-events-none absolute inset-x-0 rounded border border-sky-400/80 bg-sky-400/15"
          :style="{ top: minimapIndicatorTop, height: `${minimapIndicatorHeight}%` }"
        />
      </div>
    </div>
  </article>
</template>
