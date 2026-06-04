import { chromium, type Browser } from 'playwright'
import micromatch from 'micromatch'
import { rewriteLocalhost } from './discovery'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

let browserPromise: Promise<Browser> | null = null

export class SkippablePageError extends Error {
  statusCode: number

  constructor(message: string, statusCode: number) {
    super(message)
    this.name = 'SkippablePageError'
    this.statusCode = statusCode
  }
}

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true })
  }
  return browserPromise
}

export async function captureUrl(opts: {
  url: string
  width: number
  blockedGlobs: string[]
  outFile: string
  onPhase?: (phase: string) => void
}): Promise<{ width: number; height: number; title: string }> {
  const browser = await getBrowser()
  const context = await browser.newContext({
    viewport: { width: opts.width, height: 900 },
    deviceScaleFactor: 1,
    ignoreHTTPSErrors: true,
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 VisiDiff/1.0'
  })
  const page = await context.newPage()
  try {
    if (opts.blockedGlobs.length) {
      await page.route('**/*', (route) => {
        const u = route.request().url()
        if (micromatch.isMatch(u, opts.blockedGlobs)) {
          return route.abort()
        }
        return route.continue()
      })
    }

    opts.onPhase?.('load')
    const response = await page.goto(rewriteLocalhost(opts.url), { waitUntil: 'networkidle', timeout: 45000 })
    const status = response?.status()
    if (status === 404) {
      throw new SkippablePageError(`Page returned 404: ${opts.url}`, 404)
    }

    opts.onPhase?.('scroll')
    await autoScroll(page)

    opts.onPhase?.('settle')
    // Give lazy images a moment to render after final scroll
    await page.waitForTimeout(500)
    await page
      .evaluate(async () => {
        const imgs = Array.from(document.images)
        await Promise.all(
          imgs.map((img) =>
            img.complete && img.naturalWidth > 0
              ? Promise.resolve()
              : new Promise<void>((res) => {
                  img.addEventListener('load', () => res(), { once: true })
                  img.addEventListener('error', () => res(), { once: true })
                  setTimeout(() => res(), 2000)
                })
          )
        )
      })
      .catch(() => {})

    opts.onPhase?.('shot')
    const [buf, title] = await Promise.all([
      page.screenshot({ fullPage: true, type: 'png' }),
      page.title().catch(() => '')
    ])
    await mkdir(join(opts.outFile, '..'), { recursive: true })
    await writeFile(opts.outFile, buf)

    // Determine size from buffer header (PNG width/height at offsets 16/20, big-endian)
    const w = buf.readUInt32BE(16)
    const h = buf.readUInt32BE(20)
    return { width: w, height: h, title }
  } finally {
    await context.close()
  }
}

async function autoScroll(page: import('playwright').Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let lastHeight = 0
      let stableCount = 0
      const step = Math.max(200, Math.floor(window.innerHeight * 0.9))
      const timer = setInterval(() => {
        window.scrollBy(0, step)
        const h = document.documentElement.scrollHeight
        const reachedBottom = window.scrollY + window.innerHeight >= h - 2
        if (h === lastHeight && reachedBottom) {
          stableCount++
          if (stableCount > 3) {
            clearInterval(timer)
            window.scrollTo(0, 0)
            resolve()
          }
        } else {
          stableCount = 0
        }
        lastHeight = h
      }, 150)
      // hard cap 30s
      setTimeout(() => {
        clearInterval(timer)
        window.scrollTo(0, 0)
        resolve()
      }, 30000)
    })
  })
  // small wait after scrolling back to top
  await page.waitForTimeout(300)
}

export async function shutdownBrowser() {
  if (browserPromise) {
    const b = await browserPromise
    await b.close().catch(() => {})
    browserPromise = null
  }
}
