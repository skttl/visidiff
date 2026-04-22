import { RobotsChecker, type FetchLike } from './robots.js';
import { fetchSitemapUrls } from './sitemap.js';
import { crawl } from './http-crawler.js';
import { groupAndSample } from './sampling.js';
import { hasHtmlLikePath } from './content-type.js';
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
  onProgress?: (urlCount: number, latestUrl: string) => void;
}

export async function discoverUrls(opts: DiscoverOptions): Promise<UrlGroup[]> {
  if (opts.urlsOverride && opts.urlsOverride.length > 0) {
    opts.onProgress?.(opts.urlsOverride.length, opts.urlsOverride[opts.urlsOverride.length - 1]!);
    return groupAndSample(opts.urlsOverride, {
      samplesPerGroup: opts.samplesPerGroup,
      threshold: opts.samplingThreshold,
      seed: opts.seed,
      pinned: opts.pinned ?? [],
    });
  }

  const robots = await RobotsChecker.load(opts.origin, opts.fetcher, { ignore: opts.ignoreRobots });
  const sitemap = await fetchSitemapUrls(opts.origin, opts.fetcher, opts.onProgress);

  let urls: string[] = sitemap.filter((u) => robots.isAllowed(u) && hasHtmlLikePath(u));
  if (urls.length > 0) {
    opts.onProgress?.(urls.length, urls[urls.length - 1]!);
  }
  if (urls.length === 0) {
    const crawlOptions = {
      start: opts.origin,
      fetcher: opts.fetcher,
      maxDepth: opts.maxDepth,
      maxPages: opts.maxPages,
      isAllowed: (u: string) => robots.isAllowed(u),
      exclude: opts.exclude,
      ...(opts.onProgress ? { onProgress: opts.onProgress } : {}),
    };
    urls = await crawl(crawlOptions);
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
