import { EventEmitter } from 'node:events'
import { nanoid } from 'nanoid'

export type JobStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled'

export interface CrawlLimits {
  maxPages: number
  maxDepth: number
  timeoutMs: number
}

export interface ViewportResult {
  pagePath: string
  pageLabel: string
  urlA: string
  urlB: string
  width: number
  percent: number
  size: { width: number; height: number }
  files: { a: string; b: string; diff: string }
}

export interface DirectJobInput {
  mode: 'direct'
  urlA: string
  urlB: string
  viewports: number[]
  blockedGlobs: string[]
}

export interface SitemapJobInput {
  mode: 'sitemap'
  hostA: string
  hostB: string
  viewports: number[]
  blockedGlobs: string[]
  crawlLimits: CrawlLimits
  pageConcurrency: number
}

export type JobInput = DirectJobInput | SitemapJobInput

export interface Job {
  id: string
  status: JobStatus
  input: JobInput
  createdAt: number
  events: any[]
  results: ViewportResult[]
  error?: string
  totalPercent?: number
}

const jobs = new Map<string, Job>()
const emitters = new Map<string, EventEmitter>()
const abortControllers = new Map<string, AbortController>()

export function createJob(input: JobInput): Job {
  const id = nanoid(10)
  const job: Job = {
    id,
    status: 'queued',
    input,
    createdAt: Date.now(),
    events: [],
    results: []
  }
  jobs.set(id, job)
  emitters.set(id, new EventEmitter().setMaxListeners(50))
  abortControllers.set(id, new AbortController())
  return job
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id)
}

export function getEmitter(id: string): EventEmitter | undefined {
  return emitters.get(id)
}

export function pushEvent(id: string, type: string, data: any) {
  const job = jobs.get(id)
  if (!job) return
  const evt = { type, data, t: Date.now() }
  job.events.push(evt)
  emitters.get(id)?.emit('evt', evt)
}

export function setStatus(id: string, status: JobStatus, extra?: Partial<Job>) {
  const job = jobs.get(id)
  if (!job) return
  job.status = status
  if (extra) Object.assign(job, extra)
  pushEvent(id, 'status', { status, ...(extra || {}) })
  if (status === 'done' || status === 'error' || status === 'cancelled') {
    emitters.get(id)?.emit('end')
  }
}

export function cancelJob(id: string): boolean {
  const job = jobs.get(id)
  if (!job || (job.status !== 'queued' && job.status !== 'running')) return false
  abortControllers.get(id)?.abort()
  setStatus(id, 'cancelled')
  return true
}

export function getAbortSignal(id: string): AbortSignal | undefined {
  return abortControllers.get(id)?.signal
}

export function listJobs(): Job[] {
  return Array.from(jobs.values())
}

// Prune jobs older than 24h
export function pruneOld() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) {
      jobs.delete(id)
      emitters.delete(id)
    }
  }
}
