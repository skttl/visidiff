import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import type { VisidiffConfig, RunData, ComparisonRecord, UrlRecord, ViewportDiff } from '../types.js';
import { logger } from '../logger.js';
import { discoverUrls } from '../crawler/index.js';
import { parsePattern, substitute } from '../url-pattern.js';
import { captureScreenshot } from '../screenshot/index.js';
import { computeDiff } from '../diff/compute.js';
import { writeRunData, writeComparisonRecord } from '../output/storage.js';
import { launchBrowser } from '../screenshot/browser.js';

export type ProgressEvent =
  | { type: 'discover:start' }
  | { type: 'discover:progress'; urlCount: number; latestUrl: string }
  | { type: 'discover:done'; urlCount: number }
  | { type: 'url:start'; url: string; index: number; total: number }
  | { type: 'url:done'; url: string; index: number; total: number; status: 'succeeded' | 'failed' }
  | { type: 'complete'; stats: { totalUrls: number; succeeded: number; failed: number; skipped: number } };

export interface PipelineOptions {
  config: VisidiffConfig;
  runId: string;
  fetcher: (url: string) => Promise<Response>;
  progress?: (event: ProgressEvent | string) => void;
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return results;
}

function createUrlSlug(url: string): string {
  const { pathname, searchParams } = new URL(url);
  const pathnameSlug = pathname
    .split('/')
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment).toLowerCase())
    .join('-');
  const querySlug = Array.from(searchParams.entries())
    .flatMap(([key, value]) => [key, value].filter(Boolean))
    .map((part) => decodeURIComponent(part).toLowerCase())
    .join('-');
  const rawSlug = [pathnameSlug || 'home', querySlug]
    .filter(Boolean)
    .join('-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');

  return rawSlug || 'home';
}

function createUrlIds(urls: string[]): string[] {
  const slugCounts = new Map<string, number>();

  return urls.map((url) => {
    const slug = createUrlSlug(url);
    const nextCount = (slugCounts.get(slug) ?? 0) + 1;
    slugCounts.set(slug, nextCount);
    return nextCount === 1 ? slug : `${slug}-${nextCount}`;
  });
}

export async function runPipeline(opts: PipelineOptions): Promise<RunData> {
  const { config, runId, fetcher, progress = () => {} } = opts;
  const outputDir = config.outputDir;

  progress({ type: 'discover:start' });
  const groups = await discoverUrls({
    origin: new URL(config.original).origin,
    fetcher,
    maxDepth: config.maxDepth,
    maxPages: config.maxPages,
    exclude: config.exclude,
    ignoreRobots: config.ignoreRobots,
    samplesPerGroup: config.samplesPerGroup,
    samplingThreshold: config.samplingThreshold,
    seed: runId,
    pinned: [],
    onProgress: (urlCount, latestUrl) => {
      progress({ type: 'discover:progress', urlCount, latestUrl });
    },
  });

  const allUrls = groups.flatMap((g) => g.sampled);
  const urlIds = createUrlIds(allUrls);
  const groupByUrl = new Map<string, string>();
  for (const g of groups) {
    for (const u of g.sampled) {
      groupByUrl.set(u, g.pattern);
    }
  }
  progress({ type: 'discover:done', urlCount: allUrls.length });

  const comparisons: ComparisonRecord[] = [];
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  const originalPattern = parsePattern(config.original);
  const updatedPattern = parsePattern(config.updated);

  await mkdir(join(outputDir, 'original'), { recursive: true });
  await mkdir(join(outputDir, 'updated'), { recursive: true });
  await mkdir(join(outputDir, 'diff'), { recursive: true });

  const browser = await launchBrowser();
  try {

    await mapPool(allUrls, config.concurrency, async (url, index) => {
      progress({ type: 'url:start', url, index, total: allUrls.length });
      const urlId = urlIds[index] ?? createUrlSlug(url);
      const urlRecord: UrlRecord = {
        id: urlId,
        originalUrl: substitute(url, updatedPattern, originalPattern) ?? url,
        updatedUrl: substitute(url, originalPattern, updatedPattern) ?? url,
        group: groupByUrl.get(url) ?? '/',
        originalStatus: null,
        updatedStatus: null,
      };

      const viewports: ViewportDiff[] = await Promise.all(
        config.viewports.map(async (viewport) => {
          const originalRel = `original/${urlId}-${viewport}.png`;
          const updatedRel = `updated/${urlId}-${viewport}.png`;
          const diffRel = `diff/${urlId}-${viewport}.png`;
          const originalAbs = join(outputDir, 'original', `${urlId}-${viewport}.png`);
          const updatedAbs = join(outputDir, 'updated', `${urlId}-${viewport}.png`);
          const diffAbs = join(outputDir, 'diff', `${urlId}-${viewport}.png`);

          try {
            const [origResult, updResult] = await Promise.allSettled([
              captureScreenshot({
                url: urlRecord.originalUrl,
                viewport,
                auth: config.originalAuth,
                blockedRequestUrls: config.blockedRequestUrls,
                ...(config.beforeScreenshot ? { beforeScreenshot: config.beforeScreenshot } : {}),
                maskSelectors: config.mask,
                fullPageMaxHeight: config.fullPageMaxHeight,
                outputDir: join(outputDir, 'original'),
                outputPath: originalAbs,
                browser,
              }),
              captureScreenshot({
                url: urlRecord.updatedUrl,
                viewport,
                auth: config.updatedAuth,
                blockedRequestUrls: config.blockedRequestUrls,
                ...(config.beforeScreenshot ? { beforeScreenshot: config.beforeScreenshot } : {}),
                maskSelectors: config.mask,
                fullPageMaxHeight: config.fullPageMaxHeight,
                outputDir: join(outputDir, 'updated'),
                outputPath: updatedAbs,
                browser,
              }),
            ]);

            if (origResult.status === 'rejected') {
              throw origResult.reason;
            }

            if (updResult.status === 'rejected') {
              throw updResult.reason;
            }

            const diff = await computeDiff(origResult.value.buffer, updResult.value.buffer, diffAbs, config.threshold);

            urlRecord.originalStatus = origResult.value.status;
            urlRecord.updatedStatus = updResult.value.status;
            return {
              viewport,
              originalPath: originalRel,
              updatedPath: updatedRel,
              diffPath: diff ? diffRel : null,
              pixelDiffPercent: diff?.pixelDiffPercent ?? null,
              heightDeltaPx: null,
              status: diff ? 'computed' : 'skipped',
            };
          } catch (e) {
            return {
              viewport,
              originalPath: originalRel,
              updatedPath: updatedRel,
              diffPath: null,
              pixelDiffPercent: null,
              heightDeltaPx: null,
              status: 'failed' as const,
              error: e instanceof Error ? e.message : String(e),
            };
          }
        }),
      );

      // Check if any viewport failed to determine overall URL status
      const hasFailedViewport = viewports.some((v) => v.status === 'failed');
      if (hasFailedViewport) {
        failed++;
      } else {
        succeeded++;
      }

      comparisons.push({ url: urlRecord, viewports });
      progress({ type: 'url:done', url, index, total: allUrls.length, status: hasFailedViewport ? 'failed' : 'succeeded' });
    });
  } finally {
    await browser.close();
  }

  const runData: RunData = {
    version: 1,
    createdAt: new Date().toISOString(),
    config: {
      original: config.original,
      updated: config.updated,
      viewports: config.viewports,
      threshold: config.threshold,
    },
    comparisons,
    stats: {
      totalUrls: allUrls.length,
      succeeded,
      failed,
      skipped,
    },
  };

  await writeRunData(outputDir, runId, runData);
  for (const comp of comparisons) {
    await writeComparisonRecord(outputDir, comp);
  }

  progress({ type: 'complete', stats: { totalUrls: allUrls.length, succeeded, failed, skipped } });
  return runData;
}
