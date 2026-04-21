import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { fetchSitemapUrls } from '../src/crawler/sitemap.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (n: string) => readFile(join(here, 'fixtures', n), 'utf8');

describe('fetchSitemapUrls', () => {
  it('returns [] when sitemap is missing', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => '' });
    expect(await fetchSitemapUrls('https://example.com', fetcher)).toEqual([]);
  });

  it('parses flat sitemap', async () => {
    const xml = await read('sitemap.xml');
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => xml });
    expect(await fetchSitemapUrls('https://example.com', fetcher)).toEqual([
      'https://example.com/',
      'https://example.com/about',
      'https://example.com/blog/post-1',
    ]);
  });

  it('follows sitemap index', async () => {
    const index = await read('sitemap-index.xml');
    const child = await read('sitemap.xml');
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => index })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => child });
    const urls = await fetchSitemapUrls('https://example.com', fetcher);
    expect(urls).toHaveLength(3);
  });
});
