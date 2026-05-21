import { XMLParser } from 'fast-xml-parser'
import { parse } from 'node-html-parser'
import type { CrawlLimits } from './jobs'

export interface DiscoveredPagePair {
  path: string
  urlA: string
  urlB: string
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true,
  parseTagValue: false
})

export function normalizeDirectUrl(value: string) {
  const url = new URL(value)
  return url.toString()
}

export function normalizeHostInput(value: string) {
  const trimmed = value.trim()
  if (!trimmed) throw new Error('Host is required')
  const candidate = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`
  const url = new URL(candidate)
  if (!/^https?:$/.test(url.protocol)) {
    throw new Error('Host must use http or https')
  }
  const basePath = normalizePathname(url.pathname)
  return basePath === '/' ? url.origin : `${url.origin}${basePath}`
}

export async function discoverPagePairs(opts: {
  hostA: string
  hostB: string
  limits: CrawlLimits
  onEvent?: (type: string, data: any) => void
}) {
  const baseA = normalizeHostInput(opts.hostA)
  const baseB = normalizeHostInput(opts.hostB)
  const urlObjA = new URL(baseA)
  const urlObjB = new URL(baseB)
  const originA = urlObjA.origin
  const prefixB = urlObjB.pathname === '/' ? '' : urlObjB.pathname

  opts.onEvent?.('step', { phase: 'discovery-start', hostA: baseA, hostB: baseB })

  const pagesA = await discoverHostPages({
    origin: originA,
    limits: opts.limits,
    onEvent: opts.onEvent
  })

  const pagePairs = pagesA.map((path) => ({
    path,
    urlA: new URL(path, originA).toString(),
    urlB: new URL(`${prefixB}${path === '/' ? '/' : path}`, urlObjB.origin).toString()
  }))

  opts.onEvent?.('step', {
    phase: 'discovery-complete',
    hostA: baseA,
    hostB: baseB,
    pageCount: pagePairs.length
  })

  return { originA, originB: urlObjB.origin, pagePairs }
}

async function discoverHostPages(opts: {
  origin: string
  limits: CrawlLimits
  onEvent?: (type: string, data: any) => void
}) {
  const sitemapUrls = await discoverSitemapUrls(opts.origin)

  if (sitemapUrls.length) {
    const sitemapPages = await collectSitemapPages({
      origin: opts.origin,
      sitemapUrls,
      maxPages: opts.limits.maxPages
    })

    if (sitemapPages.length) {
      opts.onEvent?.('step', {
        phase: 'sitemap-found',
        host: opts.origin,
        sitemapCount: sitemapUrls.length
      })
      opts.onEvent?.('step', {
        phase: 'sitemap-complete',
        host: opts.origin,
        pageCount: sitemapPages.length
      })
      return sitemapPages
    }

    opts.onEvent?.('step', {
      phase: 'sitemap-fallback',
      host: opts.origin,
      sitemapCount: sitemapUrls.length
    })
  }

  opts.onEvent?.('step', {
    phase: 'crawl-start',
    host: opts.origin,
    maxPages: opts.limits.maxPages,
    maxDepth: opts.limits.maxDepth,
    timeoutMs: opts.limits.timeoutMs
  })

  const crawledPages = await crawlHostPages(opts.origin, opts.limits)

  opts.onEvent?.('step', {
    phase: 'crawl-complete',
    host: opts.origin,
    pageCount: crawledPages.length
  })

  return crawledPages
}

async function discoverSitemapUrls(origin: string) {
  const urls = new Set<string>()

  try {
    const robotsRes = await fetch(new URL('/robots.txt', origin), { redirect: 'follow' })
    if (robotsRes.ok) {
      const text = await robotsRes.text()
      for (const line of text.split(/\r?\n/)) {
        const match = line.match(/^\s*Sitemap:\s*(\S+)\s*$/i)
        if (!match) continue
        try {
          urls.add(new URL(match[1], origin).toString())
        } catch {}
      }
    }
  } catch {}

  if (!urls.size) {
    urls.add(new URL('/sitemap.xml', origin).toString())
  }

  return Array.from(urls)
}

async function collectSitemapPages(opts: {
  origin: string
  sitemapUrls: string[]
  maxPages: number
}) {
  const queue = [...opts.sitemapUrls]
  const seenSitemaps = new Set<string>()
  const pages = new Set<string>()

  while (queue.length && pages.size < opts.maxPages) {
    const sitemapUrl = queue.shift()
    if (!sitemapUrl || seenSitemaps.has(sitemapUrl)) continue
    seenSitemaps.add(sitemapUrl)

    try {
      const res = await fetch(sitemapUrl, { redirect: 'follow' })
      if (!res.ok) continue
      const xml = await res.text()
      const doc = xmlParser.parse(xml)

      const indexEntries = arrayify(doc?.sitemapindex?.sitemap)
      for (const entry of indexEntries) {
        const loc = typeof entry?.loc === 'string' ? entry.loc.trim() : ''
        if (!loc) continue
        try {
          queue.push(new URL(loc, opts.origin).toString())
        } catch {}
      }

      const urlEntries = arrayify(doc?.urlset?.url)
      for (const entry of urlEntries) {
        const loc = typeof entry?.loc === 'string' ? entry.loc.trim() : ''
        const normalized = normalizeDiscoveredPage(loc, opts.origin)
        if (normalized) pages.add(normalized)
        if (pages.size >= opts.maxPages) break
      }
    } catch {}
  }

  return Array.from(pages)
}

async function crawlHostPages(origin: string, limits: CrawlLimits) {
  const startedAt = Date.now()
  const visited = new Set<string>()
  const pages = new Set<string>()
  const queue: Array<{ url: string; depth: number }> = [{ url: origin, depth: 0 }]

  while (queue.length && pages.size < limits.maxPages) {
    if (Date.now() - startedAt >= limits.timeoutMs) break

    const next = queue.shift()
    if (!next || visited.has(next.url)) continue
    visited.add(next.url)

    try {
      const res = await fetch(next.url, {
        redirect: 'follow',
        headers: { accept: 'text/html,application/xhtml+xml' }
      })
      if (!res.ok) continue

      const contentType = res.headers.get('content-type') || ''
      if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) continue

      const finalUrl = res.url || next.url
      const normalized = normalizeDiscoveredPage(finalUrl, origin)
      if (normalized) pages.add(normalized)

      if (next.depth >= limits.maxDepth) continue

      const html = await res.text()
      const root = parse(html)
      for (const anchor of root.querySelectorAll('a[href]')) {
        const href = anchor.getAttribute('href') || ''
        const resolved = resolveCrawlUrl(href, finalUrl, origin)
        if (!resolved || visited.has(resolved)) continue
        queue.push({ url: resolved, depth: next.depth + 1 })
      }
    } catch {}
  }

  return Array.from(pages).slice(0, limits.maxPages)
}

function normalizeDiscoveredPage(value: string, origin: string) {
  try {
    const url = new URL(value, origin)
    if (url.origin !== origin) return null
    if (!/^https?:$/.test(url.protocol)) return null
    url.hash = ''
    url.search = ''
    const pathname = normalizePathname(url.pathname)
    if (!pathname) return null
    return pathname
  } catch {
    return null
  }
}

function resolveCrawlUrl(href: string, base: string, origin: string) {
  if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) {
    return null
  }

  try {
    const url = new URL(href, base)
    if (url.origin !== origin) return null
    if (!/^https?:$/.test(url.protocol)) return null
    const ext = url.pathname.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase()
    if (ext && NON_HTML_EXTENSIONS.has(ext)) return null
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
}

function normalizePathname(pathname: string) {
  if (!pathname) return '/'
  const trimmed = pathname.replace(/\/index\.html?$/i, '/')
  if (trimmed !== '/' && trimmed.endsWith('/')) return trimmed.slice(0, -1)
  return trimmed || '/'
}

function arrayify<T>(value: T | T[] | undefined): T[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

const NON_HTML_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'svg',
  'webp',
  'pdf',
  'zip',
  'xml',
  'json',
  'txt',
  'js',
  'css',
  'ico',
  'mp4',
  'mp3',
  'woff',
  'woff2'
])
