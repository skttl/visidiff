<script setup lang="ts">
interface SavedRunSummary {
  id: string
  savedAt: number
  input: { mode: string; urlA?: string; urlB?: string; hostA?: string; hostB?: string; viewports: number[] }
  totalPercent: number | null
  resultCount: number
  thumbnail: string | null
}

const runs = ref<SavedRunSummary[]>([])
const loading = ref(true)
const fetchError = ref<string | null>(null)
const regenerating = ref(false)
const regenerateResult = ref<{ regenerated: number; failed: number } | null>(null)

async function regenerateAllThumbnails() {
  regenerating.value = true
  regenerateResult.value = null
  try {
    const res = await fetch('/api/saved-runs/regenerate-thumbnails', { method: 'POST' })
    if (res.ok) regenerateResult.value = await res.json()
  } catch {}
  regenerating.value = false
  const res = await fetch('/api/saved-runs')
  if (res.ok) runs.value = await res.json() as SavedRunSummary[]
}

function formatLabel(run: SavedRunSummary) {
  const { input } = run
  if (input.mode === 'sitemap') return `${input.hostA} ↔ ${input.hostB}`
  try {
    const a = new URL(input.urlA ?? ''); const b = new URL(input.urlB ?? '')
    return `${a.host}${a.pathname === '/' ? '' : a.pathname} ↔ ${b.host}${b.pathname === '/' ? '' : b.pathname}`
  } catch { return `${input.urlA} ↔ ${input.urlB}` }
}

function formatMeta(run: SavedRunSummary) {
  const vp = run.input.viewports.join(', ')
  const mode = run.input.mode === 'sitemap' ? 'Sitemap' : 'Direct'
  const date = run.savedAt ? new Date(run.savedAt).toLocaleString() : ''
  return `${mode} · ${vp}px · ${run.resultCount} results · ${date}`
}

onMounted(async () => {
  try {
    const res = await fetch('/api/saved-runs')
    if (!res.ok) throw new Error('Failed to load saved runs')
    runs.value = await res.json() as SavedRunSummary[]
  } catch (e: any) {
    fetchError.value = e?.message || 'Failed to load saved runs'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <main class="mt-6">
    <div class="mb-5 flex items-center justify-between gap-4">
      <div>
        <h1 class="text-sm font-semibold text-slate-100">Saved runs</h1>
        <p class="text-xs text-slate-500">Completed runs saved on disk.</p>
      </div>
      <div class="flex items-center gap-2">
        <button
          v-if="runs.length"
          type="button"
          :disabled="regenerating"
          class="rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 transition hover:border-slate-600 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          @click="regenerateAllThumbnails"
        >
          <span v-if="regenerating" class="inline-flex items-center gap-1.5">
            <svg class="size-3 animate-spin" viewBox="0 0 24 24" fill="none"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
            Regenerating…
          </span>
          <span v-else-if="regenerateResult">Regenerated {{ regenerateResult.regenerated }}</span>
          <span v-else>Regenerate thumbnails</span>
        </button>
        <NuxtLink
          to="/settings"
          class="rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-medium text-slate-950 transition hover:bg-emerald-400"
        >
          New run
        </NuxtLink>
      </div>
    </div>

    <div v-if="loading" class="py-12 text-center text-sm text-slate-400">Loading…</div>
    <div v-else-if="fetchError" class="rounded-2xl border border-rose-500/30 bg-rose-950/50 px-4 py-3 text-sm text-rose-200">{{ fetchError }}</div>
    <div v-else-if="!runs.length" class="rounded-[1.75rem] border border-dashed border-slate-800/80 bg-slate-900/45 px-8 py-12 text-center shadow-inner shadow-black/20 backdrop-blur-sm">
      <div class="text-sm font-semibold text-slate-200">No saved runs yet</div>
      <p class="mt-2 text-sm text-slate-500">Completed runs will appear here.</p>
      <NuxtLink to="/settings" class="mt-5 inline-block rounded-2xl bg-emerald-500 px-5 py-2.5 text-sm font-medium text-slate-950 shadow-lg shadow-emerald-950/30 transition hover:bg-emerald-400">
        Start a run
      </NuxtLink>
    </div>
    <ul v-else class="space-y-2">
      <li
        v-for="run in runs"
        :key="run.id"
        class="flex items-center justify-between gap-4 rounded-2xl border border-slate-800/80 bg-slate-900/65 px-4 py-3 transition hover:border-slate-700 hover:bg-slate-800/50"
      >
        <NuxtLink :to="`/runs/${run.id}`" class="flex min-w-0 flex-1 items-center gap-3">
          <img v-if="run.thumbnail" :src="run.thumbnail" class="size-10 shrink-0 rounded-lg object-cover" />
          <div v-else class="size-10 shrink-0 rounded-lg bg-slate-800" />
          <div class="min-w-0">
            <div class="truncate text-sm font-medium text-slate-200">{{ formatLabel(run) }}</div>
            <div class="mt-0.5 truncate text-xs text-slate-500">{{ formatMeta(run) }}</div>
          </div>
        </NuxtLink>
        <div class="flex shrink-0 items-center gap-3">
          <span
            v-if="run.totalPercent !== null"
            class="text-sm font-semibold tabular-nums"
            :class="run.totalPercent < 1 ? 'text-emerald-400' : run.totalPercent < 5 ? 'text-amber-400' : 'text-rose-400'"
          >
            {{ run.totalPercent.toFixed(2) }}%
          </span>
          <NuxtLink
            :to="`/runs/${run.id}`"
            class="rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 transition hover:border-slate-600 hover:bg-slate-700"
          >
            View
          </NuxtLink>
        </div>
      </li>
    </ul>
  </main>
</template>
