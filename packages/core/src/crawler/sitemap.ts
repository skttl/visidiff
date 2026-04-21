import * as cheerio from 'cheerio';
import type { FetchLike } from './robots.js';

export async function fetchSitemapUrls(origin: string, fetcher: FetchLike): Promise<string[]> {
  const url = new URL('/sitemap.xml', origin).toString();
  return fetchFrom(url, fetcher, new Set());
}

async function fetchFrom(url: string, fetcher: FetchLike, seen: Set<string>): Promise<string[]> {
  if (seen.has(url)) return [];
  seen.add(url);
  let text = '';
  try {
    const res = await fetcher(url);
    if (!res.ok) return [];
    text = await res.text();
  } catch {
    return [];
  }
  const $ = cheerio.load(text, { xmlMode: true });
  const nested = $('sitemap > loc')
    .map((_, el) => $(el).text().trim())
    .get();
  if (nested.length > 0) {
    const all: string[] = [];
    for (const n of nested) all.push(...(await fetchFrom(n, fetcher, seen)));
    return all;
  }
  return $('url > loc')
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);
}
