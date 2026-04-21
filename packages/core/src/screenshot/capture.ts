import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Page, Browser } from 'playwright';
import { launchBrowser, createContext } from './browser.js';
import { waitForPageStable } from './wait.js';
import { injectMask } from './mask.js';
import { ScreenshotCache } from './cache.js';
import type { AuthConfig } from '../types.js';

export interface CaptureOptions {
  url: string;
  viewport: number;
  auth: AuthConfig;
  maskSelectors: string[];
  fullPageMaxHeight: number;
  cacheDir: string;
  outputDir: string;
  outputPath: string;
  useCache: boolean;
}

export async function captureScreenshot(opts: CaptureOptions): Promise<Buffer> {
  const cache = new ScreenshotCache(opts.cacheDir);
  if (opts.useCache) {
    const cached = await cache.get(opts.url, opts.viewport);
    if (cached) return cached;
  }

  const browser = await launchBrowser();
  const context = await createContext(browser, { viewport: opts.viewport, auth: opts.auth });
  const page = await context.newPage();

  try {
    await page.goto(opts.url, { waitUntil: 'domcontentloaded' });
    await waitForPageStable(page);
    await injectMask(page, opts.maskSelectors);

    await mkdir(opts.outputDir, { recursive: true });
    const buffer = await page.screenshot({ path: opts.outputPath, fullPage: false });
    if (opts.useCache) await cache.set(opts.url, opts.viewport, buffer);
    return buffer;
  } finally {
    await context.close();
    await browser.close();
  }
}
