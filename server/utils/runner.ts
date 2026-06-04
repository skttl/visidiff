import { join } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { captureUrl, SkippablePageError } from './capture'
import { discoverPagePairs } from './discovery'
import { diffPngs, generateThumbnail } from './diff'
import { getJob, getAbortSignal, pushEvent, setStatus } from './jobs'
import { getRunsRoot } from './runs-root'

export async function runJob(jobId: string) {
  const job = getJob(jobId)
  if (!job) return
  const runDir = join(getRunsRoot(), jobId)
  await mkdir(runDir, { recursive: true })

  setStatus(jobId, 'running')
  const signal = getAbortSignal(jobId)

  try {
    let totalMismatched = 0
    let totalPixels = 0

    if (signal?.aborted) throw new CancelledError()

    const pagePairs = job.input.mode === 'sitemap'
      ? (
          await discoverPagePairs({
            hostA: job.input.hostA,
            hostB: job.input.hostB,
            limits: job.input.crawlLimits,
            onEvent: (type, data) => pushEvent(jobId, type, data)
          })
        ).pagePairs
      : [{ path: getDirectPathLabel(job.input.urlA), urlA: job.input.urlA, urlB: job.input.urlB }]

    if (signal?.aborted) throw new CancelledError()

    if (!pagePairs.length) {
      throw new Error('No pages discovered to compare')
    }

    pushEvent(jobId, 'batch-ready', {
      pageCount: pagePairs.length,
      viewportCount: job.input.viewports.length,
      taskCount: pagePairs.length * job.input.viewports.length,
      pages: pagePairs.map((page) => ({
        pagePath: page.path,
        pageLabel: page.path || '/',
        urlA: page.urlA,
        urlB: page.urlB
      }))
    })

    const executePage = async (page: (typeof pagePairs)[number], pageIndex: number) => {
      if (signal?.aborted) throw new CancelledError()
      const outcome = await processPage(jobId, runDir, page, pageIndex, job.input.viewports, job.input.blockedGlobs, signal)
      if (outcome.skipped) return
      job.results.push(...outcome.results)
      totalMismatched += outcome.totalMismatched
      totalPixels += outcome.totalPixels
    }

    if (job.input.mode === 'sitemap') {
      await runWithConcurrency(pagePairs, job.input.pageConcurrency, executePage)
    } else {
      await executePage(pagePairs[0], 0)
    }

    job.totalPercent = totalPixels > 0 ? (totalMismatched / totalPixels) * 100 : 0

    if (job.results.length > 0) {
      const thumbResult = job.results.find(r => r.pagePath === '/') ?? job.results[0]
      const aFile = join(getRunsRoot(), jobId, thumbResult.files.a.replace(`/runs/${jobId}/`, ''))
      const bFile = join(getRunsRoot(), jobId, thumbResult.files.b.replace(`/runs/${jobId}/`, ''))
      try {
        await generateThumbnail(aFile, bFile, join(runDir, 'thumbnail.png'))
      } catch {}
    }

    const manifest = {
      id: jobId,
      savedAt: Date.now(),
      input: job.input,
      totalPercent: job.totalPercent,
      results: job.results
    }
    await writeFile(join(runDir, 'result.json'), JSON.stringify(manifest), 'utf8')
    pushEvent(jobId, 'done', { totalPercent: job.totalPercent, results: job.results })
    setStatus(jobId, 'done', { totalPercent: job.totalPercent })
  } catch (err: any) {
    if (err instanceof CancelledError) return
    const message = err?.message || String(err)
    pushEvent(jobId, 'error', { message })
    setStatus(jobId, 'error', { error: message })
  }
}

class CancelledError extends Error {
  constructor() {
    super('Job cancelled')
    this.name = 'CancelledError'
  }
}

function getDirectPathLabel(url: string) {
  try {
    const parsed = new URL(url)
    return `${parsed.pathname || '/'}${parsed.search || ''}` || '/'
  } catch {
    return '/'
  }
}

function slugifyPath(path: string) {
  const normalized = path === '/' ? 'root' : path.replace(/^\//, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
  return normalized || 'page'
}

async function processPage(
  jobId: string,
  runDir: string,
  page: { path: string; urlA: string; urlB: string },
  pageIndex: number,
  viewports: number[],
  blockedGlobs: string[],
  signal?: AbortSignal
) {
  let pageLabel = page.path || '/'
  const results: Awaited<ReturnType<typeof buildViewportResult>>[] = []
  let totalMismatched = 0
  let totalPixels = 0

  for (const width of viewports) {
    if (signal?.aborted) throw new CancelledError()
    pushEvent(jobId, 'step', { pagePath: page.path, pageIndex, viewport: width, phase: 'start' })

    const fileBase = `${String(pageIndex + 1).padStart(3, '0')}-${slugifyPath(page.path)}-${width}`
    const aFile = join(runDir, `${fileBase}-a.png`)
    const bFile = join(runDir, `${fileBase}-b.png`)
    const diffFile = join(runDir, `${fileBase}-diff.png`)

    try {
      pushEvent(jobId, 'step', { pagePath: page.path, pageIndex, viewport: width, phase: 'capture-a' })
      const captureA = await captureUrl({
        url: page.urlA,
        width,
        blockedGlobs,
        outFile: aFile,
        onPhase: (phase) => pushEvent(jobId, 'step', { pagePath: page.path, pageIndex, viewport: width, side: 'a', phase })
      })
      if (captureA.title) pageLabel = captureA.title

      pushEvent(jobId, 'step', { pagePath: page.path, pageIndex, viewport: width, phase: 'capture-b' })
      await captureUrl({
        url: page.urlB,
        width,
        blockedGlobs,
        outFile: bFile,
        onPhase: (phase) => pushEvent(jobId, 'step', { pagePath: page.path, pageIndex, viewport: width, side: 'b', phase })
      })
    } catch (err: any) {
      if (err instanceof SkippablePageError && err.statusCode === 404) {
        pushEvent(jobId, 'page-skipped', {
          pagePath: page.path,
          pageIndex,
          pageLabel,
          viewport: width,
          reason: '404',
          message: err.message
        })
        return { skipped: true as const, results, totalMismatched, totalPixels }
      }
      throw err
    }

    pushEvent(jobId, 'step', { pagePath: page.path, pageIndex, viewport: width, phase: 'diff' })
    const diff = await diffPngs(aFile, bFile, diffFile)
    const result = buildViewportResult(jobId, fileBase, page, pageLabel, width, diff)
    results.push(result)
    totalMismatched += diff.mismatched
    totalPixels += diff.width * diff.height
    pushEvent(jobId, 'viewport-done', result)
  }

  return { skipped: false as const, results, totalMismatched, totalPixels }
}

function buildViewportResult(
  jobId: string,
  fileBase: string,
  page: { path: string; urlA: string; urlB: string },
  pageLabel: string,
  width: number,
  diff: { percent: number; width: number; height: number }
) {
  return {
    pagePath: page.path,
    pageLabel,
    urlA: page.urlA,
    urlB: page.urlB,
    width,
    percent: diff.percent,
    size: { width: diff.width, height: diff.height },
    files: {
      a: `/runs/${jobId}/${fileBase}-a.png`,
      b: `/runs/${jobId}/${fileBase}-b.png`,
      diff: `/runs/${jobId}/${fileBase}-diff.png`
    }
  }
}

async function runWithConcurrency<T>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<void>) {
  const limit = Math.max(1, Math.min(concurrency, items.length))
  let nextIndex = 0

  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex++
        await worker(items[currentIndex], currentIndex)
      }
    })
  )
}
