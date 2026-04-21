import { join } from 'node:path';
import type { VisidiffConfig, RunData, ComparisonRecord, UrlRecord, ViewportDiff } from '../types.js';
import { logger } from '../logger.js';
import { discoverUrls } from '../crawler/index.js';
import { parsePattern, substitute } from '../url-pattern.js';
import { captureScreenshot } from '../screenshot/index.js';
import { computeDiff } from '../diff/compute.js';
import { writeRunData, writeComparisonRecord } from '../output/storage.js';

export interface PipelineOptions {
  config: VisidiffConfig;
  runId: string;
  fetcher: (url: string) => Promise<Response>;
  progress?: (msg: string) => void;
}

export async function runPipeline(opts: PipelineOptions): Promise<RunData> {
  const { config, runId, fetcher, progress = () => {} } = opts;
  const outputDir = config.outputDir;
  const cacheDir = config.cacheDir;

  progress('Discovering URLs...');
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
  });

  const allUrls = groups.flatMap((g) => g.sampled);
  progress(`Discovered ${allUrls.length} URLs`);

  const comparisons: ComparisonRecord[] = [];
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (const url of allUrls) {
    progress(`Processing ${url}...`);
    const urlId = Buffer.from(url).toString('base64').slice(0, 12);
    const originalPattern = parsePattern(config.original);
    const updatedPattern = parsePattern(config.updated);
    const urlRecord: UrlRecord = {
      id: urlId,
      originalUrl: substitute(url, originalPattern, updatedPattern) ?? url,
      updatedUrl: substitute(url, updatedPattern, originalPattern) ?? url,
      group: '/',
      originalStatus: null,
      updatedStatus: null,
    };

    const viewports: ViewportDiff[] = [];
    for (const viewport of config.viewports) {
      const originalPath = join(outputDir, 'original', `${urlId}-${viewport}.png`);
      const updatedPath = join(outputDir, 'updated', `${urlId}-${viewport}.png`);
      const diffPath = join(outputDir, 'diff', `${urlId}-${viewport}.png`);

      try {
        const orig = await captureScreenshot({
          url: urlRecord.originalUrl,
          viewport,
          auth: config.originalAuth,
          maskSelectors: config.mask,
          fullPageMaxHeight: config.fullPageMaxHeight,
          cacheDir,
          outputDir: join(outputDir, 'original'),
          outputPath: originalPath,
          useCache: true,
        });

        const upd = await captureScreenshot({
          url: urlRecord.updatedUrl,
          viewport,
          auth: config.updatedAuth,
          maskSelectors: config.mask,
          fullPageMaxHeight: config.fullPageMaxHeight,
          cacheDir,
          outputDir: join(outputDir, 'updated'),
          outputPath: updatedPath,
          useCache: true,
        });

        const diff = await computeDiff(orig, upd, diffPath, config.threshold);
        viewports.push({
          viewport,
          originalPath,
          updatedPath,
          diffPath: diff?.diffPath ?? null,
          pixelDiffPercent: diff?.pixelDiffPercent ?? null,
          heightDeltaPx: null,
          status: diff ? 'computed' : 'skipped',
        });
      } catch (e) {
        viewports.push({
          viewport,
          originalPath,
          updatedPath,
          diffPath: null,
          pixelDiffPercent: null,
          heightDeltaPx: null,
          status: 'failed',
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    comparisons.push({ url: urlRecord, viewports });
    succeeded++;
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

  progress('Pipeline complete');
  return runData;
}
