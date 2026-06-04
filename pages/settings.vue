<script setup lang="ts">
import JobForm from '~/components/JobForm.vue'

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

type RunPayload = DirectPayload | SitemapPayload

const submitting = ref(false)
const error = ref<string | null>(null)
const router = useRouter()

async function onSubmit(payload: RunPayload) {
  if (submitting.value) return
  submitting.value = true
  error.value = null
  try {
    const response = await fetch('/api/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      const data = await response.json().catch(() => null)
      throw new Error(data?.statusMessage || 'Failed to start job')
    }
    const res = await response.json() as { id: string }
    await router.push(`/runs/${res.id}`)
  } catch (e: any) {
    error.value = e?.message || 'Failed to start job'
    submitting.value = false
  }
}
</script>

<template>
  <main class="mt-6">
    <div class="mb-5">
      <h1 class="text-sm font-semibold text-slate-100">Settings</h1>
      <p class="text-xs text-slate-500">Configure targets, viewports, and crawl limits.</p>
    </div>
    <div v-if="error" class="mb-4 rounded-2xl border border-rose-500/30 bg-rose-950/50 px-4 py-3 text-sm text-rose-200">{{ error }}</div>
    <JobForm :submitting="submitting" @submit="onSubmit" />
  </main>
</template>
