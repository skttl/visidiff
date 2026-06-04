<script setup lang="ts">
const HISTORY_KEY = 'visidiff:history'

interface SavedRunSummary {
  id: string
  savedAt: number
  input: { mode: string; urlA?: string; urlB?: string; hostA?: string; hostB?: string; viewports: number[] }
  totalPercent: number | null
  resultCount: number
  thumbnail: string | null
}

interface LocalHistoryEntry {
  mode: 'direct' | 'sitemap'
  urlA?: string
  urlB?: string
  hostA?: string
  hostB?: string
  viewports: number[]
  savedAt: number
}

const localHistory = ref<LocalHistoryEntry[]>([])
const savedRuns = ref<SavedRunSummary[]>([])

function loadLocalHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      if (Array.isArray(data)) {
        localHistory.value = data.slice(0, 5).map((item: any) => ({
          mode: item.mode || 'direct',
          urlA: item.urlA,
          urlB: item.urlB,
          hostA: item.hostA,
          hostB: item.hostB,
          viewports: Array.isArray(item.viewports) ? item.viewports : [],
          savedAt: Number(item.savedAt) || 0
        }))
      }
    }
  } catch {}
}

async function loadSavedRunsSilent() {
  try {
    const res = await fetch('/api/saved-runs')
    if (res.ok) savedRuns.value = await res.json() as SavedRunSummary[]
  } catch {}
}

function formatRunLabel(run: SavedRunSummary) {
  const { input } = run
  if (input.mode === 'sitemap') return `${input.hostA} ↔ ${input.hostB}`
  try {
    const a = new URL(input.urlA ?? ''); const b = new URL(input.urlB ?? '')
    return `${a.host}${a.pathname === '/' ? '' : a.pathname} ↔ ${b.host}${b.pathname === '/' ? '' : b.pathname}`
  } catch { return `${input.urlA} ↔ ${input.urlB}` }
}

function formatRunMeta(run: SavedRunSummary) {
  const vp = run.input.viewports.join(', ')
  const mode = run.input.mode === 'sitemap' ? 'Sitemap' : 'Direct'
  const date = run.savedAt ? new Date(run.savedAt).toLocaleString() : ''
  return `${mode} · ${vp}px · ${run.resultCount} results · ${date}`
}

onMounted(() => {
  loadLocalHistory()
  void loadSavedRunsSilent()
})
</script>

<template>
  <main class="mt-6">
    <div class="rounded-[1.75rem] border border-dashed border-slate-800/80 bg-slate-900/45 shadow-inner shadow-black/20 backdrop-blur-sm">
      <div class="px-8 py-12 text-center">
        <div class="text-base font-semibold text-slate-200">Visual regression, simplified</div>
        <p class="mt-2 text-sm text-slate-500">Compare two URLs or crawl an entire site across multiple viewport widths.</p>
        <div class="mt-6 flex flex-wrap justify-center gap-3">
          <NuxtLink
            to="/settings"
            class="rounded-2xl bg-emerald-500 px-5 py-2.5 text-sm font-medium text-slate-950 shadow-lg shadow-emerald-950/30 transition hover:bg-emerald-400"
          >
            New run
          </NuxtLink>
          <NuxtLink
            to="/runs"
            class="rounded-2xl border border-slate-700 bg-slate-800/70 px-5 py-2.5 text-sm font-medium text-slate-200 transition hover:border-slate-600 hover:bg-slate-700"
          >
            Saved runs
          </NuxtLink>
        </div>
      </div>

      <div v-if="localHistory.length || savedRuns.length" class="grid gap-4 border-t border-slate-800/60 px-6 py-6 sm:grid-cols-2">
        <div v-if="localHistory.length">
          <div class="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">Recent settings</div>
          <ul class="space-y-2">
            <li
              v-for="(entry, i) in localHistory"
              :key="i"
              class="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-slate-800/80 bg-slate-950/60 px-4 py-3 transition hover:border-slate-700 hover:bg-slate-900"
            >
              <NuxtLink to="/settings" class="min-w-0 flex-1">
                <div class="truncate text-xs font-medium text-slate-200">
                  <span v-if="entry.mode === 'sitemap'">{{ entry.hostA }} ↔ {{ entry.hostB }}</span>
                  <span v-else>{{ entry.urlA }} ↔ {{ entry.urlB }}</span>
                </div>
                <div class="mt-0.5 text-[11px] text-slate-500">
                  {{ entry.mode === 'sitemap' ? 'Sitemap' : 'Direct' }} · {{ entry.viewports.join(', ') }}px
                  <span v-if="entry.savedAt"> · {{ new Date(entry.savedAt).toLocaleDateString() }}</span>
                </div>
              </NuxtLink>
              <svg class="size-3.5 shrink-0 text-slate-600" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd"/></svg>
            </li>
          </ul>
        </div>

        <div v-if="savedRuns.length">
          <div class="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">Recent saved runs</div>
          <ul class="space-y-2">
            <li
              v-for="run in savedRuns.slice(0, 5)"
              :key="run.id"
              class="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-slate-800/80 bg-slate-950/60 px-4 py-3 transition hover:border-slate-700 hover:bg-slate-900"
            >
              <NuxtLink :to="`/runs/${run.id}`" class="flex min-w-0 flex-1 items-center gap-3">
                <img v-if="run.thumbnail" :src="run.thumbnail" class="size-8 shrink-0 rounded-md object-cover" />
                <div v-else class="size-8 shrink-0 rounded-md bg-slate-800" />
                <div class="min-w-0">
                  <div class="truncate text-xs font-medium text-slate-200">{{ formatRunLabel(run) }}</div>
                  <div class="mt-0.5 truncate text-[11px] text-slate-500">{{ formatRunMeta(run) }}</div>
                </div>
              </NuxtLink>
              <div class="flex shrink-0 items-center gap-2">
                <span
                  v-if="run.totalPercent !== null"
                  class="text-xs font-semibold tabular-nums"
                  :class="run.totalPercent < 1 ? 'text-emerald-400' : run.totalPercent < 5 ? 'text-amber-400' : 'text-rose-400'"
                >{{ run.totalPercent.toFixed(2) }}%</span>
                <svg class="size-3.5 shrink-0 text-slate-600" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd"/></svg>
              </div>
            </li>
          </ul>
          <NuxtLink
            v-if="savedRuns.length > 5"
            to="/runs"
            class="mt-2 block w-full rounded-2xl border border-slate-800/80 bg-slate-950/40 px-4 py-2 text-center text-xs text-slate-400 transition hover:border-slate-700 hover:bg-slate-900 hover:text-slate-300"
          >
            View all {{ savedRuns.length }} saved runs
          </NuxtLink>
        </div>
      </div>
    </div>
  </main>
</template>
