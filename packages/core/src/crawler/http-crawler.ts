import * as cheerio from 'cheerio';
import picomatch from 'picomatch';
import type { FetchLike } from './robots.js';

export interface CrawlOptions {
  start: string;
  fetcher: FetchLike;
  maxDepth: number;
  maxPages: number;
  isAllowed: (url: string) => boolean;
  exclude: string[];
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

    results.push(url);
    if (depth >= opts.maxDepth) continue;

    let html = '';
    try {
      const res = await opts.fetcher(url);
      if (!res.ok) continue;
      html = await res.text();
    } catch {
      continue;
    }
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
