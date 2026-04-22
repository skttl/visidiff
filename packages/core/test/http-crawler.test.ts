import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { crawl } from '../src/crawler/http-crawler.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = await readFile(join(here, 'fixtures', 'sample-page.html'), 'utf8');

const htmlHeaders = { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null) };
const htmlResponse = { ok: true, status: 200, headers: htmlHeaders, text: async () => fixture };

describe('crawl', () => {
  it('respects maxPages', async () => {
    const fetcher = vi.fn().mockResolvedValue(htmlResponse);
    const urls = await crawl({
      start: 'https://example.com/',
      fetcher,
      maxDepth: 3,
      maxPages: 2,
      isAllowed: () => true,
      exclude: [],
    });
    expect(urls.length).toBeLessThanOrEqual(2);
  });

  it('stays within origin', async () => {
    const fetcher = vi.fn().mockResolvedValue(htmlResponse);
    const urls = await crawl({
      start: 'https://example.com/',
      fetcher,
      maxDepth: 1,
      maxPages: 100,
      isAllowed: () => true,
      exclude: [],
    });
    expect(urls).not.toContain('https://external.com/page');
  });

  it('applies exclude patterns', async () => {
    const fetcher = vi.fn().mockResolvedValue(htmlResponse);
    const urls = await crawl({
      start: 'https://example.com/',
      fetcher,
      maxDepth: 1,
      maxPages: 100,
      isAllowed: () => true,
      exclude: ['*.pdf'],
    });
    expect(urls.every((u: string) => !u.endsWith('.pdf'))).toBe(true);
  });

  it('respects isAllowed (robots)', async () => {
    const fetcher = vi.fn().mockResolvedValue(htmlResponse);
    const urls = await crawl({
      start: 'https://example.com/',
      fetcher,
      maxDepth: 1,
      maxPages: 100,
      isAllowed: (u: string) => !u.includes('/contact'),
      exclude: [],
    });
    expect(urls).not.toContain('https://example.com/contact');
  });

  it('skips URLs with non-html Content-Type', async () => {
    const pdfHeaders = { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/pdf' : null) };
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith('.pdf')) {
        return { ok: true, status: 200, headers: pdfHeaders, text: async (): Promise<string> => '' };
      }
      return {
        ok: true,
        status: 200,
        headers: htmlHeaders,
        text: async (): Promise<string> => '<html><body><a href="/report">report</a></body></html>',
      };
    });
    const urls = await crawl({
      start: 'https://example.com/',
      fetcher,
      maxDepth: 2,
      maxPages: 100,
      isAllowed: () => true,
      exclude: [],
    });
    expect(urls.some((u) => u.endsWith('.pdf'))).toBe(false);
  });

  it('skips URLs with non-html extensions without fetching', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === 'https://example.com/') {
        return {
          ok: true,
          status: 200,
          headers: htmlHeaders,
          text: async () => '<html><body><a href="/doc.pdf">pdf</a><a href="/img.png">img</a></body></html>',
        };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    const urls = await crawl({
      start: 'https://example.com/',
      fetcher,
      maxDepth: 2,
      maxPages: 100,
      isAllowed: () => true,
      exclude: [],
    });
    expect(urls).toEqual(['https://example.com/']);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
