import { describe, expect, it } from 'vitest';
import { groupAndSample } from '../src/crawler/sampling.js';

describe('groupAndSample', () => {
  it('leaves low-cardinality urls ungrouped', () => {
    const urls = [
      'https://example.com/',
      'https://example.com/about',
      'https://example.com/contact',
    ];
    const groups = groupAndSample(urls, { samplesPerGroup: 2, threshold: 5, seed: 'x' });
    expect(groups.flatMap((g: any) => g.sampled).sort()).toEqual(urls.slice().sort());
  });

  it('groups high-cardinality segment and samples N', () => {
    const urls = Array.from({ length: 20 }, (_, i) => `https://example.com/blog/post-${i}`);
    const groups = groupAndSample(urls, { samplesPerGroup: 2, threshold: 5, seed: 'x' });
    const blogGroup = groups.find((g: any) => g.pattern.startsWith('/blog/'))!;
    expect(blogGroup.sampled).toHaveLength(2);
    expect(blogGroup.sampled[0]).toBe(urls[0]); // first always included
  });

  it('is deterministic given same seed', () => {
    const urls = Array.from({ length: 20 }, (_, i) => `https://example.com/blog/post-${i}`);
    const a = groupAndSample(urls, { samplesPerGroup: 3, threshold: 5, seed: 'abc' });
    const b = groupAndSample(urls, { samplesPerGroup: 3, threshold: 5, seed: 'abc' });
    expect(a).toEqual(b);
  });

  it('respects pinned (never-sample) urls', () => {
    const urls = Array.from({ length: 20 }, (_, i) => `https://example.com/blog/post-${i}`);
    urls.push('https://example.com/about');
    const groups = groupAndSample(urls, {
      samplesPerGroup: 1,
      threshold: 5,
      seed: 'x',
      pinned: ['https://example.com/about'],
    });
    expect(groups.flatMap((g: any) => g.sampled)).toContain('https://example.com/about');
  });
});
