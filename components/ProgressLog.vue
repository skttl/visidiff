<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

const props = defineProps<{
  events: { type: string; data: any; t: number }[]
  status: string
}>()

const listRef = ref<HTMLElement | null>(null)
const collapsed = ref(true)

function scrollToBottom() {
  if (!listRef.value) return
  listRef.value.scrollTop = listRef.value.scrollHeight
}

const latestEvent = computed(() => props.events[props.events.length - 1] ?? null)

function toggleCollapsed() {
  collapsed.value = !collapsed.value
}

watch(() => props.events.length, async () => {
  await nextTick()
  if (!collapsed.value) scrollToBottom()
}, { immediate: true })

watch(() => props.status, async () => {
  await nextTick()
  if (!collapsed.value) scrollToBottom()
})

watch(collapsed, async (isCollapsed) => {
  if (isCollapsed) return
  await nextTick()
  scrollToBottom()
})

function fmt(e: { type: string; data: any }) {
  if (e.type === 'status') return `status: ${e.data.status}${e.data.error ? ' — ' + e.data.error : ''}`
  if (e.type === 'batch-ready') {
    return `batch ready — ${e.data.pageCount} pages × ${e.data.viewportCount} viewports (${e.data.taskCount} tasks)`
  }
  if (e.type === 'page-skipped') {
    const page = e.data.pagePath ? `[${e.data.pagePath}] ` : ''
    return `${page}skipped — ${e.data.reason}`
  }
  if (e.type === 'step') {
    const page = e.data.pagePath ? `[${e.data.pagePath}] ` : ''
    const v = e.data.viewport ? `[${e.data.viewport}px] ` : ''
    const side = e.data.side ? ` (${e.data.side})` : ''
    if (e.data.phase === 'discovery-start') return `discovery start — ${e.data.hostA} ↔ ${e.data.hostB}`
    if (e.data.phase === 'sitemap-found') return `sitemap found — ${e.data.host} (${e.data.sitemapCount})`
    if (e.data.phase === 'sitemap-complete') return `sitemap complete — ${e.data.host} (${e.data.pageCount} pages)`
    if (e.data.phase === 'sitemap-fallback') return `sitemap failed — ${e.data.host}, falling back to crawl`
    if (e.data.phase === 'crawl-start') return `crawl start — ${e.data.host} (${e.data.maxPages} pages, depth ${e.data.maxDepth}, ${e.data.timeoutMs}ms)`
    if (e.data.phase === 'crawl-complete') return `crawl complete — ${e.data.host} (${e.data.pageCount} pages)`
    if (e.data.phase === 'discovery-complete') return `discovery complete — ${e.data.pageCount} matched pages`
    return `${page}${v}${e.data.phase}${side}`
  }
  if (e.type === 'viewport-done') {
    const page = e.data.pagePath ? `[${e.data.pagePath}] ` : ''
    return `${page}[${e.data.width}px] done — ${e.data.percent.toFixed(2)}%`
  }
  if (e.type === 'done') return `all done — ${e.data.totalPercent?.toFixed(2)}%`
  if (e.type === 'error') return `error: ${e.data.message}`
  return `${e.type} ${JSON.stringify(e.data)}`
}
</script>

<template>
  <div class="overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/70 shadow-xl shadow-black/20 backdrop-blur-xl">
    <div class="flex items-center justify-between border-b border-slate-800/80 px-4 py-3">
      <h2 class="text-sm font-medium text-slate-200">Progress</h2>
      <div class="flex items-center gap-3">
        <span
          class="rounded-full border px-2.5 py-1 text-xs font-medium capitalize"
          :class="{
            'border-slate-600 bg-slate-700/60 text-slate-200': status === 'queued',
            'border-amber-500/20 bg-amber-700/20 text-amber-200': status === 'running',
            'border-emerald-500/20 bg-emerald-700/20 text-emerald-200': status === 'done',
            'border-rose-500/20 bg-rose-700/20 text-rose-200': status === 'error'
          }"
        >
          {{ status }}
        </span>
        <button type="button" class="rounded-xl border border-slate-800/80 bg-slate-950/70 px-3 py-1.5 text-xs text-slate-300 transition hover:border-slate-700 hover:bg-slate-800" @click="toggleCollapsed">
          {{ collapsed ? 'Expand' : 'Collapse' }}
        </button>
      </div>
    </div>
    <div v-if="collapsed" class="px-4 py-3 font-mono text-xs text-slate-300">
      <div v-if="latestEvent" class="leading-relaxed">
        <span class="text-slate-500">{{ new Date(latestEvent.t).toLocaleTimeString() }}</span>
        — {{ fmt(latestEvent) }}
      </div>
      <div v-else class="text-slate-500">Waiting…</div>
    </div>
    <ul v-else ref="listRef" class="max-h-64 overflow-auto px-4 py-3 font-mono text-xs text-slate-300">
      <li v-for="(e, i) in props.events" :key="i" class="border-b border-slate-800/60 py-1.5 leading-relaxed last:border-b-0">
        <span class="text-slate-500">{{ new Date(e.t).toLocaleTimeString() }}</span>
        — {{ fmt(e) }}
      </li>
      <li v-if="!props.events.length" class="text-slate-500">Waiting…</li>
    </ul>
  </div>
</template>
