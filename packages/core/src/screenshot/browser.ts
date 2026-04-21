import { readFile } from 'node:fs/promises';
import { chromium, type Browser, type BrowserContext } from 'playwright';
import type { AuthConfig } from '../types.js';

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({ headless: true });
}

export interface CreateContextOptions {
  viewport: number;
  auth: AuthConfig;
}

export async function createContext(
  browser: Browser,
  opts: CreateContextOptions,
): Promise<BrowserContext> {
  const contextOptions: any = {
    viewport: { width: opts.viewport, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    httpCredentials: parseBasic(opts.auth.basic),
  };
  if (opts.auth.headers) {
    contextOptions.extraHTTPHeaders = opts.auth.headers;
  }
  const ctx = await browser.newContext(contextOptions);
  if (opts.auth.cookiesFile) {
    const cookies = JSON.parse(await readFile(opts.auth.cookiesFile, 'utf8'));
    await ctx.addCookies(cookies);
  }
  return ctx;
}

function parseBasic(basic?: string) {
  if (!basic) return undefined;
  const [username, ...rest] = basic.split(':');
  return { username: username ?? '', password: rest.join(':') };
}
