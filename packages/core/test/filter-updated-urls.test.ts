import { describe, expect, it, vi } from 'vitest';
import { filterUpdatedUrls } from '../src/pipeline/filter-updated-urls.js';
import { parsePattern } from '../src/url-pattern.js';

describe('filterUpdatedUrls', () => {
  it('drops URLs whose updated counterpart returns 404', async () => {
    const original = parsePattern('https://a.com/*');
    const updated = parsePattern('https://b.com/*');
    const groups = [
      { pattern: '/', urls: ['https://a.com/about', 'https://a.com/missing'], sampled: ['https://a.com/about', 'https://a.com/missing'] },
    ];
    const fetcher = vi.fn(async (url: string) => {
      if (url === 'https://b.com/missing') return { ok: false, status: 404 } as Response;
      return { ok: true, status: 200 } as Response;
    });

    const result = await filterUpdatedUrls(groups, original, updated, fetcher);
    expect(result[0]!.sampled).toEqual(['https://a.com/about']);
    expect(result[0]!.urls).toEqual(['https://a.com/about']);
  });

  it('keeps URLs whose updated counterpart returns 200', async () => {
    const original = parsePattern('https://a.com/*');
    const updated = parsePattern('https://b.com/*');
    const groups = [
      { pattern: '/', urls: ['https://a.com/about'], sampled: ['https://a.com/about'] },
    ];
    const fetcher = vi.fn(async () => ({ ok: true, status: 200 }) as Response);

    const result = await filterUpdatedUrls(groups, original, updated, fetcher);
    expect(result[0]!.sampled).toEqual(['https://a.com/about']);
  });

  it('keeps URLs when fetch throws an error', async () => {
    const original = parsePattern('https://a.com/*');
    const updated = parsePattern('https://b.com/*');
    const groups = [
      { pattern: '/', urls: ['https://a.com/about'], sampled: ['https://a.com/about'] },
    ];
    const fetcher = vi.fn(async () => {
      throw new Error('network error');
    });

    const result = await filterUpdatedUrls(groups, original, updated, fetcher);
    expect(result[0]!.sampled).toEqual(['https://a.com/about']);
  });
});
