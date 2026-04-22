import * as cheerio from 'cheerio';
import picomatch from 'picomatch';
import type { FetchLike } from './robots.js';
import { hasHtmlLikePath, isHtmlContentType } from './content-type.js';

export interface CrawlOptions {
  start: string;
  fetcher: FetchLike;
  maxDepth: number;
  maxPages: number;
  isAllowed: (url: string) => boolean;
  exclude: string[];
  onProgress?: (urlCount: number, latestUrl: string) => void;
}

export async function crawl(opts: CrawlOptions): Promise<string[]> {
  const origin = new URL(opts.start).origin;
  const excludeMatchers = opts.exclude.map((p) => picomatch(p));
  const isExcluded = (url: string) => {
    const pathname = new URL(url).pathname;
    return excludeMatchers.some((m) => m(pathname) || m(pathname.slice(1)));
  };

  const visited = new Set<string>();
  const queue: Array<{ url: string; depth: number }> = [{ url: normalize(opts.start), depth: 0 }];
  const results: string[] = [];

  while (queue.length && results.length < opts.maxPages) {
    const { url, depth } = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);
    if (!opts.isAllowed(url) || isExcluded(url)) continue;
    if (!url.startsWith(origin)) continue;
    if (!hasHtmlLikePath(url)) continue;

    let html = '';
    try {
      const res = await opts.fetcher(url);
      if (!res.ok) continue;
      if (!isHtmlContentType(res.headers.get('content-type'))) continue;
      html = await res.text();
    } catch {
      continue;
    }

    results.push(url);
    opts.onProgress?.(results.length, url);
    if (depth >= opts.maxDepth) continue;
    const $ = cheerio.load(html);
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      try {
        const abs = normalize(new URL(href, url).toString());
        if (!visited.has(abs)) queue.push({ url: abs, depth: depth + 1 });
      } catch {
        /* invalid URL */
      }
    });
  }
  return results.slice(0, opts.maxPages);
}

function normalize(u: string): string {
  const url = new URL(u);
  url.hash = '';
  return url.toString();
}
