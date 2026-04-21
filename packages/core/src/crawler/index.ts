import { RobotsChecker, type FetchLike } from './robots.js';
import { fetchSitemapUrls } from './sitemap.js';
import { crawl } from './http-crawler.js';
import { groupAndSample } from './sampling.js';
import type { UrlGroup } from '../types.js';

export interface DiscoverOptions {
  origin: string;
  fetcher: FetchLike;
  maxDepth: number;
  maxPages: number;
  exclude: string[];
  ignoreRobots: boolean;
  samplesPerGroup: number;
  samplingThreshold: number;
  seed: string;
  pinned?: string[];
  urlsOverride?: string[];
}

export async function discoverUrls(opts: DiscoverOptions): Promise<UrlGroup[]> {
  if (opts.urlsOverride && opts.urlsOverride.length > 0) {
    return groupAndSample(opts.urlsOverride, {
      samplesPerGroup: opts.samplesPerGroup,
      threshold: opts.samplingThreshold,
      seed: opts.seed,
      pinned: opts.pinned ?? [],
    });
  }

  const robots = await RobotsChecker.load(opts.origin, opts.fetcher, { ignore: opts.ignoreRobots });
  const sitemap = await fetchSitemapUrls(opts.origin, opts.fetcher);

  let urls: string[] = sitemap.filter((u) => robots.isAllowed(u));
  if (urls.length === 0) {
    urls = await crawl({
      start: opts.origin,
      fetcher: opts.fetcher,
      maxDepth: opts.maxDepth,
      maxPages: opts.maxPages,
      isAllowed: (u) => robots.isAllowed(u),
      exclude: opts.exclude,
    });
  }

  urls = urls.slice(0, opts.maxPages);
  return groupAndSample(urls, {
    samplesPerGroup: opts.samplesPerGroup,
    threshold: opts.samplingThreshold,
    seed: opts.seed,
    pinned: opts.pinned ?? [],
  });
}

export { RobotsChecker } from './robots.js';
export { fetchSitemapUrls } from './sitemap.js';
export { crawl } from './http-crawler.js';
export { groupAndSample } from './sampling.js';
