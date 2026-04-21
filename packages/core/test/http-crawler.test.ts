import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { crawl } from '../src/crawler/http-crawler.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = await readFile(join(here, 'fixtures', 'sample-page.html'), 'utf8');

describe('crawl', () => {
  it('respects maxPages', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => fixture });
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
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => fixture });
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
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => fixture });
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
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => fixture });
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
});
