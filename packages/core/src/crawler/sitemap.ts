import * as cheerio from 'cheerio';
import type { FetchLike } from './robots.js';

export async function fetchSitemapUrls(
  origin: string,
  fetcher: FetchLike,
  onProgress?: (urlCount: number, latestUrl: string) => void,
): Promise<string[]> {
  const url = new URL('/sitemap.xml', origin).toString();
  return fetchFrom(url, fetcher, new Set(), onProgress);
}

async function fetchFrom(
  url: string,
  fetcher: FetchLike,
  seen: Set<string>,
  onProgress?: (urlCount: number, latestUrl: string) => void,
): Promise<string[]> {
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
    for (const n of nested) all.push(...(await fetchFrom(n, fetcher, seen, onProgress)));
    return all;
  }
  const urls = $('url > loc')
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);
  if (urls.length > 0) {
    onProgress?.(urls.length, urls[urls.length - 1]!);
  }
  return urls;
}
