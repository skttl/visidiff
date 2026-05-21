import { createError, defineEventHandler, readBody } from 'h3'
import { createJob, pruneOld } from '../utils/jobs'
import { normalizeDirectUrl, normalizeHostInput } from '../utils/discovery'
import { runJob } from '../utils/runner'

interface Body {
  mode?: 'direct' | 'sitemap'
  urlA?: string
  urlB?: string
  hostA?: string
  hostB?: string
  viewports?: number[]
  blockedGlobs?: string[]
  crawlLimits?: {
    maxPages?: number
    maxDepth?: number
    timeoutMs?: number
  }
  pageConcurrency?: number
}

export default defineEventHandler(async (event) => {
  const body = await readBody<Body>(event)
  const mode = body.mode === 'sitemap' ? 'sitemap' : 'direct'
  const viewports = (body.viewports || [375, 768, 1440])
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n >= 200 && n <= 4000)
  if (!viewports.length) {
    throw createError({ statusCode: 400, statusMessage: 'At least one viewport is required' })
  }
  const blockedGlobs = (body.blockedGlobs || []).map((s) => String(s).trim()).filter(Boolean)
  const crawlLimits = {
    maxPages: clampInt(body.crawlLimits?.maxPages, 1, 10000, 25),
    maxDepth: clampInt(body.crawlLimits?.maxDepth, 0, 10, 2),
    timeoutMs: clampInt(body.crawlLimits?.timeoutMs, 1000, 120000, 15000)
  }
  const pageConcurrency = clampInt(body.pageConcurrency, 1, 10, 3)

  pruneOld()
  const job = createJob(createJobInput(body, mode, viewports, blockedGlobs, crawlLimits, pageConcurrency))
  // Fire and forget
  runJob(job.id).catch((err) => {
    console.error('[visidiff] runJob failed', err)
  })
  return { id: job.id }
})

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.min(max, Math.max(min, Math.round(num)))
}

function createJobInput(
  body: Body,
  mode: 'direct' | 'sitemap',
  viewports: number[],
  blockedGlobs: string[],
  crawlLimits: { maxPages: number; maxDepth: number; timeoutMs: number },
  pageConcurrency: number
) {
  try {
    return mode === 'sitemap'
      ? {
          mode,
          hostA: normalizeHostInput(body.hostA || ''),
          hostB: normalizeHostInput(body.hostB || ''),
          viewports,
          blockedGlobs,
          crawlLimits,
          pageConcurrency
        }
      : {
          mode,
          urlA: normalizeDirectUrl((body.urlA || '').trim()),
          urlB: normalizeDirectUrl((body.urlB || '').trim()),
          viewports,
          blockedGlobs
        }
  } catch (error: any) {
    throw createError({ statusCode: 400, statusMessage: error?.message || 'Invalid input' })
  }
}
