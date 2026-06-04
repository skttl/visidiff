<script setup lang="ts">
import ViewportResult from '~/components/ViewportResult.vue'

interface ResultItem {
  pagePath: string
  pageLabel: string
  urlA: string
  urlB: string
  width: number
  percent: number
  size: { width: number; height: number }
  files: { a: string; b: string; diff: string }
}

interface PendingPageItem {
  pagePath: string
  pageLabel: string
  urlA: string
  urlB: string
}

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
}

type RunPayload = DirectPayload | SitemapPayload

const route = useRoute()
const id = computed(() => route.params.id as string)

const defaultTitle = 'VisiDiff'
const status = ref<'idle' | 'queued' | 'running' | 'done' | 'error' | 'cancelled'>('idle')
const error = ref<string | null>(null)
const events = ref<{ type: string; data: any; t: number }[]>([])
const results = ref<ResultItem[]>([])
const totalPercent = ref<number | null>(null)
const submittedViewports = ref<number[]>([])
const submittedBlockedGlobs = ref<string[]>([])
const totalTasks = ref<number | null>(null)
const runStartedAt = ref<number | null>(null)
const currentMode = ref<'direct' | 'sitemap'>('direct')
const compareUrlA = ref<string | null>(null)
const compareUrlB = ref<string | null>(null)
const compareLabel = ref<string | null>(null)
const pendingPages = ref<PendingPageItem[]>([])
const selectedViewportByPage = ref<Record<string, number>>({})
const collapsedPages = ref<Record<string, boolean>>({})
const rerunningPages = ref<Set<string>>(new Set())
const exportingPdf = ref(false)
const exportPdfError = ref<string | null>(null)
const pdfCountdown = ref<number | null>(null)
const pdfLocale = ref<'en' | 'da'>('en')
let pdfCountdownTimer: ReturnType<typeof setInterval> | null = null

const defaultFaviconHref = '/favicon.svg'
let faviconTimer: number | null = null
let titleTimer: number | null = null
let es: EventSource | null = null

function ensureFaviconLink() {
  let link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }
  return link
}

function buildSpinnerFavicon(frame: number) {
  const rotation = frame * 45
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#020617"/><path d="M16 20h14v24H16z" fill="#22c55e" opacity="0.35"/><path d="M34 20h14v24H34z" fill="#38bdf8" opacity="0.35"/><g transform="translate(32 32) rotate(${rotation})"><circle cx="0" cy="-18" r="5" fill="#f8fafc" opacity="1"/><circle cx="12.7" cy="-12.7" r="4.5" fill="#f8fafc" opacity="0.85"/><circle cx="18" cy="0" r="4" fill="#f8fafc" opacity="0.7"/><circle cx="12.7" cy="12.7" r="3.5" fill="#f8fafc" opacity="0.55"/><circle cx="0" cy="18" r="3" fill="#f8fafc" opacity="0.4"/><circle cx="-12.7" cy="12.7" r="2.5" fill="#f8fafc" opacity="0.3"/><circle cx="-18" cy="0" r="2" fill="#f8fafc" opacity="0.22"/><circle cx="-12.7" cy="-12.7" r="1.5" fill="#f8fafc" opacity="0.16"/></g></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function startFaviconSpinner() {
  stopFaviconSpinner()
  let frame = 0
  const link = ensureFaviconLink()
  link.href = buildSpinnerFavicon(frame)
  faviconTimer = window.setInterval(() => {
    frame = (frame + 1) % 8
    link.href = buildSpinnerFavicon(frame)
  }, 150)
}

function stopFaviconSpinner() {
  if (faviconTimer) { window.clearInterval(faviconTimer); faviconTimer = null }
  const link = ensureFaviconLink()
  link.href = defaultFaviconHref
}

function startTitleTimer() {
  stopTitleTimer()
  titleTimer = window.setInterval(() => { setDocumentTitle() }, 1000)
}

function stopTitleTimer() {
  if (titleTimer) { window.clearInterval(titleTimer); titleTimer = null }
}

function formatCountdown(secs: number): string {
  const s = Math.max(0, secs)
  const m = Math.floor(s / 60)
  const rem = s % 60
  if (m <= 0) return `${s}s`
  if (m < 60) return rem > 0 ? `${m}m ${rem}s` : `${m}m`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`
}

function formatEta(ms: number) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes <= 0) return `${seconds}s left`
  if (minutes < 60) return `${minutes}m ${seconds}s left`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m left`
}

function setDocumentTitle() {
  if (status.value === 'queued') { document.title = `[queued] ${defaultTitle}`; return }
  if (status.value === 'running') {
    const latestStep = [...events.value].reverse().find((e) => e.type === 'step')
    const phase = latestStep?.data?.phase ? ` ${latestStep.data.phase}` : ''
    const pct = getRunningPercent()
    const eta = getEstimatedTimeLeft()
    const etaLabel = eta !== null ? ` · ${formatEta(eta)}` : ''
    document.title = submittedViewports.value.length > 0
      ? `[${pct}%]${phase}${etaLabel} · ${defaultTitle}`
      : `[running]${phase} · ${defaultTitle}`
    return
  }
  if (status.value === 'done') { document.title = totalPercent.value !== null ? `[${totalPercent.value.toFixed(2)}%] ${defaultTitle}` : defaultTitle; return }
  if (status.value === 'error') { document.title = `[error] ${defaultTitle}`; return }
  if (status.value === 'cancelled') { document.title = `[cancelled] ${defaultTitle}`; return }
  document.title = defaultTitle
}

async function notifyDone(title: string, body: string) {
  if (!('Notification' in window)) return
  if (Notification.permission === 'default') {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return
  }
  if (Notification.permission !== 'granted') return
  new Notification(title, { body, icon: defaultFaviconHref, badge: defaultFaviconHref, tag: 'visidiff-run' })
}

function getRunningPercent() {
  const knownTotalTasks = totalTasks.value
  if (knownTotalTasks && knownTotalTasks > 0) {
    const complete = results.value.length
    const runningStepCount = events.value.filter((evt) => evt.type === 'step' && typeof evt.data?.viewport === 'number').length
    const partial = results.value.length === 0 && runningStepCount > 0 ? 0.05 : 0.35
    const current = complete < knownTotalTasks ? complete + partial : complete
    return Math.max(0, Math.min(100, Math.round((current / knownTotalTasks) * 100)))
  }
  const totalVp = submittedViewports.value.length
  if (!totalVp) return 0
  const phaseWeights: Record<string, number> = { start: 0, 'capture-a': 2, load: 8, scroll: 18, settle: 25, shot: 33, 'capture-b': 36, diff: 92 }
  const perViewport = new Map<number, number>()
  for (const w of submittedViewports.value) perViewport.set(w, 0)
  for (const evt of events.value) {
    if (evt.type === 'viewport-done' && typeof evt.data?.width === 'number') { perViewport.set(evt.data.width, 100); continue }
    if (evt.type !== 'step' || typeof evt.data?.viewport !== 'number') continue
    const vp = evt.data.viewport as number
    const phase = String(evt.data.phase || '')
    const side = evt.data.side ? String(evt.data.side) : ''
    let w = perViewport.get(vp) ?? 0
    if (phase === 'load' && side === 'b') w = 44
    else if (phase === 'scroll' && side === 'b') w = 58
    else if (phase === 'settle' && side === 'b') w = 75
    else if (phase === 'shot' && side === 'b') w = 88
    else if (phase in phaseWeights) w = phaseWeights[phase]
    perViewport.set(vp, Math.max(perViewport.get(vp) ?? 0, w))
  }
  const total = Array.from(perViewport.values()).reduce((s, v) => s + v, 0)
  return Math.max(0, Math.min(100, Math.round(total / totalVp)))
}

function getEstimatedTimeLeft() {
  if (!runStartedAt.value) return null
  const progress = getRunningPercent()
  if (progress <= 0 || progress >= 100) return null
  const elapsed = Date.now() - runStartedAt.value
  if (elapsed <= 0) return null
  const remaining = elapsed / (progress / 100) - elapsed
  return remaining > 0 ? remaining : 0
}

const progressPercent = computed(() => {
  if (status.value === 'done') return 100
  if (status.value === 'error' || status.value === 'idle') return 0
  return getRunningPercent()
})

const estimatedTimeLeft = computed(() => status.value !== 'running' ? null : getEstimatedTimeLeft())
const completedTasks = computed(() => results.value.length)

type SortKey = 'runOrder' | 'title' | 'path' | 'diff'
const sortKey = ref<SortKey>('runOrder')
const sortDir = ref<'asc' | 'desc'>('asc')

function setSort(key: SortKey) {
  if (sortKey.value === key) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  else { sortKey.value = key; sortDir.value = 'asc' }
}

const pageRunOrder = computed(() => {
  const order = new Map<string, number>()
  let i = 0
  for (const evt of events.value) {
    if (evt.type === 'batch-ready' && Array.isArray(evt.data?.pages)) {
      for (const p of evt.data.pages) { if (!order.has(p.pagePath)) order.set(p.pagePath, i++) }
    }
  }
  for (const r of results.value) { if (!order.has(r.pagePath)) order.set(r.pagePath, i++) }
  return order
})

const activePages = computed(() => {
  const done = new Set(results.value.map(r => r.pagePath))
  const started = new Set<string>()
  for (const evt of events.value) { if (evt.type === 'step' && evt.data?.pagePath) started.add(evt.data.pagePath) }
  const active = new Set<string>()
  for (const p of started) { if (!done.has(p)) active.add(p) }
  return active
})

const groupedResults = computed(() => {
  const groups = new Map<string, { pagePath: string; pageLabel: string; urlA: string; urlB: string; results: ResultItem[]; averagePercent: number; isPending: boolean }>()
  for (const page of pendingPages.value) {
    groups.set(page.pagePath, { pagePath: page.pagePath, pageLabel: page.pageLabel, urlA: page.urlA, urlB: page.urlB, results: [], averagePercent: 0, isPending: true })
  }
  for (const result of results.value) {
    const existing = groups.get(result.pagePath) || { pagePath: result.pagePath, pageLabel: result.pageLabel, urlA: result.urlA, urlB: result.urlB, results: [], averagePercent: 0, isPending: false }
    existing.results.push(result)
    existing.isPending = false
    groups.set(result.pagePath, existing)
  }
  return Array.from(groups.values()).map((group) => ({
    ...group,
    results: [...group.results].sort((a, b) => a.width - b.width),
    averagePercent: group.results.reduce((sum, item) => sum + item.percent, 0) / Math.max(group.results.length, 1)
  }))
})

const sortedGroups = computed(() => {
  const order = pageRunOrder.value
  const key = sortKey.value
  const dir = sortDir.value === 'asc' ? 1 : -1
  return [...groupedResults.value].sort((a, b) => {
    let cmp = 0
    if (key === 'runOrder') cmp = (order.get(a.pagePath) ?? 9999) - (order.get(b.pagePath) ?? 9999)
    else if (key === 'title') cmp = a.pageLabel.localeCompare(b.pageLabel)
    else if (key === 'path') cmp = a.pagePath.localeCompare(b.pagePath)
    else if (key === 'diff') cmp = a.averagePercent - b.averagePercent
    return cmp * dir
  })
})

watch(groupedResults, (groups) => {
  const nextSelection: Record<string, number> = {}
  const nextCollapsed: Record<string, boolean> = {}
  for (const group of groups) {
    const availableWidths = group.results.map(result => result.width)
    const existing = selectedViewportByPage.value[group.pagePath]
    if (availableWidths.length > 0) nextSelection[group.pagePath] = availableWidths.includes(existing) ? existing : availableWidths[0]
    nextCollapsed[group.pagePath] = collapsedPages.value[group.pagePath] ?? currentMode.value === 'sitemap'
  }
  selectedViewportByPage.value = nextSelection
  collapsedPages.value = nextCollapsed
}, { immediate: true })

function getSelectedResult(pagePath: string) {
  const group = groupedResults.value.find(item => item.pagePath === pagePath)
  if (!group) return null
  const selectedWidth = selectedViewportByPage.value[pagePath]
  return group.results.find(result => result.width === selectedWidth) || group.results[0] || null
}

function formatCompareUrl(url: string) {
  try { const p = new URL(url); return `${p.host}${p.pathname}${p.search}` } catch { return url }
}

function toExternalHref(url: string) {
  try { return new URL(url).toString() } catch { return `https://${url.replace(/^\/+/, '')}` }
}

function togglePage(pagePath: string) {
  collapsedPages.value[pagePath] = !collapsedPages.value[pagePath]
}

async function exportPdf() {
  exportingPdf.value = true
  exportPdfError.value = null
  const secsPerResult = 0.15
  const estimated = Math.max(5, Math.round(results.value.length * secsPerResult))
  pdfCountdown.value = estimated
  pdfCountdownTimer = setInterval(() => {
    if (pdfCountdown.value !== null && pdfCountdown.value > 0) pdfCountdown.value--
  }, 1000)
  try {
    const res = await fetch(`/api/report/${id.value}?lang=${pdfLocale.value}`)
    if (!res.ok) { const text = await res.text().catch(() => ''); throw new Error(text || `Server error ${res.status}`) }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `visidiff-report-${id.value}.pdf`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
    exportingPdf.value = false
  } catch (e: any) {
    exportPdfError.value = e?.message || 'Failed to generate PDF'
  } finally {
    if (pdfCountdownTimer !== null) { clearInterval(pdfCountdownTimer); pdfCountdownTimer = null }
    pdfCountdown.value = null
  }
}

async function cancelRun() {
  try { await fetch(`/api/cancel/${id.value}`, { method: 'POST' }) } catch {}
}

async function rerunPage(pagePath: string, urlA: string, urlB: string) {
  if (rerunningPages.value.has(pagePath)) return
  rerunningPages.value = new Set([...rerunningPages.value, pagePath])
  const payload: DirectPayload = { mode: 'direct', urlA, urlB, viewports: submittedViewports.value, blockedGlobs: submittedBlockedGlobs.value }
  try {
    const response = await fetch('/api/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
    if (!response.ok) throw new Error('Failed to start re-run')
    const { id: rerunId } = await response.json() as { id: string }
    await new Promise<void>((resolve) => {
      const pageEs = new EventSource(`/api/events/${rerunId}`)
      pageEs.addEventListener('viewport-done', (ev) => {
        const data = JSON.parse((ev as MessageEvent).data) as ResultItem
        const incoming = { ...data, pagePath }
        results.value = [...results.value.filter(r => r.pagePath !== pagePath), incoming]
      })
      pageEs.addEventListener('done', () => { pageEs.close(); resolve() })
      pageEs.addEventListener('error', () => { pageEs.close(); resolve() })
      pageEs.addEventListener('close', () => { pageEs.close(); resolve() })
    })
  } catch {}
  rerunningPages.value = new Set([...rerunningPages.value].filter(p => p !== pagePath))
}

function openStream(streamId: string) {
  if (es) es.close()
  es = new EventSource(`/api/events/${streamId}`)
  es.addEventListener('status', (ev) => {
    const data = JSON.parse((ev as MessageEvent).data)
    if (data.status) status.value = data.status
    if (data.status === 'cancelled') { stopFaviconSpinner(); stopTitleTimer() }
    if (data.error) error.value = data.error
    events.value.push({ type: 'status', data, t: Date.now() })
    setDocumentTitle()
  })
  es.addEventListener('step', (ev) => {
    const data = JSON.parse((ev as MessageEvent).data)
    events.value.push({ type: 'step', data, t: Date.now() })
    if (status.value === 'queued') status.value = 'running'
    setDocumentTitle()
  })
  es.addEventListener('batch-ready', (ev) => {
    const data = JSON.parse((ev as MessageEvent).data)
    if (typeof data.taskCount === 'number') totalTasks.value = data.taskCount
    if (Array.isArray(data.pages)) pendingPages.value = data.pages
    events.value.push({ type: 'batch-ready', data, t: Date.now() })
    setDocumentTitle()
  })
  es.addEventListener('viewport-done', (ev) => {
    const data = JSON.parse((ev as MessageEvent).data) as ResultItem
    results.value.push(data)
    pendingPages.value = pendingPages.value.filter(page => page.pagePath !== data.pagePath)
    events.value.push({ type: 'viewport-done', data, t: Date.now() })
    setDocumentTitle()
  })
  es.addEventListener('page-skipped', (ev) => {
    const data = JSON.parse((ev as MessageEvent).data)
    pendingPages.value = pendingPages.value.filter(page => page.pagePath !== data.pagePath)
    events.value.push({ type: 'page-skipped', data, t: Date.now() })
    setDocumentTitle()
  })
  es.addEventListener('done', (ev) => {
    const data = JSON.parse((ev as MessageEvent).data)
    totalPercent.value = data.totalPercent ?? null
    status.value = 'done'
    events.value.push({ type: 'done', data, t: Date.now() })
    stopFaviconSpinner(); stopTitleTimer(); setDocumentTitle()
    void notifyDone('VisiDiff run complete', `Overall difference: ${(data.totalPercent ?? 0).toFixed(2)}%`)
  })
  es.addEventListener('error', (ev) => {
    const raw = (ev as MessageEvent).data
    if (raw) { try { const data = JSON.parse(raw); error.value = data.message || 'Error' } catch { error.value = 'Stream error' } }
    stopFaviconSpinner(); stopTitleTimer()
    status.value = 'error'; setDocumentTitle()
    void notifyDone('VisiDiff run failed', error.value || 'The visual diff run failed.')
  })
  es.addEventListener('close', () => { es?.close(); es = null })
}

async function loadSavedRun(runId: string) {
  try {
    const res = await fetch(`/api/saved-runs/${runId}`)
    if (!res.ok) { error.value = 'Run not found'; return }
    const data = await res.json() as { id: string; savedAt: number; input: RunPayload; totalPercent: number | null; results: ResultItem[]; thumbnail?: string | null }
    status.value = 'done'
    totalPercent.value = data.totalPercent ?? null
    results.value = data.results
    submittedViewports.value = data.input.viewports
    submittedBlockedGlobs.value = data.input.blockedGlobs ?? []
    totalTasks.value = data.results.length
    currentMode.value = data.input.mode
    compareUrlA.value = data.input.mode === 'sitemap' ? data.input.hostA : data.input.urlA
    compareUrlB.value = data.input.mode === 'sitemap' ? data.input.hostB : data.input.urlB
    compareLabel.value = data.input.mode === 'sitemap'
      ? `${data.input.hostA} ↔ ${data.input.hostB}`
      : `${data.input.urlA} ↔ ${data.input.urlB}`
    setDocumentTitle()
    if (!data.thumbnail && data.results.length > 0) {
      fetch(`/api/saved-runs/${runId}/thumbnail`, { method: 'POST' }).catch(() => {})
    }
  } catch (e: any) {
    error.value = e?.message || 'Failed to load run'
  }
}

async function checkLiveJob(runId: string) {
  try {
    const res = await fetch(`/api/jobs/${runId}`)
    if (!res.ok) return false
    const job = await res.json() as { id: string; status: string; input: RunPayload; results: ResultItem[] } | null
    if (!job) return false
    submittedViewports.value = job.input.viewports
    submittedBlockedGlobs.value = job.input.blockedGlobs ?? []
    currentMode.value = job.input.mode
    compareUrlA.value = job.input.mode === 'sitemap' ? job.input.hostA : job.input.urlA
    compareUrlB.value = job.input.mode === 'sitemap' ? job.input.hostB : job.input.urlB
    compareLabel.value = job.input.mode === 'sitemap'
      ? `${job.input.hostA} ↔ ${job.input.hostB}`
      : `${job.input.urlA} ↔ ${job.input.urlB}`
    if (job.results?.length) { results.value = job.results; totalTasks.value = job.results.length }
    if (job.status === 'done' || job.status === 'error' || job.status === 'cancelled') {
      status.value = job.status as typeof status.value
      setDocumentTitle()
    } else {
      status.value = job.status as typeof status.value
      runStartedAt.value = Date.now()
      startFaviconSpinner(); startTitleTimer(); setDocumentTitle()
      openStream(runId)
    }
    return true
  } catch {
    return false
  }
}

onMounted(async () => {
  stopFaviconSpinner(); stopTitleTimer(); setDocumentTitle()
  const runId = id.value
  const isLive = await checkLiveJob(runId)
  if (!isLive) await loadSavedRun(runId)
})

onBeforeUnmount(() => {
  stopFaviconSpinner(); stopTitleTimer()
  document.title = defaultTitle
  es?.close()
  if (pdfCountdownTimer !== null) { clearInterval(pdfCountdownTimer); pdfCountdownTimer = null }
})
</script>

<template>
  <main data-testid="page" class="mt-4">
    <div class="mb-4 rounded-[1.5rem] border border-slate-800/80 bg-slate-900/75 px-5 py-4 backdrop-blur-xl">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <p v-if="compareLabel && compareUrlA && compareUrlB" class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            <a :href="toExternalHref(compareUrlA)" target="_blank" rel="noopener noreferrer" class="max-w-full truncate text-sky-400 hover:text-sky-300 hover:underline">{{ formatCompareUrl(compareUrlA) }}</a>
            <span>↔</span>
            <a :href="toExternalHref(compareUrlB)" target="_blank" rel="noopener noreferrer" class="max-w-full truncate text-sky-400 hover:text-sky-300 hover:underline">{{ formatCompareUrl(compareUrlB) }}</a>
          </p>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <template v-if="status === 'done'">
            <div class="flex overflow-hidden rounded-xl border border-slate-800/80 bg-slate-950/70 text-xs">
              <button
                type="button"
                class="px-2.5 py-1.5 transition"
                :class="pdfLocale === 'en' ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'"
                @click="pdfLocale = 'en'"
              >EN</button>
              <button
                type="button"
                class="px-2.5 py-1.5 transition"
                :class="pdfLocale === 'da' ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'"
                @click="pdfLocale = 'da'"
              >DA</button>
            </div>
            <button
              data-testid="btn-export-pdf"
              type="button"
              class="rounded-xl border border-slate-800/80 bg-slate-950/70 px-3 py-1.5 text-xs text-slate-300 transition hover:border-slate-700 hover:bg-slate-800"
              @click="exportPdf"
            >
              Export PDF
            </button>
          </template>
        </div>
      </div>

      <div class="mt-4 flex flex-wrap gap-3">
        <div data-testid="stat-run-state" class="rounded-2xl border border-slate-800/80 bg-slate-950/70 px-4 py-3">
          <div class="text-[11px] uppercase tracking-[0.18em] text-slate-500">Run state</div>
          <div data-testid="run-status" class="mt-2 text-sm font-medium capitalize text-slate-200">{{ status }}</div>
        </div>
        <div data-testid="stat-overall-diff" class="rounded-2xl border border-slate-800/80 bg-slate-950/70 px-4 py-3">
          <div class="text-[11px] uppercase tracking-[0.18em] text-slate-500">Overall difference</div>
          <div v-if="totalPercent !== null" data-testid="overall-diff-value" class="mt-2 text-2xl font-semibold" :class="totalPercent < 1 ? 'text-emerald-400' : totalPercent < 5 ? 'text-amber-400' : 'text-rose-400'">
            {{ totalPercent.toFixed(2) }}%
          </div>
          <div v-else class="mt-2 text-sm text-slate-500">—</div>
        </div>
        <div v-if="status !== 'done' && status !== 'cancelled' && status !== 'idle'" data-testid="stat-run-progress" class="min-w-[16rem] flex-1 rounded-2xl border border-slate-800/80 bg-slate-950/70 px-4 py-3">
          <div class="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
            <div class="flex flex-wrap items-center gap-3">
              <span class="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                <svg v-if="status === 'running'" class="size-3 animate-spin" viewBox="0 0 24 24" fill="none"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                Run progress
              </span>
              <span data-testid="progress-percent" class="text-slate-400">{{ progressPercent }}%</span>
              <span v-if="totalTasks" data-testid="progress-tasks" class="text-xs text-slate-500">{{ completedTasks }}/{{ totalTasks }}</span>
            </div>
            <div class="flex items-center gap-3">
              <span v-if="estimatedTimeLeft !== null" data-testid="progress-eta" class="text-xs text-slate-400">ETA {{ formatEta(estimatedTimeLeft) }}</span>
              <span v-else-if="status === 'queued'" class="text-xs text-slate-400">Waiting to start</span>
              <button
                v-if="status === 'queued' || status === 'running'"
                data-testid="btn-cancel"
                type="button"
                class="rounded-xl border border-rose-500/40 bg-rose-950/60 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:border-rose-400/60 hover:bg-rose-900/60 hover:text-rose-200"
                @click="cancelRun"
              >
                Cancel
              </button>
            </div>
          </div>
          <div data-testid="progress-bar-track" class="h-2.5 overflow-hidden rounded-full bg-slate-800/90">
            <div data-testid="progress-bar-fill" class="h-full rounded-full bg-emerald-400 transition-all duration-300" :style="{ width: `${progressPercent}%` }" />
          </div>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="exportingPdf" data-testid="modal-export-pdf" class="fixed inset-0 z-50 flex items-center justify-center px-4">
        <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" />
        <div class="relative w-full max-w-sm rounded-[1.5rem] border border-slate-800/80 bg-slate-900 p-6 shadow-2xl shadow-black/40">
          <div class="mb-4 text-sm font-semibold text-slate-100">Generating PDF…</div>
          <p class="mb-5 text-xs text-slate-400">Rendering screenshots and building the report. This may take a moment for large runs.</p>
          <div v-if="pdfCountdown !== null" class="mb-4 text-center font-mono text-2xl font-bold tabular-nums" :class="pdfCountdown === 0 ? 'text-emerald-400' : 'text-slate-300'">{{ pdfCountdown === 0 ? 'almost done…' : formatCountdown(pdfCountdown) }}</div>
          <div class="h-2 overflow-hidden rounded-full bg-slate-800">
            <div class="h-full animate-pdf-progress rounded-full bg-emerald-400" />
          </div>
          <div v-if="exportPdfError" class="mt-4 rounded-xl border border-rose-500/30 bg-rose-950/50 px-3 py-2 text-xs text-rose-300">{{ exportPdfError }}</div>
          <button v-if="exportPdfError" type="button" class="mt-4 w-full rounded-xl border border-slate-800/80 bg-slate-800 px-3 py-2 text-xs text-slate-200 transition hover:bg-slate-700" @click="exportingPdf = false; exportPdfError = null">Close</button>
        </div>
      </div>
    </Teleport>

    <div v-if="error" data-testid="error-banner" class="mb-4 rounded-2xl border border-rose-500/30 bg-rose-950/50 px-4 py-3 text-sm text-rose-200 shadow-lg shadow-rose-950/10 backdrop-blur-sm">{{ error }}</div>

    <section v-if="groupedResults.length" data-testid="results-table" class="overflow-hidden rounded-[1.5rem] border border-slate-800/80 bg-slate-900/65 shadow-2xl shadow-black/20 backdrop-blur-xl">
      <table class="w-full table-fixed border-collapse text-sm">
        <colgroup>
          <col class="w-[4%]" />
          <col class="w-[26%]" />
          <col class="w-[20%]" />
          <col class="w-[12%]" />
          <col v-for="vp in submittedViewports" :key="vp" class="w-[9%]" />
          <col class="w-[4%]" />
        </colgroup>
        <thead>
          <tr class="border-b border-slate-800/80">
            <th class="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-widest"><button type="button" class="flex items-center gap-1 transition" :class="sortKey === 'runOrder' ? 'text-slate-300' : 'text-slate-500 hover:text-slate-400'" @click="setSort('runOrder')">#<span class="text-[10px]">{{ sortKey === 'runOrder' ? (sortDir === 'asc' ? '↑' : '↓') : '' }}</span></button></th>
            <th class="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-widest"><button type="button" class="flex items-center gap-1 transition" :class="sortKey === 'title' ? 'text-slate-300' : 'text-slate-500 hover:text-slate-400'" @click="setSort('title')">Title<span class="text-[10px]">{{ sortKey === 'title' ? (sortDir === 'asc' ? '↑' : '↓') : '' }}</span></button></th>
            <th class="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-widest"><button type="button" class="flex items-center gap-1 transition" :class="sortKey === 'path' ? 'text-slate-300' : 'text-slate-500 hover:text-slate-400'" @click="setSort('path')">Path<span class="text-[10px]">{{ sortKey === 'path' ? (sortDir === 'asc' ? '↑' : '↓') : '' }}</span></button></th>
            <th class="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-widest"><button type="button" class="ml-auto flex items-center gap-1 transition" :class="sortKey === 'diff' ? 'text-slate-300' : 'text-slate-500 hover:text-slate-400'" @click="setSort('diff')">Avg. diff<span class="text-[10px]">{{ sortKey === 'diff' ? (sortDir === 'asc' ? '↑' : '↓') : '' }}</span></button></th>
            <th v-for="vp in submittedViewports" :key="vp" class="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-widest text-slate-500">{{ vp }}px</th>
            <th class="px-4 py-2.5"></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="(group, idx) in sortedGroups" :key="group.pagePath">
            <tr
              :data-testid="`result-row-${group.pagePath}`"
              class="cursor-pointer border-b border-slate-800/60 transition-colors hover:bg-slate-800/30"
              :class="{ 'bg-slate-800/20': !collapsedPages[group.pagePath] }"
              @click="togglePage(group.pagePath)"
            >
              <td class="px-4 py-3 tabular-nums text-xs text-slate-500">{{ (pageRunOrder.get(group.pagePath) ?? idx) + 1 }}</td>
              <td class="px-4 py-3 font-medium">
                <span v-if="!group.isPending" class="text-slate-100">{{ group.pageLabel }}</span>
                <span v-else-if="activePages.has(group.pagePath)" class="inline-flex items-center gap-1.5 text-slate-400">
                  <svg class="size-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                  <span class="truncate">{{ group.pageLabel }}</span>
                </span>
                <span v-else class="inline-flex items-center gap-1.5 text-slate-500">
                  <svg class="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" stroke-dasharray="4 3"/></svg>
                  <span class="truncate">{{ group.pageLabel }}</span>
                </span>
              </td>
              <td class="truncate px-4 py-3 font-mono text-xs text-slate-400">{{ group.pagePath }}</td>
              <td class="px-4 py-3 text-right tabular-nums">
                <span v-if="group.isPending" class="text-slate-500">—</span>
                <span v-else :class="group.averagePercent < 1 ? 'text-emerald-400' : group.averagePercent < 5 ? 'text-amber-400' : 'text-rose-400'">{{ group.averagePercent.toFixed(2) }}%</span>
              </td>
              <td v-for="vp in submittedViewports" :key="vp" class="px-4 py-3 text-right tabular-nums">
                <span v-if="group.isPending || !group.results.find(r => r.width === vp)" class="text-slate-500">—</span>
                <span v-else :class="group.results.find(r => r.width === vp)!.percent < 1 ? 'text-emerald-400' : group.results.find(r => r.width === vp)!.percent < 5 ? 'text-amber-400' : 'text-rose-400'">{{ group.results.find(r => r.width === vp)!.percent.toFixed(2) }}%</span>
              </td>
              <td class="px-4 py-3">
                <div class="flex items-center justify-end">
                  <svg class="size-4 text-slate-400 transition-transform" :class="{ 'rotate-180': !collapsedPages[group.pagePath] }" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd"/></svg>
                </div>
              </td>
            </tr>
            <Transition name="row-expand">
            <tr v-if="!collapsedPages[group.pagePath]">
              <td :colspan="5 + submittedViewports.length" class="border-b border-slate-800/60 bg-slate-950/40"><div class="row-expand-inner px-5 py-5">
                <div v-if="group.isPending && !group.results.length" class="rounded-2xl border border-dashed border-slate-800/80 bg-slate-950/50 px-4 py-6 text-sm text-slate-400">
                  Found in discovery. Waiting to start viewport screenshots.
                </div>
                <div v-if="currentMode === 'sitemap'" class="mb-4 flex justify-end">
                  <button
                    type="button"
                    :disabled="rerunningPages.has(group.pagePath)"
                    class="rounded-lg border border-slate-700/60 bg-slate-800/60 px-2.5 py-1 text-xs text-slate-300 transition hover:border-slate-600 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                    @click="rerunPage(group.pagePath, group.urlA, group.urlB)"
                  >
                    <span v-if="rerunningPages.has(group.pagePath)" class="inline-flex items-center gap-1">
                      <svg class="size-3 animate-spin" viewBox="0 0 24 24" fill="none"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                      Re-running
                    </span>
                    <span v-else>Re-run</span>
                  </button>
                </div>
                <div v-if="group.results.length > 1" class="mb-4 inline-flex flex-wrap overflow-hidden rounded-xl border border-slate-800/80 bg-slate-950/70 p-1 text-sm shadow-inner shadow-black/20">
                  <button
                    v-for="result in group.results"
                    :key="`${group.pagePath}-tab-${result.width}`"
                    type="button"
                    class="rounded-lg px-3 py-1.5 transition"
                    :class="selectedViewportByPage[group.pagePath] === result.width ? 'bg-slate-700 text-white shadow-sm shadow-black/30' : 'text-slate-300 hover:bg-slate-800'"
                    @click="selectedViewportByPage[group.pagePath] = result.width"
                  >
                    {{ result.width }}px
                  </button>
                </div>
                <ViewportResult
                  v-if="getSelectedResult(group.pagePath)"
                  :key="`${group.pagePath}-${selectedViewportByPage[group.pagePath]}`"
                  :result="getSelectedResult(group.pagePath)!"
                  :url-a="group.urlA"
                  :url-b="group.urlB"
                />
              </div></td>
            </tr>
            </Transition>
          </template>
        </tbody>
      </table>
    </section>

    <div v-if="!groupedResults.length && status === 'idle'" class="rounded-[1.75rem] border border-dashed border-slate-800/80 bg-slate-900/45 px-8 py-12 text-center shadow-inner shadow-black/20 backdrop-blur-sm">
      <div class="text-sm font-semibold text-slate-200">Run not found</div>
      <p class="mt-2 text-sm text-slate-500">This run may have been deleted or does not exist.</p>
      <NuxtLink to="/runs" class="mt-5 inline-block rounded-2xl border border-slate-700 bg-slate-800/70 px-5 py-2.5 text-sm font-medium text-slate-200 transition hover:border-slate-600 hover:bg-slate-700">
        View saved runs
      </NuxtLink>
    </div>
  </main>
</template>
