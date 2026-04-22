import { mkdir } from 'node:fs/promises';
import type { Browser } from 'playwright';
import { logger } from '../logger.js';
import { launchBrowser, createContext } from './browser.js';
import { waitForPageStable } from './wait.js';
import { injectMask } from './mask.js';
import type { AuthConfig } from '../types.js';
import { parsePattern, patternToRegExp } from '../url-pattern.js';

export interface CaptureOptions {
  url: string;
  viewport: number;
  auth: AuthConfig;
  blockedRequestUrls: string[];
  beforeScreenshot?: string;
  maskSelectors: string[];
  fullPageMaxHeight: number;
  outputDir: string;
  outputPath: string;
  browser?: Browser;
}

export interface CaptureResult {
  buffer: Buffer;
  status: number | null;
}

export async function captureScreenshot(opts: CaptureOptions): Promise<CaptureResult> {
  const shouldLaunchBrowser = !opts.browser;
  const browser = opts.browser ?? await launchBrowser();
  const context = await createContext(browser, { viewport: opts.viewport, auth: opts.auth });
  const blockedRequestPatterns = opts.blockedRequestUrls.map((pattern) => ({ raw: pattern, regex: patternToRegExp(parsePattern(pattern)) }));

  try {
    if (blockedRequestPatterns.length > 0) {
      for (const pattern of blockedRequestPatterns) {
        await context.route(pattern.regex, (route) => {
          const requestUrl = route.request().url();
          logger.debug({ requestUrl, captureUrl: opts.url, pattern: pattern.raw }, 'Blocked request URL');
          return route.abort();
        });
      }
    }

    const page = await context.newPage();

    const response = await page.goto(opts.url, { waitUntil: 'domcontentloaded' });
    await runBeforeScreenshot(page, opts.beforeScreenshot);
    await waitForPageStable(page);
    await runBeforeScreenshot(page, opts.beforeScreenshot);
    await injectMask(page, opts.maskSelectors);
    await runBeforeScreenshot(page, opts.beforeScreenshot);

    await mkdir(opts.outputDir, { recursive: true });
    const buffer = await page.screenshot({ path: opts.outputPath, fullPage: false });
    return { buffer, status: response?.status() ?? null };
  } finally {
    await context.close();
    if (shouldLaunchBrowser) await browser.close();
  }
}

async function runBeforeScreenshot(page: import('playwright').Page, beforeScreenshot?: string): Promise<void> {
  if (!beforeScreenshot) {
    return;
  }

  await page.evaluate((hookSource) => {
    const fn = new Function(`return (${hookSource});`)();
    if (typeof fn === 'function') {
      return fn();
    }
  }, beforeScreenshot);
}
