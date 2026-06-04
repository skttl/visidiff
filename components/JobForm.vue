<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

const props = defineProps<{ submitting: boolean }>()

interface CrawlLimits {
  maxPages: number
  maxDepth: number
  timeoutMs: number
}

interface DirectPayload {
  mode: 'direct'
  urlA: string
  urlB: string
  viewports: number[]
  blockedGlobs: string[]
}

interface SitemapPayload {
  mode: 'sitemap'
  hostA: string
  hostB: string
  viewports: number[]
  blockedGlobs: string[]
  crawlLimits: CrawlLimits
  pageConcurrency: number
}

const emit = defineEmits<{
  (e: 'submit', payload: DirectPayload | SitemapPayload): void
}>()

const HISTORY_KEY = 'visidiff:history'
const LEGACY_KEY = 'visidiff:lastSettings'
const MAX_HISTORY = 50
const DEFAULT_VIEWPORTS = [375, 768, 1440]
const DEFAULT_BLOCKED = ['**/*cookie*', '**/*consent*', '**/*onetrust*', '**/*cookiebot*', 'https://policy.app.cookieinformation.com/*']
const DEFAULT_LIMITS: CrawlLimits = { maxPages: 25, maxDepth: 2, timeoutMs: 15000 }


const DEFAULT_PAGE_CONCURRENCY = 3

interface DirectSavedSettings {
  mode: 'direct'
  urlA: string
  urlB: string
  viewports: number[]
  blockedGlobs: string[]
  savedAt: number
}

interface SitemapSavedSettings {
  mode: 'sitemap'
  hostA: string
  hostB: string
  viewports: number[]
  blockedGlobs: string[]
  crawlLimits: CrawlLimits
  pageConcurrency: number
  savedAt: number
}

type SavedSettings = DirectSavedSettings | SitemapSavedSettings

const mode = ref<'direct' | 'sitemap'>('direct')
const urlA = ref('')
const urlB = ref('')
const hostA = ref('')
const hostB = ref('')
const viewports = ref<number[]>([...DEFAULT_VIEWPORTS])
const newViewport = ref<number | null>(null)
const blockedGlobsText = ref(DEFAULT_BLOCKED.join('\n'))
const maxPages = ref(DEFAULT_LIMITS.maxPages)
const maxDepth = ref(DEFAULT_LIMITS.maxDepth)
const timeoutMs = ref(DEFAULT_LIMITS.timeoutMs)
const pageConcurrency = ref(DEFAULT_PAGE_CONCURRENCY)

const history = ref<SavedSettings[]>([])
const historyOpen = ref(false)

function loadHistory(): SavedSettings[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      if (Array.isArray(data)) return data.map(normalizeSavedSettings).filter(Boolean) as SavedSettings[]
    }
    // Migrate legacy single-entry storage
    const legacy = localStorage.getItem(LEGACY_KEY)
    if (legacy) {
      const data = normalizeSavedSettings(JSON.parse(legacy))
      localStorage.removeItem(LEGACY_KEY)
      if (data) return [data]
    }
  } catch {
    // ignore
  }
  return []
}

function persistHistory() {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.value))
  } catch {}
}

function normalizeSavedSettings(value: any): SavedSettings | null {
  if (!value || typeof value !== 'object') return null
  const viewportsValue = Array.isArray(value.viewports) && value.viewports.length
    ? value.viewports.map((v: unknown) => Number(v)).filter((v: number) => Number.isFinite(v))
    : [...DEFAULT_VIEWPORTS]
  const blockedValue = Array.isArray(value.blockedGlobs)
    ? value.blockedGlobs.map((v: unknown) => String(v).trim()).filter(Boolean)
    : [...DEFAULT_BLOCKED]
  if (value.mode === 'sitemap') {
   const rawMaxPages = Number(value.crawlLimits?.maxPages)
   const rawMaxDepth = Number(value.crawlLimits?.maxDepth)
   const rawTimeoutMs = Number(value.crawlLimits?.timeoutMs)
   const rawPageConcurrency = Number(value.pageConcurrency)
    return {
      mode: 'sitemap',
      hostA: String(value.hostA || ''),
      hostB: String(value.hostB || ''),
      viewports: viewportsValue,
      blockedGlobs: blockedValue,
      crawlLimits: {
        maxPages: Number.isFinite(rawMaxPages) ? rawMaxPages : DEFAULT_LIMITS.maxPages,
        maxDepth: Number.isFinite(rawMaxDepth) ? rawMaxDepth : DEFAULT_LIMITS.maxDepth,
        timeoutMs: Number.isFinite(rawTimeoutMs) ? rawTimeoutMs : DEFAULT_LIMITS.timeoutMs
      },
      pageConcurrency: Number.isFinite(rawPageConcurrency) && rawPageConcurrency >= 1 ? rawPageConcurrency : DEFAULT_PAGE_CONCURRENCY,
      savedAt: Number(value.savedAt) || Date.now()
    }
  }
  return {
    mode: 'direct',
    urlA: String(value.urlA || ''),
    urlB: String(value.urlB || ''),
    viewports: viewportsValue,
    blockedGlobs: blockedValue,
    savedAt: Number(value.savedAt) || Date.now()
  }
}

function sameSettings(a: SavedSettings, b: DirectPayload | SitemapPayload) {
  if (a.mode !== b.mode) return false
  if (a.mode === 'direct' && b.mode === 'direct' && (a.urlA !== b.urlA || a.urlB !== b.urlB)) return false
  if (a.mode === 'sitemap' && b.mode === 'sitemap') {
    if (a.hostA !== b.hostA || a.hostB !== b.hostB) return false
    if (a.crawlLimits.maxPages !== b.crawlLimits.maxPages || a.crawlLimits.maxDepth !== b.crawlLimits.maxDepth || a.crawlLimits.timeoutMs !== b.crawlLimits.timeoutMs) return false
    if (a.pageConcurrency !== b.pageConcurrency) return false
  }
  if (a.viewports.length !== b.viewports.length) return false
  const av = [...a.viewports].sort((x, y) => x - y)
  const bv = [...b.viewports].sort((x, y) => x - y)
  for (let i = 0; i < av.length; i++) if (av[i] !== bv[i]) return false
  if (a.blockedGlobs.length !== b.blockedGlobs.length) return false
  for (let i = 0; i < a.blockedGlobs.length; i++) {
    if (a.blockedGlobs[i] !== b.blockedGlobs[i]) return false
  }
  return true
}

onMounted(() => {
  history.value = loadHistory()
})

function applyEntry(entry: SavedSettings) {
  mode.value = entry.mode
  if (entry.mode === 'direct') {
    urlA.value = entry.urlA || ''
    urlB.value = entry.urlB || ''
  } else {
    hostA.value = entry.hostA || ''
    hostB.value = entry.hostB || ''
    maxPages.value = entry.crawlLimits.maxPages
    maxDepth.value = entry.crawlLimits.maxDepth
    timeoutMs.value = entry.crawlLimits.timeoutMs
    pageConcurrency.value = entry.pageConcurrency ?? DEFAULT_PAGE_CONCURRENCY
  }
  viewports.value =
    Array.isArray(entry.viewports) && entry.viewports.length
      ? [...entry.viewports].sort((a, b) => a - b)
      : [...DEFAULT_VIEWPORTS]
  blockedGlobsText.value = (entry.blockedGlobs || DEFAULT_BLOCKED).join('\n')
}

function pickHistory(entry: SavedSettings) {
  applyEntry(entry)
  historyOpen.value = false
}

function clearHistory() {
  history.value = []
  try {
    localStorage.removeItem(HISTORY_KEY)
  } catch {}
}

function shortUrl(u: string) {
  try {
    const url = new URL(u)
    return url.host + (url.pathname !== '/' ? url.pathname : '')
  } catch {
    return u
  }
}

function entryTargets(entry: SavedSettings) {
  if (entry.mode === 'sitemap') return { a: entry.hostA, b: entry.hostB }
  return { a: shortUrl(entry.urlA), b: shortUrl(entry.urlB) }
}

function entryDate(entry: SavedSettings) {
  if (!entry.savedAt) return ''
  const d = new Date(entry.savedAt)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function entryTime(entry: SavedSettings) {
  if (!entry.savedAt) return ''
  return new Date(entry.savedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function addViewport() {
  const v = Number(newViewport.value)
  if (!Number.isFinite(v) || v < 200 || v > 4000) return
  if (viewports.value.includes(v)) return
  viewports.value = [...viewports.value, v].sort((a, b) => a - b)
  newViewport.value = null
}

function removeViewport(v: number) {
  viewports.value = viewports.value.filter((x) => x !== v)
}

function onSubmit() {
  const blockedGlobs = blockedGlobsText.value
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
  const payload = mode.value === 'sitemap'
    ? {
        mode: 'sitemap' as const,
        hostA: hostA.value.trim(),
        hostB: hostB.value.trim(),
        viewports: viewports.value.slice(),
        blockedGlobs,
        crawlLimits: {
          maxPages: Math.max(1, Math.round(Number(maxPages.value) || DEFAULT_LIMITS.maxPages)),
          maxDepth: Math.max(0, Math.round(Number(maxDepth.value) || DEFAULT_LIMITS.maxDepth)),
          timeoutMs: Math.max(1000, Math.round(Number(timeoutMs.value) || DEFAULT_LIMITS.timeoutMs))
        },
        pageConcurrency: Math.min(10, Math.max(1, Math.round(Number(pageConcurrency.value) || DEFAULT_PAGE_CONCURRENCY)))
      }
    : {
        mode: 'direct' as const,
        urlA: urlA.value.trim(),
        urlB: urlB.value.trim(),
        viewports: viewports.value.slice(),
        blockedGlobs
      }
  // Remove any existing identical entry, prepend the new one, cap at MAX_HISTORY
  const filtered = history.value.filter((h: SavedSettings) => !sameSettings(h, payload))
  filtered.unshift({ ...payload, savedAt: Date.now() })
  history.value = filtered.slice(0, MAX_HISTORY)
  persistHistory()
  emit('submit', payload)
}

const canSubmit = computed(() => {
  const hasTargets = mode.value === 'sitemap'
    ? !!hostA.value.trim() && !!hostB.value.trim()
    : !!urlA.value.trim() && !!urlB.value.trim()
  return hasTargets && viewports.value.length > 0 && !props.submitting
})
</script>

<template>
  <div v-if="history.length" class="mb-4 rounded-2xl border border-slate-800/80 bg-slate-950/70 shadow-inner shadow-black/20">
    <button
      type="button"
      class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      @click="historyOpen = !historyOpen"
    >
      <div class="flex items-center gap-2.5 min-w-0">
        <svg class="size-3.5 shrink-0 text-slate-500" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h3.25a.75.75 0 0 0 0-1.5h-2.5V5Z" clip-rule="evenodd"/></svg>
        <span class="text-sm text-slate-300">Previous settings</span>
        <span class="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] tabular-nums text-slate-400">{{ history.length }}</span>
      </div>
      <div class="flex shrink-0 items-center gap-3">
        <button
          type="button"
          class="rounded-lg px-2.5 py-1 text-xs text-slate-500 transition hover:text-rose-400"
          @click.stop="clearHistory"
        >
          Clear
        </button>
        <svg class="size-4 text-slate-500 transition-transform duration-200" :class="historyOpen ? 'rotate-180' : ''" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd"/></svg>
      </div>
    </button>

    <div v-if="historyOpen" class="border-t border-slate-800/60 px-2 pb-2 pt-1">
      <ul class="max-h-72 overflow-y-auto space-y-1 pr-0.5">
        <li
          v-for="(entry, i) in history"
          :key="i"
          class="group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-slate-800/70"
          @click="pickHistory(entry)"
        >
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <span class="truncate text-xs font-medium text-slate-200">{{ entryTargets(entry).a }}</span>
              <span class="text-[10px] text-slate-600">↔</span>
              <span class="truncate text-xs font-medium text-slate-200">{{ entryTargets(entry).b }}</span>
            </div>
            <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span
                class="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider"
                :class="entry.mode === 'sitemap' ? 'bg-sky-950/80 text-sky-400' : 'bg-emerald-950/80 text-emerald-400'"
              >{{ entry.mode === 'sitemap' ? 'Sitemap' : 'Direct' }}</span>
              <span class="text-[11px] text-slate-500">{{ entry.viewports.join(', ') }}px</span>
              <span v-if="entry.savedAt" class="text-[11px] text-slate-600">{{ entryDate(entry) }} · {{ entryTime(entry) }}</span>
            </div>
          </div>
          <svg class="size-3.5 shrink-0 text-slate-700 transition group-hover:text-slate-400" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd"/></svg>
        </li>
      </ul>
    </div>
  </div>

  <form
    class="grid gap-6 rounded-[1.25rem] border border-slate-800/80 bg-transparent p-3"
    @submit.prevent="onSubmit"
  >
    <div>
      <span class="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Mode</span>
      <div class="inline-flex overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-950/80 p-1 text-sm shadow-inner shadow-black/20">
        <button
          type="button"
          class="rounded-xl px-4 py-2 transition"
          :class="mode === 'direct' ? 'bg-slate-700 text-white shadow-sm shadow-black/30' : 'text-slate-300 hover:bg-slate-800'"
          @click="mode = 'direct'"
        >
          Direct URLs
        </button>
        <button
          type="button"
          class="rounded-xl px-4 py-2 transition"
          :class="mode === 'sitemap' ? 'bg-slate-700 text-white shadow-sm shadow-black/30' : 'text-slate-300 hover:bg-slate-800'"
          @click="mode = 'sitemap'"
        >
          Sitemap mode
        </button>
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-2">
      <label v-if="mode === 'direct'" class="block rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4 shadow-inner shadow-black/20">
        <span class="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">URL A</span>
        <input
          v-model="urlA"
          type="url"
          required
          placeholder="https://example.com"
          class="w-full rounded-xl border border-slate-800/80 bg-slate-900 px-3 py-2.5 text-slate-100 outline-none transition focus:border-sky-400/60 focus:bg-slate-950"
        />
      </label>
      <label v-if="mode === 'direct'" class="block rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4 shadow-inner shadow-black/20">
        <span class="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">URL B</span>
        <input
          v-model="urlB"
          type="url"
          required
          placeholder="https://example.org"
          class="w-full rounded-xl border border-slate-800/80 bg-slate-900 px-3 py-2.5 text-slate-100 outline-none transition focus:border-sky-400/60 focus:bg-slate-950"
        />
      </label>
      <label v-if="mode === 'sitemap'" class="block rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4 shadow-inner shadow-black/20">
        <span class="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Host A</span>
        <input
          v-model="hostA"
          type="text"
          required
          placeholder="example.com or https://example.com"
          class="w-full rounded-xl border border-slate-800/80 bg-slate-900 px-3 py-2.5 text-slate-100 outline-none transition focus:border-sky-400/60 focus:bg-slate-950"
        />
      </label>
      <label v-if="mode === 'sitemap'" class="block rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4 shadow-inner shadow-black/20">
        <span class="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Host B</span>
        <input
          v-model="hostB"
          type="text"
          required
          placeholder="example.org or https://example.org"
          class="w-full rounded-xl border border-slate-800/80 bg-slate-900 px-3 py-2.5 text-slate-100 outline-none transition focus:border-sky-400/60 focus:bg-slate-950"
        />
      </label>
    </div>

    <div v-if="mode === 'sitemap'" class="grid gap-4 sm:grid-cols-2">
      <label class="block rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4 shadow-inner shadow-black/20">
        <span class="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Max pages per host</span>
        <input
          v-model.number="maxPages"
          type="number"
          min="1"
          class="w-full rounded-xl border border-slate-800/80 bg-slate-900 px-3 py-2.5 text-slate-100 outline-none transition focus:border-sky-400/60 focus:bg-slate-950"
        />
      </label>
      <label class="block rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4 shadow-inner shadow-black/20">
        <span class="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Max crawl depth</span>
        <input
          v-model.number="maxDepth"
          type="number"
          min="0"
          max="10"
          class="w-full rounded-xl border border-slate-800/80 bg-slate-900 px-3 py-2.5 text-slate-100 outline-none transition focus:border-sky-400/60 focus:bg-slate-950"
        />
      </label>
      <label class="block rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4 shadow-inner shadow-black/20">
        <span class="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Crawl timeout (ms)</span>
        <input
          v-model.number="timeoutMs"
          type="number"
          min="1000"
          max="120000"
          step="1000"
          class="w-full rounded-xl border border-slate-800/80 bg-slate-900 px-3 py-2.5 text-slate-100 outline-none transition focus:border-sky-400/60 focus:bg-slate-950"
        />
      </label>
      <label class="block rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4 shadow-inner shadow-black/20">
        <span class="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Page concurrency</span>
        <input
          v-model.number="pageConcurrency"
          type="number"
          min="1"
          max="10"
          class="w-full rounded-xl border border-slate-800/80 bg-slate-900 px-3 py-2.5 text-slate-100 outline-none transition focus:border-sky-400/60 focus:bg-slate-950"
        />
        <p class="mt-2 text-xs text-slate-500">
          Pages captured in parallel. 1–3 is safest for most sites; higher values speed up large crawls but consume more memory and may trigger rate limits.
        </p>
      </label>
    </div>

    <div class="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4 shadow-inner shadow-black/20">
      <span class="mb-3 block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Viewport widths (px)</span>
      <div class="flex flex-wrap items-center gap-2">
        <span
          v-for="v in viewports"
          :key="v"
          class="inline-flex items-center gap-2 rounded-full border border-slate-800/80 bg-slate-900 px-3 py-1.5 text-sm text-slate-200"
        >
          {{ v }}
          <button
            type="button"
            class="text-slate-500 transition hover:text-rose-300"
            @click="removeViewport(v)"
          >
            ×
          </button>
        </span>
        <input
          v-model.number="newViewport"
          type="number"
          min="200"
          max="4000"
          placeholder="add..."
          class="w-28 rounded-xl border border-slate-800/80 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-400/60 focus:bg-slate-950"
          @keydown.enter.prevent="addViewport"
        />
        <button
          type="button"
          class="rounded-xl border border-slate-800/80 bg-slate-800 px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-700"
          @click="addViewport"
        >
          Add
        </button>
      </div>
    </div>

    <label class="block rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4 shadow-inner shadow-black/20">
      <span class="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
        Blocked URL globs (one per line; matched with micromatch)
      </span>
      <textarea
        v-model="blockedGlobsText"
        rows="4"
        class="w-full rounded-xl border border-slate-800/80 bg-slate-900 px-3 py-2.5 font-mono text-sm text-slate-100 outline-none transition focus:border-sky-400/60 focus:bg-slate-950"
      />
    </label>

    <div class="flex justify-end">
      <button
        type="submit"
        :disabled="!canSubmit"
        class="rounded-2xl bg-emerald-500 px-5 py-2.5 font-medium text-slate-950 shadow-lg shadow-emerald-950/30 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {{ submitting ? 'Running…' : 'Run diff' }}
      </button>
    </div>
  </form>
</template>
