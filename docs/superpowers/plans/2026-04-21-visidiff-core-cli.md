# visidiff Core + CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the headless foundation of visidiff — a CLI that crawls a site, discovers URLs, samples them, takes screenshots of original and updated URLs across viewports, computes pixel diffs, and writes a complete output directory (`data.json` + PNG files) ready to be consumed by a separate report UI (plan 2).

**Architecture:** pnpm monorepo with `core` (library: crawler, screenshot, diff, pipeline) and `cli` (commander-based CLI). Playwright drives screenshots, cheerio drives crawling, ODiff drives pixel diffing. The CLI's `compare` command runs the full pipeline; `init` scaffolds a config; `rescreenshot` re-runs a subset (used later by the server in plan 3).

**Tech Stack:** Node.js 20+, TypeScript 5, pnpm workspaces, Playwright, cheerio, odiff-bin, sharp, p-queue, listr2, commander, zod, vitest.

---

## File Structure

```
visidiff/
  .gitignore
  .prettierrc
  package.json                    # workspace root
  pnpm-workspace.yaml
  tsconfig.base.json
  vitest.config.ts                # shared test config
  packages/
    core/
      package.json
      tsconfig.json
      src/
        index.ts                  # public exports
        types.ts                  # UrlRecord, DiffResult, Config, etc.
        config.ts                 # loadConfig() + zod schema
        url-pattern.ts            # parsePattern + substitute
        logger.ts                 # pino instance
        crawler/
          robots.ts               # RobotsChecker
          sitemap.ts              # fetchSitemapUrls
          http-crawler.ts         # crawl via HTTP + cheerio
          sampling.ts             # groupAndSample
          index.ts                # discoverUrls() orchestrator
        screenshot/
          browser.ts              # createContext (auth/cookies/headers)
          wait.ts                 # waitForStable
          mask.ts                 # buildMaskCss
          capture.ts              # captureScreenshot
          cache.ts                # ScreenshotCache
          index.ts
        diff/
          pad.ts                  # padToSameHeight
          compute.ts              # computeDiff (ODiff wrapper)
          index.ts
        pipeline/
          storage.ts              # OutputWriter (data.json + files)
          run.ts                  # runPipeline (orchestrator)
          index.ts
      test/
        fixtures/
          sitemap.xml
          sample-page.html
        url-pattern.test.ts
        sampling.test.ts
        robots.test.ts
        sitemap.test.ts
        http-crawler.test.ts
        config.test.ts
        pad.test.ts
        compute.test.ts
        storage.test.ts
    cli/
      package.json
      tsconfig.json
      bin/visidiff.js
      src/
        index.ts                  # commander setup
        commands/
          init.ts
          compare.ts
          rescreenshot.ts
        progress.ts               # listr2 integration
        templates/
          config.template.ts      # written by `init`
      test/
        init.test.ts
        compare.integration.test.ts
```

---

## Phase 1: Project Foundation

### Task 1: Monorepo scaffold

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `.prettierrc`, `vitest.config.ts`, `README.md`

- [ ] **Step 1: Initialize git**

```bash
cd C:/Workspaces/visidiff
git init
git branch -M main
```

- [ ] **Step 2: Create root `package.json`**

```json
{
  "name": "visidiff-monorepo",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "pnpm -r build",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "pnpm -r typecheck",
    "lint": "prettier --check \"packages/**/*.{ts,json,md}\""
  },
  "devDependencies": {
    "@types/node": "^20.12.0",
    "prettier": "^3.2.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  },
  "packageManager": "pnpm@9.0.0"
}
```

- [ ] **Step 3: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "packages/*"
```

- [ ] **Step 4: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

- [ ] **Step 5: Create `.gitignore`**

```
node_modules/
dist/
.site-diff-cache/
visidiff-output/
*.log
.DS_Store
.env
.env.local
coverage/
```

- [ ] **Step 6: Create `.prettierrc`**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100
}
```

- [ ] **Step 7: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/test/**/*.test.ts'],
    coverage: { provider: 'v8', reporter: ['text', 'html'] },
    testTimeout: 20_000,
  },
});
```

- [ ] **Step 8: Install root deps and verify**

```bash
pnpm install
pnpm test
```

Expected: vitest runs, reports "No test files found" — passes with no tests yet.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: initialize monorepo scaffold"
```

---

### Task 2: Core package scaffold + shared types

**Files:**
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/src/index.ts`, `packages/core/src/types.ts`, `packages/core/src/logger.ts`

- [ ] **Step 1: Create `packages/core/package.json`**

```json
{
  "name": "@visidiff/core",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "cheerio": "^1.0.0-rc.12",
    "odiff-bin": "^3.2.0",
    "p-queue": "^8.0.1",
    "playwright": "^1.44.0",
    "pino": "^9.1.0",
    "sharp": "^0.33.3",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^20.12.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create `packages/core/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Create `packages/core/src/types.ts`**

```ts
export interface UrlPattern {
  prefix: string;
  suffix: string;
  raw: string;
}

export interface AuthConfig {
  basic?: string;
  headers?: Record<string, string>;
  cookiesFile?: string;
}

export interface MaskConfig {
  selectors: string[];
}

export interface VisidiffConfig {
  original: string;
  updated: string;
  viewports: number[];
  maxDepth: number;
  maxPages: number;
  exclude: string[];
  samplesPerGroup: number;
  samplingThreshold: number;
  fullPageMaxHeight: number;
  concurrency: number;
  requestDelayMs: number;
  retries: number;
  ignoreRobots: boolean;
  threshold: number;
  mask: string[];
  originalAuth: AuthConfig;
  updatedAuth: AuthConfig;
  beforeScreenshot?: string;
  outputDir: string;
  cacheDir: string;
  runId?: string;
}

export interface UrlGroup {
  pattern: string;
  urls: string[];
  sampled: string[];
}

export type CrawlStatus = 'pending' | 'success' | 'skipped-404' | 'error';

export interface UrlRecord {
  id: string;
  originalUrl: string;
  updatedUrl: string;
  group: string;
  originalStatus: number | null;
  updatedStatus: number | null;
  error?: string;
}

export type DiffStatus = 'pending' | 'computed' | 'failed' | 'skipped';

export interface ViewportDiff {
  viewport: number;
  originalPath: string;
  updatedPath: string;
  diffPath: string | null;
  pixelDiffPercent: number | null;
  heightDeltaPx: number | null;
  status: DiffStatus;
  error?: string;
}

export interface ComparisonRecord {
  url: UrlRecord;
  viewports: ViewportDiff[];
}

export interface RunData {
  version: 1;
  createdAt: string;
  config: Pick<VisidiffConfig, 'original' | 'updated' | 'viewports' | 'threshold'>;
  comparisons: ComparisonRecord[];
  stats: {
    totalUrls: number;
    succeeded: number;
    failed: number;
    skipped: number;
  };
}
```

- [ ] **Step 4: Create `packages/core/src/logger.ts`**

```ts
import { pino } from 'pino';

export const logger = pino({
  level: process.env.VISIDIFF_LOG_LEVEL ?? 'info',
  transport: { target: 'pino-pretty', options: { colorize: true } },
});
```

- [ ] **Step 5: Create `packages/core/src/index.ts`**

```ts
export * from './types.js';
export { logger } from './logger.js';
```

- [ ] **Step 6: Install + typecheck**

```bash
pnpm install
pnpm --filter @visidiff/core typecheck
```

Expected: typecheck passes, no errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(core): scaffold package with shared types"
```

---

## Phase 2: URL Patterns

### Task 3: URL pattern parser + substitution

**Files:**
- Create: `packages/core/src/url-pattern.ts`
- Test: `packages/core/test/url-pattern.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// packages/core/test/url-pattern.test.ts
import { describe, expect, it } from 'vitest';
import { parsePattern, substitute, UrlPatternError } from '../src/url-pattern.js';

describe('parsePattern', () => {
  it('splits around a single asterisk', () => {
    expect(parsePattern('https://example.com/*')).toEqual({
      prefix: 'https://example.com/',
      suffix: '',
      raw: 'https://example.com/*',
    });
  });

  it('supports suffix after asterisk', () => {
    expect(parsePattern('https://example.com/*/details')).toEqual({
      prefix: 'https://example.com/',
      suffix: '/details',
      raw: 'https://example.com/*/details',
    });
  });

  it('throws on zero asterisks', () => {
    expect(() => parsePattern('https://example.com/')).toThrow(UrlPatternError);
  });

  it('throws on multiple asterisks', () => {
    expect(() => parsePattern('https://*.example.com/*')).toThrow(UrlPatternError);
  });
});

describe('substitute', () => {
  const original = parsePattern('https://www.mysite.com/*');
  const updated = parsePattern('https://staging.x.com/mysite/*');

  it('maps matching URL', () => {
    expect(substitute('https://www.mysite.com/about/team', original, updated)).toBe(
      'https://staging.x.com/mysite/about/team',
    );
  });

  it('preserves query string', () => {
    expect(substitute('https://www.mysite.com/search?q=foo', original, updated)).toBe(
      'https://staging.x.com/mysite/search?q=foo',
    );
  });

  it('returns null for URL not matching original pattern', () => {
    expect(substitute('https://other.com/about', original, updated)).toBeNull();
  });

  it('handles patterns with suffix', () => {
    const src = parsePattern('https://a.com/*/page');
    const dst = parsePattern('https://b.com/x/*/page');
    expect(substitute('https://a.com/foo/bar/page', src, dst)).toBe('https://b.com/x/foo/bar/page');
  });
});
```

- [ ] **Step 2: Run tests — expect fail**

```bash
pnpm test url-pattern
```

Expected: module not found.

- [ ] **Step 3: Implement**

```ts
// packages/core/src/url-pattern.ts
import type { UrlPattern } from './types.js';

export class UrlPatternError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UrlPatternError';
  }
}

export function parsePattern(raw: string): UrlPattern {
  const parts = raw.split('*');
  if (parts.length !== 2) {
    throw new UrlPatternError(
      `Pattern must contain exactly one '*': got ${parts.length - 1} in "${raw}"`,
    );
  }
  return { prefix: parts[0]!, suffix: parts[1]!, raw };
}

export function substitute(
  url: string,
  source: UrlPattern,
  target: UrlPattern,
): string | null {
  if (!url.startsWith(source.prefix)) return null;
  const afterPrefix = url.slice(source.prefix.length);
  if (source.suffix) {
    const idx = afterPrefix.lastIndexOf(source.suffix);
    if (idx === -1) return null;
    const captured = afterPrefix.slice(0, idx);
    const trailing = afterPrefix.slice(idx + source.suffix.length);
    return `${target.prefix}${captured}${target.suffix}${trailing}`;
  }
  return `${target.prefix}${afterPrefix}${target.suffix}`;
}
```

- [ ] **Step 4: Export from index, run tests**

Update `packages/core/src/index.ts`:

```ts
export * from './types.js';
export { logger } from './logger.js';
export { parsePattern, substitute, UrlPatternError } from './url-pattern.js';
```

Run:

```bash
pnpm test url-pattern
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(core): parse and substitute single-asterisk URL patterns"
```

---

## Phase 3: URL Discovery

### Task 4: Robots.txt checker

**Files:**
- Create: `packages/core/src/crawler/robots.ts`
- Test: `packages/core/test/robots.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// packages/core/test/robots.test.ts
import { describe, expect, it, vi } from 'vitest';
import { RobotsChecker } from '../src/crawler/robots.js';

describe('RobotsChecker', () => {
  it('allows when robots.txt is missing (404)', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => '' });
    const checker = await RobotsChecker.load('https://example.com', fetcher);
    expect(checker.isAllowed('https://example.com/about')).toBe(true);
  });

  it('disallows path blocked by user-agent *', async () => {
    const txt = 'User-agent: *\nDisallow: /admin\n';
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => txt });
    const checker = await RobotsChecker.load('https://example.com', fetcher);
    expect(checker.isAllowed('https://example.com/admin/login')).toBe(false);
    expect(checker.isAllowed('https://example.com/about')).toBe(true);
  });

  it('ignore mode always returns true', async () => {
    const txt = 'User-agent: *\nDisallow: /\n';
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => txt });
    const checker = await RobotsChecker.load('https://example.com', fetcher, { ignore: true });
    expect(checker.isAllowed('https://example.com/anything')).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect fail**

```bash
pnpm test robots
```

- [ ] **Step 3: Add dependency**

```bash
pnpm --filter @visidiff/core add robots-parser
```

- [ ] **Step 4: Implement**

```ts
// packages/core/src/crawler/robots.ts
import robotsParser from 'robots-parser';

export interface FetchLike {
  (url: string): Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;
}

export interface RobotsOptions {
  ignore?: boolean;
  userAgent?: string;
}

export class RobotsChecker {
  private constructor(
    private readonly robots: ReturnType<typeof robotsParser> | null,
    private readonly userAgent: string,
    private readonly ignore: boolean,
  ) {}

  static async load(origin: string, fetcher: FetchLike, opts: RobotsOptions = {}) {
    const userAgent = opts.userAgent ?? 'visidiff';
    if (opts.ignore) return new RobotsChecker(null, userAgent, true);
    const robotsUrl = new URL('/robots.txt', origin).toString();
    let text = '';
    try {
      const res = await fetcher(robotsUrl);
      if (res.ok) text = await res.text();
    } catch {
      // treat as empty — allow-all
    }
    const robots = robotsParser(robotsUrl, text);
    return new RobotsChecker(robots, userAgent, false);
  }

  isAllowed(url: string): boolean {
    if (this.ignore || !this.robots) return true;
    return this.robots.isAllowed(url, this.userAgent) ?? true;
  }
}
```

- [ ] **Step 5: Run tests — expect pass**

```bash
pnpm test robots
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(core): add robots.txt checker with ignore override"
```

---

### Task 5: Sitemap parser

**Files:**
- Create: `packages/core/src/crawler/sitemap.ts`
- Test: `packages/core/test/sitemap.test.ts`, `packages/core/test/fixtures/sitemap.xml`, `packages/core/test/fixtures/sitemap-index.xml`

- [ ] **Step 1: Create fixtures**

`packages/core/test/fixtures/sitemap.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/</loc></url>
  <url><loc>https://example.com/about</loc></url>
  <url><loc>https://example.com/blog/post-1</loc></url>
</urlset>
```

`packages/core/test/fixtures/sitemap-index.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.com/sitemap-1.xml</loc></sitemap>
</sitemapindex>
```

- [ ] **Step 2: Write failing tests**

```ts
// packages/core/test/sitemap.test.ts
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { fetchSitemapUrls } from '../src/crawler/sitemap.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (n: string) => readFile(join(here, 'fixtures', n), 'utf8');

describe('fetchSitemapUrls', () => {
  it('returns [] when sitemap is missing', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => '' });
    expect(await fetchSitemapUrls('https://example.com', fetcher)).toEqual([]);
  });

  it('parses flat sitemap', async () => {
    const xml = await read('sitemap.xml');
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => xml });
    expect(await fetchSitemapUrls('https://example.com', fetcher)).toEqual([
      'https://example.com/',
      'https://example.com/about',
      'https://example.com/blog/post-1',
    ]);
  });

  it('follows sitemap index', async () => {
    const index = await read('sitemap-index.xml');
    const child = await read('sitemap.xml');
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => index })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => child });
    const urls = await fetchSitemapUrls('https://example.com', fetcher);
    expect(urls).toHaveLength(3);
  });
});
```

- [ ] **Step 3: Run — expect fail**

```bash
pnpm test sitemap
```

- [ ] **Step 4: Implement**

```ts
// packages/core/src/crawler/sitemap.ts
import * as cheerio from 'cheerio';
import type { FetchLike } from './robots.js';

export async function fetchSitemapUrls(origin: string, fetcher: FetchLike): Promise<string[]> {
  const url = new URL('/sitemap.xml', origin).toString();
  return fetchFrom(url, fetcher, new Set());
}

async function fetchFrom(url: string, fetcher: FetchLike, seen: Set<string>): Promise<string[]> {
  if (seen.has(url)) return [];
  seen.add(url);
  let text = '';
  try {
    const res = await fetcher(url);
    if (!res.ok) return [];
    text = await res.text();
  } catch {
    return [];
  }
  const $ = cheerio.load(text, { xmlMode: true });
  const nested = $('sitemap > loc')
    .map((_, el) => $(el).text().trim())
    .get();
  if (nested.length > 0) {
    const all: string[] = [];
    for (const n of nested) all.push(...(await fetchFrom(n, fetcher, seen)));
    return all;
  }
  return $('url > loc')
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);
}
```

- [ ] **Step 5: Run tests — expect pass**

```bash
pnpm test sitemap
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(core): parse sitemap.xml and sitemap index"
```

---

### Task 6: HTTP crawler

**Files:**
- Create: `packages/core/src/crawler/http-crawler.ts`
- Test: `packages/core/test/http-crawler.test.ts`, `packages/core/test/fixtures/sample-page.html`

- [ ] **Step 1: Create fixture**

`packages/core/test/fixtures/sample-page.html`:

```html
<!doctype html>
<html><body>
  <a href="/about">About</a>
  <a href="/contact">Contact</a>
  <a href="https://example.com/blog/1">Post 1</a>
  <a href="https://external.com/page">External</a>
  <a href="/page.pdf">PDF</a>
</body></html>
```

- [ ] **Step 2: Write failing tests**

```ts
// packages/core/test/http-crawler.test.ts
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
    expect(urls.every((u) => !u.endsWith('.pdf'))).toBe(true);
  });

  it('respects isAllowed (robots)', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => fixture });
    const urls = await crawl({
      start: 'https://example.com/',
      fetcher,
      maxDepth: 1,
      maxPages: 100,
      isAllowed: (u) => !u.includes('/contact'),
      exclude: [],
    });
    expect(urls).not.toContain('https://example.com/contact');
  });
});
```

- [ ] **Step 3: Run — expect fail**

```bash
pnpm test http-crawler
```

- [ ] **Step 4: Add dep**

```bash
pnpm --filter @visidiff/core add picomatch
pnpm --filter @visidiff/core add -D @types/picomatch
```

- [ ] **Step 5: Implement**

```ts
// packages/core/src/crawler/http-crawler.ts
import * as cheerio from 'cheerio';
import picomatch from 'picomatch';
import type { FetchLike } from './robots.js';

export interface CrawlOptions {
  start: string;
  fetcher: FetchLike;
  maxDepth: number;
  maxPages: number;
  isAllowed: (url: string) => boolean;
  exclude: string[];
}

export async function crawl(opts: CrawlOptions): Promise<string[]> {
  const origin = new URL(opts.start).origin;
  const excludeMatchers = opts.exclude.map((p) => picomatch(p));
  const isExcluded = (url: string) => excludeMatchers.some((m) => m(new URL(url).pathname));

  const visited = new Set<string>();
  const queue: Array<{ url: string; depth: number }> = [{ url: normalize(opts.start), depth: 0 }];
  const results: string[] = [];

  while (queue.length && results.length < opts.maxPages) {
    const { url, depth } = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);
    if (!opts.isAllowed(url) || isExcluded(url)) continue;
    if (!url.startsWith(origin)) continue;

    results.push(url);
    if (depth >= opts.maxDepth) continue;

    let html = '';
    try {
      const res = await opts.fetcher(url);
      if (!res.ok) continue;
      html = await res.text();
    } catch {
      continue;
    }
    const $ = cheerio.load(html);
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      try {
        const abs = normalize(new URL(href, url).toString());
        if (!visited.has(abs)) queue.push({ url: abs, depth: depth + 1 });
      } catch {
        /* invalid URL */
      }
    });
  }
  return results.slice(0, opts.maxPages);
}

function normalize(u: string): string {
  const url = new URL(u);
  url.hash = '';
  return url.toString();
}
```

- [ ] **Step 6: Run tests — expect pass**

```bash
pnpm test http-crawler
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(core): HTTP crawler with depth, origin, and exclude filters"
```

---

### Task 7: URL sampling

**Files:**
- Create: `packages/core/src/crawler/sampling.ts`
- Test: `packages/core/test/sampling.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// packages/core/test/sampling.test.ts
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
    expect(groups.flatMap((g) => g.sampled).sort()).toEqual(urls.slice().sort());
  });

  it('groups high-cardinality segment and samples N', () => {
    const urls = Array.from({ length: 20 }, (_, i) => `https://example.com/blog/post-${i}`);
    const groups = groupAndSample(urls, { samplesPerGroup: 2, threshold: 5, seed: 'x' });
    const blogGroup = groups.find((g) => g.pattern.startsWith('/blog/'))!;
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
    expect(groups.flatMap((g) => g.sampled)).toContain('https://example.com/about');
  });
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement**

```ts
// packages/core/src/crawler/sampling.ts
import { createHash } from 'node:crypto';
import type { UrlGroup } from '../types.js';

export interface SamplingOptions {
  samplesPerGroup: number;
  threshold: number;
  seed: string;
  pinned?: string[];
}

export function groupAndSample(urls: string[], opts: SamplingOptions): UrlGroup[] {
  const pinned = new Set(opts.pinned ?? []);
  const tokenized = urls.map((u) => ({ url: u, segments: new URL(u).pathname.split('/') }));

  // Build prefix tree to find variable positions.
  const byPrefix = new Map<string, string[]>();
  for (const { url, segments } of tokenized) {
    const key = buildPatternKey(segments, tokenized, opts.threshold);
    const list = byPrefix.get(key) ?? [];
    list.push(url);
    byPrefix.set(key, list);
  }

  const groups: UrlGroup[] = [];
  for (const [pattern, groupUrls] of byPrefix) {
    const isPatternGroup = pattern.includes('[*]');
    const pinnedInGroup = groupUrls.filter((u) => pinned.has(u));
    const nonPinned = groupUrls.filter((u) => !pinned.has(u));

    let sampled: string[];
    if (!isPatternGroup || nonPinned.length <= opts.samplesPerGroup) {
      sampled = groupUrls.slice();
    } else {
      const first = nonPinned[0]!;
      const rest = deterministicSample(
        nonPinned.slice(1),
        opts.samplesPerGroup - 1,
        `${opts.seed}:${pattern}`,
      );
      sampled = [first, ...rest, ...pinnedInGroup];
    }
    groups.push({ pattern, urls: groupUrls, sampled });
  }
  return groups;
}

function buildPatternKey(
  segments: string[],
  all: Array<{ segments: string[] }>,
  threshold: number,
): string {
  const result: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const matches = all.filter((t) => samePrefix(t.segments, segments, i));
    const uniqAtPos = new Set(matches.map((t) => t.segments[i] ?? ''));
    if (uniqAtPos.size >= threshold) {
      result.push('[*]');
    } else {
      result.push(segments[i] ?? '');
    }
  }
  return result.join('/');
}

function samePrefix(a: string[], b: string[], upTo: number): boolean {
  if (upTo > a.length || upTo > b.length) return false;
  for (let i = 0; i < upTo; i++) if (a[i] !== b[i]) return false;
  return true;
}

function deterministicSample<T>(items: T[], n: number, seed: string): T[] {
  if (n <= 0 || items.length === 0) return [];
  if (items.length <= n) return items.slice();
  const keyed = items.map((item, i) => ({
    item,
    key: createHash('sha256').update(`${seed}:${i}`).digest('hex'),
  }));
  keyed.sort((a, b) => a.key.localeCompare(b.key));
  return keyed.slice(0, n).map((k) => k.item);
}
```

- [ ] **Step 4: Run tests — expect pass**

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(core): deterministic URL sampling with grouping"
```

---

### Task 8: URL discovery orchestrator

**Files:**
- Create: `packages/core/src/crawler/index.ts`

- [ ] **Step 1: Implement (no separate test — integration-tested in pipeline)**

```ts
// packages/core/src/crawler/index.ts
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
      pinned: opts.pinned,
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
    pinned: opts.pinned,
  });
}

export { RobotsChecker } from './robots.js';
export { fetchSitemapUrls } from './sitemap.js';
export { crawl } from './http-crawler.js';
export { groupAndSample } from './sampling.js';
```

- [ ] **Step 2: Add `fetch`-based default and export from core index**

Append to `packages/core/src/index.ts`:

```ts
export * from './crawler/index.js';
```

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm --filter @visidiff/core typecheck
git add -A
git commit -m "feat(core): URL discovery orchestrator (sitemap → crawl → sample)"
```

---

## Phase 4: Config

### Task 9: Config schema and loader

**Files:**
- Create: `packages/core/src/config.ts`
- Test: `packages/core/test/config.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// packages/core/test/config.test.ts
import { describe, expect, it } from 'vitest';
import { validateConfig, DEFAULT_CONFIG } from '../src/config.js';

describe('validateConfig', () => {
  it('fills defaults from minimal input', () => {
    const cfg = validateConfig({
      original: 'https://a.com/*',
      updated: 'https://b.com/*',
    });
    expect(cfg.viewports).toEqual(DEFAULT_CONFIG.viewports);
    expect(cfg.concurrency).toBe(DEFAULT_CONFIG.concurrency);
  });

  it('rejects missing asterisk in original', () => {
    expect(() =>
      validateConfig({ original: 'https://a.com/', updated: 'https://b.com/*' }),
    ).toThrow(/original.*asterisk/i);
  });

  it('allows overrides', () => {
    const cfg = validateConfig({
      original: 'https://a.com/*',
      updated: 'https://b.com/*',
      viewports: [1920],
      concurrency: 2,
    });
    expect(cfg.viewports).toEqual([1920]);
    expect(cfg.concurrency).toBe(2);
  });
});
```

- [ ] **Step 2: Implement**

```ts
// packages/core/src/config.ts
import { z } from 'zod';
import type { VisidiffConfig } from './types.js';

export const DEFAULT_CONFIG = {
  viewports: [1440, 390],
  maxDepth: 3,
  maxPages: 200,
  exclude: [] as string[],
  samplesPerGroup: 2,
  samplingThreshold: 5,
  fullPageMaxHeight: 10_000,
  concurrency: 4,
  requestDelayMs: 0,
  retries: 2,
  ignoreRobots: false,
  threshold: 0.1,
  mask: [] as string[],
  originalAuth: {},
  updatedAuth: {},
  outputDir: './visidiff-output',
  cacheDir: './.visidiff-cache',
} as const;

const AuthSchema = z.object({
  basic: z.string().optional(),
  headers: z.record(z.string()).optional(),
  cookiesFile: z.string().optional(),
});

const ConfigSchema = z.object({
  original: z
    .string()
    .refine((s) => (s.match(/\*/g) ?? []).length === 1, {
      message: "original: pattern must contain exactly one asterisk ('*')",
    }),
  updated: z
    .string()
    .refine((s) => (s.match(/\*/g) ?? []).length === 1, {
      message: "updated: pattern must contain exactly one asterisk ('*')",
    }),
  viewports: z.array(z.number().int().positive()).default([...DEFAULT_CONFIG.viewports]),
  maxDepth: z.number().int().nonnegative().default(DEFAULT_CONFIG.maxDepth),
  maxPages: z.number().int().positive().default(DEFAULT_CONFIG.maxPages),
  exclude: z.array(z.string()).default([]),
  samplesPerGroup: z.number().int().positive().default(DEFAULT_CONFIG.samplesPerGroup),
  samplingThreshold: z.number().int().min(2).default(DEFAULT_CONFIG.samplingThreshold),
  fullPageMaxHeight: z.number().int().positive().default(DEFAULT_CONFIG.fullPageMaxHeight),
  concurrency: z.number().int().positive().default(DEFAULT_CONFIG.concurrency),
  requestDelayMs: z.number().int().nonnegative().default(0),
  retries: z.number().int().nonnegative().default(DEFAULT_CONFIG.retries),
  ignoreRobots: z.boolean().default(false),
  threshold: z.number().min(0).max(1).default(DEFAULT_CONFIG.threshold),
  mask: z.array(z.string()).default([]),
  originalAuth: AuthSchema.default({}),
  updatedAuth: AuthSchema.default({}),
  beforeScreenshot: z.string().optional(),
  outputDir: z.string().default(DEFAULT_CONFIG.outputDir),
  cacheDir: z.string().default(DEFAULT_CONFIG.cacheDir),
  runId: z.string().optional(),
});

export function validateConfig(input: unknown): VisidiffConfig {
  return ConfigSchema.parse(input) as VisidiffConfig;
}

export async function loadConfigFromFile(path: string): Promise<VisidiffConfig> {
  const mod = await import(path);
  const raw = mod.default ?? mod;
  return validateConfig(raw);
}
```

- [ ] **Step 3: Export + tests pass + commit**

Append to `packages/core/src/index.ts`:

```ts
export { validateConfig, loadConfigFromFile, DEFAULT_CONFIG } from './config.js';
```

```bash
pnpm test config
git add -A
git commit -m "feat(core): config schema with zod and defaults"
```

---

## Phase 5: Screenshots

### Task 10: Browser context builder

**Files:**
- Create: `packages/core/src/screenshot/browser.ts`

- [ ] **Step 1: Implement (tested via integration in capture task)**

```ts
// packages/core/src/screenshot/browser.ts
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
  const ctx = await browser.newContext({
    viewport: { width: opts.viewport, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    httpCredentials: parseBasic(opts.auth.basic),
    extraHTTPHeaders: opts.auth.headers ?? undefined,
  });
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
```

- [ ] **Step 2: Install playwright browsers**

```bash
pnpm --filter @visidiff/core exec playwright install chromium
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(core): Playwright browser + context builder with auth"
```

---

### Task 11: Wait strategy

**Files:**
- Create: `packages/core/src/screenshot/wait.ts`

- [ ] **Step 1: Implement**

```ts
// packages/core/src/screenshot/wait.ts
import type { Page } from 'playwright';

const DISABLE_MOTION_CSS = `
*, *::before, *::after {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  transition-duration: 0s !important;
  transition-delay: 0s !important;
  caret-color: transparent !important;
}
`;

const NEUTRALIZE_STICKY_CSS = `
*[style*="position: fixed"], *[style*="position: sticky"] { position: absolute !important; }
`;

export async function stabilizePage(page: Page, fullPageMaxHeight: number): Promise<void> {
  await page.addStyleTag({ content: DISABLE_MOTION_CSS });
  await page.evaluate(() => (document as Document).fonts?.ready);
  await page.waitForLoadState('networkidle');

  const viewportHeight = page.viewportSize()?.height ?? 900;
  let y = 0;
  while (y < fullPageMaxHeight) {
    await page.evaluate((to) => window.scrollTo(0, to), y);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(100);
    const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    if (y + viewportHeight >= scrollHeight) break;
    y += viewportHeight;
  }

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.addStyleTag({ content: NEUTRALIZE_STICKY_CSS });
  await page.waitForTimeout(500);
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(core): page stabilization (fonts, animations, scroll-through, sticky)"
```

---

### Task 12: Mask injection

**Files:**
- Create: `packages/core/src/screenshot/mask.ts`

- [ ] **Step 1: Implement**

```ts
// packages/core/src/screenshot/mask.ts
import type { Page } from 'playwright';

const DEFAULT_MASKED = ['video', 'iframe'];

export async function applyMasks(page: Page, selectors: string[]): Promise<void> {
  const all = [...DEFAULT_MASKED, ...selectors];
  if (all.length === 0) return;
  const css = `${all.join(', ')} { visibility: hidden !important; }`;
  await page.addStyleTag({ content: css });
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(core): CSS selector masking before screenshot"
```

---

### Task 13: Screenshot cache

**Files:**
- Create: `packages/core/src/screenshot/cache.ts`
- Test: `packages/core/test/cache.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// packages/core/test/cache.test.ts
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ScreenshotCache } from '../src/screenshot/cache.js';

describe('ScreenshotCache', () => {
  it('returns null on miss', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'visicache-'));
    const cache = new ScreenshotCache(dir);
    const key = { url: 'https://a.com/', viewport: 1440, maskHash: 'x', hookHash: 'y' };
    expect(await cache.get(key)).toBeNull();
  });

  it('round-trips a buffer', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'visicache-'));
    const cache = new ScreenshotCache(dir);
    const key = { url: 'https://a.com/', viewport: 1440, maskHash: 'x', hookHash: 'y' };
    const buf = Buffer.from('hello');
    await cache.set(key, buf);
    const out = await cache.get(key);
    expect(out).not.toBeNull();
    expect(out!.equals(buf)).toBe(true);
  });

  it('different keys do not collide', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'visicache-'));
    const cache = new ScreenshotCache(dir);
    await cache.set({ url: 'a', viewport: 1440, maskHash: 'x', hookHash: 'y' }, Buffer.from('A'));
    await cache.set({ url: 'a', viewport: 390, maskHash: 'x', hookHash: 'y' }, Buffer.from('B'));
    const a = await cache.get({ url: 'a', viewport: 1440, maskHash: 'x', hookHash: 'y' });
    const b = await cache.get({ url: 'a', viewport: 390, maskHash: 'x', hookHash: 'y' });
    expect(a!.toString()).toBe('A');
    expect(b!.toString()).toBe('B');
  });
});
```

- [ ] **Step 2: Implement**

```ts
// packages/core/src/screenshot/cache.ts
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface CacheKey {
  url: string;
  viewport: number;
  maskHash: string;
  hookHash: string;
}

export class ScreenshotCache {
  constructor(private readonly root: string) {}

  private pathFor(key: CacheKey): string {
    const h = createHash('sha256')
      .update(`${key.url}|${key.viewport}|${key.maskHash}|${key.hookHash}`)
      .digest('hex');
    return join(this.root, `${h}.png`);
  }

  async get(key: CacheKey): Promise<Buffer | null> {
    try {
      return await readFile(this.pathFor(key));
    } catch {
      return null;
    }
  }

  async set(key: CacheKey, data: Buffer): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await writeFile(this.pathFor(key), data);
  }
}

export function hashStrings(values: string[]): string {
  return createHash('sha256').update(values.join('|')).digest('hex').slice(0, 12);
}
```

- [ ] **Step 3: Run tests + commit**

```bash
pnpm test cache
git add -A
git commit -m "feat(core): hash-based screenshot cache"
```

---

### Task 14: Screenshot capture orchestrator

**Files:**
- Create: `packages/core/src/screenshot/capture.ts`, `packages/core/src/screenshot/index.ts`

- [ ] **Step 1: Implement capture**

```ts
// packages/core/src/screenshot/capture.ts
import type { BrowserContext } from 'playwright';
import { stabilizePage } from './wait.js';
import { applyMasks } from './mask.js';

export interface CaptureOptions {
  url: string;
  context: BrowserContext;
  mask: string[];
  fullPageMaxHeight: number;
  beforeScreenshot?: (page: import('playwright').Page) => Promise<void>;
  navigationTimeoutMs?: number;
}

export interface CaptureResult {
  status: number;
  buffer: Buffer;
}

export async function capture(opts: CaptureOptions): Promise<CaptureResult> {
  const page = await opts.context.newPage();
  try {
    const response = await page.goto(opts.url, {
      waitUntil: 'domcontentloaded',
      timeout: opts.navigationTimeoutMs ?? 30_000,
    });
    const status = response?.status() ?? 0;
    if (opts.beforeScreenshot) await opts.beforeScreenshot(page);
    await stabilizePage(page, opts.fullPageMaxHeight);
    await applyMasks(page, opts.mask);
    const buffer = await page.screenshot({
      fullPage: true,
      type: 'png',
      animations: 'disabled',
    });
    return { status, buffer };
  } finally {
    await page.close();
  }
}
```

- [ ] **Step 2: Create screenshot index**

```ts
// packages/core/src/screenshot/index.ts
export { launchBrowser, createContext } from './browser.js';
export { stabilizePage } from './wait.js';
export { applyMasks } from './mask.js';
export { capture } from './capture.js';
export { ScreenshotCache, hashStrings } from './cache.js';
```

Append to `packages/core/src/index.ts`:

```ts
export * from './screenshot/index.js';
```

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm --filter @visidiff/core typecheck
git add -A
git commit -m "feat(core): Playwright screenshot capture with stabilization + masking"
```

---

## Phase 6: Diff

### Task 15: Image padding helper

**Files:**
- Create: `packages/core/src/diff/pad.ts`
- Test: `packages/core/test/pad.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// packages/core/test/pad.test.ts
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { padToSameHeight } from '../src/diff/pad.js';

async function makePng(width: number, height: number, color = { r: 255, g: 0, b: 0, alpha: 1 }) {
  return sharp({
    create: { width, height, channels: 4, background: color },
  })
    .png()
    .toBuffer();
}

describe('padToSameHeight', () => {
  it('pads shorter image to match taller', async () => {
    const a = await makePng(100, 200);
    const b = await makePng(100, 300);
    const { a: aOut, b: bOut, paddedHeight } = await padToSameHeight(a, b);
    expect(paddedHeight).toBe(300);
    const aMeta = await sharp(aOut).metadata();
    const bMeta = await sharp(bOut).metadata();
    expect(aMeta.height).toBe(300);
    expect(bMeta.height).toBe(300);
  });

  it('returns untouched when heights equal', async () => {
    const a = await makePng(100, 200);
    const b = await makePng(100, 200);
    const { paddedHeight } = await padToSameHeight(a, b);
    expect(paddedHeight).toBe(200);
  });
});
```

- [ ] **Step 2: Implement**

```ts
// packages/core/src/diff/pad.ts
import sharp from 'sharp';

export interface PadResult {
  a: Buffer;
  b: Buffer;
  paddedHeight: number;
  heightDelta: number;
}

export async function padToSameHeight(a: Buffer, b: Buffer): Promise<PadResult> {
  const [metaA, metaB] = await Promise.all([sharp(a).metadata(), sharp(b).metadata()]);
  const hA = metaA.height ?? 0;
  const hB = metaB.height ?? 0;
  const target = Math.max(hA, hB);
  const width = Math.max(metaA.width ?? 0, metaB.width ?? 0);
  const aOut = hA < target ? await extend(a, width, target - hA) : await matchWidth(a, width);
  const bOut = hB < target ? await extend(b, width, target - hB) : await matchWidth(b, width);
  return { a: aOut, b: bOut, paddedHeight: target, heightDelta: hB - hA };
}

async function extend(buf: Buffer, width: number, extraHeight: number) {
  return sharp(buf)
    .extend({
      top: 0,
      bottom: extraHeight,
      left: 0,
      right: 0,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .resize({ width, fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toBuffer();
}

async function matchWidth(buf: Buffer, width: number) {
  return sharp(buf)
    .resize({ width, fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toBuffer();
}
```

- [ ] **Step 3: Run + commit**

```bash
pnpm test pad
git add -A
git commit -m "feat(core): pad screenshots to equal height for diffing"
```

---

### Task 16: Diff computation

**Files:**
- Create: `packages/core/src/diff/compute.ts`, `packages/core/src/diff/index.ts`
- Test: `packages/core/test/compute.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// packages/core/test/compute.test.ts
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { computeDiff } from '../src/diff/compute.js';

async function makePng(color: { r: number; g: number; b: number }) {
  return sharp({
    create: { width: 100, height: 100, channels: 4, background: { ...color, alpha: 1 } },
  })
    .png()
    .toBuffer();
}

describe('computeDiff', () => {
  it('reports ~0% for identical buffers', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'visi-diff-'));
    const img = await makePng({ r: 255, g: 0, b: 0 });
    const result = await computeDiff({
      a: img,
      b: img,
      diffPath: join(dir, 'diff.png'),
      threshold: 0.1,
    });
    expect(result.pixelDiffPercent).toBeLessThan(0.01);
  });

  it('reports ~100% for totally different buffers', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'visi-diff-'));
    const a = await makePng({ r: 255, g: 0, b: 0 });
    const b = await makePng({ r: 0, g: 255, b: 0 });
    const result = await computeDiff({
      a,
      b,
      diffPath: join(dir, 'diff.png'),
      threshold: 0.1,
    });
    expect(result.pixelDiffPercent).toBeGreaterThan(90);
    const diffFile = await readFile(join(dir, 'diff.png'));
    expect(diffFile.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Implement**

```ts
// packages/core/src/diff/compute.ts
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { compare } from 'odiff-bin';
import { padToSameHeight } from './pad.js';
import { writeTempPng } from './temp.js';

export interface ComputeDiffArgs {
  a: Buffer;
  b: Buffer;
  diffPath: string;
  threshold: number;
}

export interface ComputeDiffResult {
  pixelDiffPercent: number;
  heightDeltaPx: number;
  paddedHeight: number;
}

export async function computeDiff(args: ComputeDiffArgs): Promise<ComputeDiffResult> {
  const { a, b, paddedHeight, heightDelta } = await padToSameHeight(args.a, args.b);
  const aPath = await writeTempPng(a);
  const bPath = await writeTempPng(b);
  await mkdir(dirname(args.diffPath), { recursive: true });
  const result = await compare(aPath, bPath, args.diffPath, {
    threshold: args.threshold,
    antialiasing: true,
    outputDiffMask: false,
  });

  let diffPercent = 0;
  if (!result.match) {
    const diffPixels = (result as { diffCount?: number }).diffCount ?? 0;
    const total = paddedHeight * (await getWidth(a));
    diffPercent = total > 0 ? (diffPixels / total) * 100 : 0;
  }

  return { pixelDiffPercent: diffPercent, heightDeltaPx: heightDelta, paddedHeight };
}

async function getWidth(buf: Buffer): Promise<number> {
  const sharp = (await import('sharp')).default;
  return (await sharp(buf).metadata()).width ?? 0;
}
```

Helper for temp files:

```ts
// packages/core/src/diff/temp.ts
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

export async function writeTempPng(buf: Buffer): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'visidiff-'));
  const file = join(dir, `${randomBytes(8).toString('hex')}.png`);
  await writeFile(file, buf);
  return file;
}
```

Diff index:

```ts
// packages/core/src/diff/index.ts
export { computeDiff } from './compute.js';
export { padToSameHeight } from './pad.js';
```

Append to core index:

```ts
export * from './diff/index.js';
```

- [ ] **Step 3: Run tests + commit**

```bash
pnpm test compute
git add -A
git commit -m "feat(core): compute pixel diff with ODiff and height delta"
```

---

## Phase 7: Pipeline

### Task 17: Output storage

**Files:**
- Create: `packages/core/src/pipeline/storage.ts`
- Test: `packages/core/test/storage.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// packages/core/test/storage.test.ts
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OutputWriter } from '../src/pipeline/storage.js';
import type { ComparisonRecord } from '../src/types.js';

describe('OutputWriter', () => {
  it('writes data.json with comparisons and stats', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'visi-out-'));
    const writer = new OutputWriter(dir);
    await writer.init({ original: 'https://a/*', updated: 'https://b/*', viewports: [1440], threshold: 0.1 });
    const rec: ComparisonRecord = {
      url: {
        id: '1',
        originalUrl: 'https://a/',
        updatedUrl: 'https://b/',
        group: '/',
        originalStatus: 200,
        updatedStatus: 200,
      },
      viewports: [],
    };
    await writer.upsert(rec);
    await writer.finalize({ succeeded: 1, failed: 0, skipped: 0 });
    const data = JSON.parse(await readFile(join(dir, 'data.json'), 'utf8'));
    expect(data.comparisons).toHaveLength(1);
    expect(data.stats.succeeded).toBe(1);
  });

  it('upsert replaces record with same id', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'visi-out-'));
    const writer = new OutputWriter(dir);
    await writer.init({ original: 'x/*', updated: 'y/*', viewports: [1440], threshold: 0.1 });
    const base = {
      url: { id: '1', originalUrl: 'a', updatedUrl: 'b', group: '/', originalStatus: 200, updatedStatus: 200 },
      viewports: [],
    };
    await writer.upsert(base);
    await writer.upsert({ ...base, viewports: [{ viewport: 1440, originalPath: 'o', updatedPath: 'u', diffPath: null, pixelDiffPercent: 1.5, heightDeltaPx: 0, status: 'computed' }] });
    await writer.finalize({ succeeded: 1, failed: 0, skipped: 0 });
    const data = JSON.parse(await readFile(join(dir, 'data.json'), 'utf8'));
    expect(data.comparisons).toHaveLength(1);
    expect(data.comparisons[0].viewports).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Implement**

```ts
// packages/core/src/pipeline/storage.ts
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ComparisonRecord, RunData, VisidiffConfig } from '../types.js';

export interface OutputPaths {
  root: string;
  screenshots: string;
  dataJson: string;
}

export class OutputWriter {
  private data: RunData;

  constructor(public readonly root: string) {
    this.data = {
      version: 1,
      createdAt: new Date().toISOString(),
      config: { original: '', updated: '', viewports: [], threshold: 0 },
      comparisons: [],
      stats: { totalUrls: 0, succeeded: 0, failed: 0, skipped: 0 },
    };
  }

  paths(): OutputPaths {
    return {
      root: this.root,
      screenshots: join(this.root, 'screenshots'),
      dataJson: join(this.root, 'data.json'),
    };
  }

  async init(cfg: Pick<VisidiffConfig, 'original' | 'updated' | 'viewports' | 'threshold'>) {
    await mkdir(this.paths().screenshots, { recursive: true });
    this.data.config = cfg;
    await this.flush();
  }

  async upsert(rec: ComparisonRecord) {
    const idx = this.data.comparisons.findIndex((c) => c.url.id === rec.url.id);
    if (idx === -1) this.data.comparisons.push(rec);
    else this.data.comparisons[idx] = rec;
    await this.flush();
  }

  get(id: string): ComparisonRecord | undefined {
    return this.data.comparisons.find((c) => c.url.id === id);
  }

  async finalize(stats: Partial<RunData['stats']>) {
    this.data.stats = {
      ...this.data.stats,
      ...stats,
      totalUrls: this.data.comparisons.length,
    };
    await this.flush();
  }

  getData(): RunData {
    return this.data;
  }

  private async flush() {
    await writeFile(this.paths().dataJson, JSON.stringify(this.data, null, 2));
  }
}
```

- [ ] **Step 3: Run + commit**

```bash
pnpm test storage
git add -A
git commit -m "feat(core): output writer for data.json"
```

---

### Task 18: Pipeline orchestrator

**Files:**
- Create: `packages/core/src/pipeline/run.ts`, `packages/core/src/pipeline/index.ts`

- [ ] **Step 1: Implement**

```ts
// packages/core/src/pipeline/run.ts
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import PQueue from 'p-queue';
import type { Browser, BrowserContext } from 'playwright';
import { launchBrowser, createContext, capture, ScreenshotCache, hashStrings } from '../screenshot/index.js';
import { computeDiff } from '../diff/index.js';
import { discoverUrls } from '../crawler/index.js';
import { parsePattern, substitute } from '../url-pattern.js';
import { OutputWriter } from './storage.js';
import { logger } from '../logger.js';
import type { ComparisonRecord, UrlRecord, VisidiffConfig, ViewportDiff } from '../types.js';

export interface RunHooks {
  onUrlStart?: (url: UrlRecord) => void;
  onUrlDone?: (rec: ComparisonRecord) => void;
  onProgress?: (done: number, total: number) => void;
}

export interface RunResult {
  writer: OutputWriter;
  succeeded: number;
  failed: number;
  skipped: number;
}

export async function runPipeline(config: VisidiffConfig, hooks: RunHooks = {}): Promise<RunResult> {
  const original = parsePattern(config.original);
  const updated = parsePattern(config.updated);
  const origin = new URL(original.prefix).origin;

  const writer = new OutputWriter(config.outputDir);
  await writer.init({
    original: config.original,
    updated: config.updated,
    viewports: config.viewports,
    threshold: config.threshold,
  });

  const fetcher = (url: string) => fetch(url).then((r) => ({ ok: r.ok, status: r.status, text: () => r.text() }));
  const groups = await discoverUrls({
    origin,
    fetcher,
    maxDepth: config.maxDepth,
    maxPages: config.maxPages,
    exclude: config.exclude,
    ignoreRobots: config.ignoreRobots,
    samplesPerGroup: config.samplesPerGroup,
    samplingThreshold: config.samplingThreshold,
    seed: hashStrings([config.original, config.updated, ...config.viewports.map(String)]),
  });

  const records: UrlRecord[] = [];
  for (const group of groups) {
    for (const u of group.sampled) {
      const mapped = substitute(u, original, updated);
      if (!mapped) continue;
      const mappedOk = await checkUpdatedExists(mapped, config.updatedAuth);
      if (!mappedOk) continue;
      records.push({
        id: createHash('sha1').update(u).digest('hex').slice(0, 16),
        originalUrl: u,
        updatedUrl: mapped,
        group: group.pattern,
        originalStatus: null,
        updatedStatus: null,
      });
    }
  }

  const browser = await launchBrowser();
  const cache = new ScreenshotCache(join(config.cacheDir, 'originals'));
  const maskHash = hashStrings(config.mask);
  const hookHash = hashStrings([config.beforeScreenshot ?? '']);

  const queue = new PQueue({ concurrency: config.concurrency, interval: config.requestDelayMs, intervalCap: 1 });
  let done = 0;
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (const rec of records) {
    void queue.add(async () => {
      hooks.onUrlStart?.(rec);
      const viewportsResults: ViewportDiff[] = [];
      let allOk = true;
      for (const viewport of config.viewports) {
        try {
          const result = await processViewport(rec, viewport, browser, cache, writer, config, maskHash, hookHash);
          viewportsResults.push(result);
          if (result.status === 'failed') allOk = false;
        } catch (err) {
          allOk = false;
          viewportsResults.push({
            viewport,
            originalPath: '',
            updatedPath: '',
            diffPath: null,
            pixelDiffPercent: null,
            heightDeltaPx: null,
            status: 'failed',
            error: (err as Error).message,
          });
        }
      }
      const final: ComparisonRecord = { url: rec, viewports: viewportsResults };
      await writer.upsert(final);
      hooks.onUrlDone?.(final);
      done += 1;
      if (allOk) succeeded += 1;
      else failed += 1;
      hooks.onProgress?.(done, records.length);
    });
  }
  await queue.onIdle();
  await browser.close();

  await writer.finalize({ succeeded, failed, skipped });
  return { writer, succeeded, failed, skipped };
}

async function processViewport(
  rec: UrlRecord,
  viewport: number,
  browser: Browser,
  cache: ScreenshotCache,
  writer: OutputWriter,
  config: VisidiffConfig,
  maskHash: string,
  hookHash: string,
): Promise<ViewportDiff> {
  const paths = writer.paths();
  const origPath = join(paths.screenshots, `${rec.id}-${viewport}-original.png`);
  const updPath = join(paths.screenshots, `${rec.id}-${viewport}-updated.png`);
  const diffPath = join(paths.screenshots, `${rec.id}-${viewport}-diff.png`);

  const cachedOriginal = await cache.get({ url: rec.originalUrl, viewport, maskHash, hookHash });
  let originalBuffer: Buffer;
  let originalStatus = 200;
  if (cachedOriginal) {
    originalBuffer = cachedOriginal;
    await writeFile(origPath, originalBuffer);
  } else {
    const ctx = await createContext(browser, { viewport, auth: config.originalAuth });
    try {
      const r = await captureWithRetry(ctx, rec.originalUrl, config);
      originalBuffer = r.buffer;
      originalStatus = r.status;
      await writeFile(origPath, originalBuffer);
      await cache.set({ url: rec.originalUrl, viewport, maskHash, hookHash }, originalBuffer);
    } finally {
      await ctx.close();
    }
  }

  const ctxU = await createContext(browser, { viewport, auth: config.updatedAuth });
  let updatedBuffer: Buffer;
  let updatedStatus = 200;
  try {
    const r = await captureWithRetry(ctxU, rec.updatedUrl, config);
    updatedBuffer = r.buffer;
    updatedStatus = r.status;
    await writeFile(updPath, updatedBuffer);
  } finally {
    await ctxU.close();
  }

  rec.originalStatus = originalStatus;
  rec.updatedStatus = updatedStatus;

  const diffResult = await computeDiff({
    a: originalBuffer,
    b: updatedBuffer,
    diffPath,
    threshold: config.threshold,
  });

  return {
    viewport,
    originalPath: relative(origPath, paths.root),
    updatedPath: relative(updPath, paths.root),
    diffPath: relative(diffPath, paths.root),
    pixelDiffPercent: diffResult.pixelDiffPercent,
    heightDeltaPx: diffResult.heightDeltaPx,
    status: 'computed',
  };
}

function relative(p: string, root: string): string {
  return p.replace(root + '/', '').replace(root + '\\', '');
}

async function captureWithRetry(ctx: BrowserContext, url: string, config: VisidiffConfig) {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= config.retries; attempt++) {
    try {
      return await capture({
        url,
        context: ctx,
        mask: config.mask,
        fullPageMaxHeight: config.fullPageMaxHeight,
      });
    } catch (err) {
      lastErr = err as Error;
      logger.warn({ url, attempt, err: lastErr.message }, 'capture failed, retrying');
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
  throw lastErr;
}

async function checkUpdatedExists(url: string, auth: VisidiffConfig['updatedAuth']): Promise<boolean> {
  try {
    const headers: Record<string, string> = { ...(auth.headers ?? {}) };
    if (auth.basic) headers['Authorization'] = `Basic ${Buffer.from(auth.basic).toString('base64')}`;
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow', headers });
    return res.status !== 404;
  } catch {
    return false;
  }
}
```

Pipeline index:

```ts
// packages/core/src/pipeline/index.ts
export { runPipeline } from './run.js';
export { OutputWriter } from './storage.js';
```

Append to core index:

```ts
export * from './pipeline/index.js';
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm --filter @visidiff/core typecheck
git add -A
git commit -m "feat(core): end-to-end pipeline (discover → screenshot → diff → write)"
```

---

## Phase 8: CLI

### Task 19: CLI scaffold

**Files:**
- Create: `packages/cli/package.json`, `packages/cli/tsconfig.json`, `packages/cli/bin/visidiff.js`, `packages/cli/src/index.ts`

- [ ] **Step 1: Create `packages/cli/package.json`**

```json
{
  "name": "visidiff",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "bin": {
    "visidiff": "./bin/visidiff.js"
  },
  "files": ["dist", "bin", "src/templates"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@visidiff/core": "workspace:*",
    "commander": "^12.0.0",
    "listr2": "^8.2.0",
    "picocolors": "^1.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.12.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create `packages/cli/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Create `packages/cli/bin/visidiff.js`**

```js
#!/usr/bin/env node
import('../dist/index.js').then((m) => m.main(process.argv));
```

- [ ] **Step 4: Create `packages/cli/src/index.ts`**

```ts
import { Command } from 'commander';
import { registerInit } from './commands/init.js';
import { registerCompare } from './commands/compare.js';
import { registerRescreenshot } from './commands/rescreenshot.js';

export async function main(argv: string[]) {
  const program = new Command();
  program.name('visidiff').description('Visual regression between two URLs').version('0.0.0');
  registerInit(program);
  registerCompare(program);
  registerRescreenshot(program);
  await program.parseAsync(argv);
}
```

- [ ] **Step 5: Install + commit**

```bash
pnpm install
git add -A
git commit -m "feat(cli): scaffold CLI package with commander"
```

---

### Task 20: `init` command

**Files:**
- Create: `packages/cli/src/commands/init.ts`, `packages/cli/src/templates/config.template.ts`
- Test: `packages/cli/test/init.test.ts`

- [ ] **Step 1: Create config template**

```ts
// packages/cli/src/templates/config.template.ts
export const CONFIG_TEMPLATE = `import type { VisidiffConfig } from '@visidiff/core';

const config: Partial<VisidiffConfig> = {
  original: 'https://www.mysite.com/*',
  updated: 'https://staging.example.com/mysite/*',
  viewports: [1440, 390],
  maxPages: 200,
  exclude: ['/search', '/cart'],
  mask: ['.timestamp', '#chat-widget'],

  // Auth (uncomment & fill)
  // updatedAuth: {
  //   basic: process.env.STAGING_USER + ':' + process.env.STAGING_PASS,
  //   headers: { 'X-Staging-Token': process.env.STAGING_TOKEN ?? '' },
  //   cookiesFile: './staging-cookies.json',
  // },
};

export default config;
`;
```

- [ ] **Step 2: Write failing test**

```ts
// packages/cli/test/init.test.ts
import { access, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runInit } from '../src/commands/init.js';

describe('init command', () => {
  it('writes config file in target dir', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'visi-init-'));
    await runInit({ cwd: dir, force: false });
    const content = await readFile(join(dir, 'visidiff.config.ts'), 'utf8');
    expect(content).toContain('original');
    expect(content).toContain('https://www.mysite.com/*');
  });

  it('refuses to overwrite without --force', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'visi-init-'));
    await runInit({ cwd: dir, force: false });
    await expect(runInit({ cwd: dir, force: false })).rejects.toThrow(/exists/);
  });
});
```

- [ ] **Step 3: Implement**

```ts
// packages/cli/src/commands/init.ts
import { writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { Command } from 'commander';
import pc from 'picocolors';
import { CONFIG_TEMPLATE } from '../templates/config.template.js';

export interface InitOptions {
  cwd: string;
  force: boolean;
}

export async function runInit(opts: InitOptions) {
  const target = join(opts.cwd, 'visidiff.config.ts');
  if (!opts.force) {
    try {
      await access(target);
      throw new Error(`visidiff.config.ts already exists at ${target}. Use --force to overwrite.`);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
  await writeFile(target, CONFIG_TEMPLATE);
  console.log(pc.green(`✓ Wrote ${target}`));
}

export function registerInit(program: Command) {
  program
    .command('init')
    .description('Generate a visidiff.config.ts template in the current directory')
    .option('--force', 'Overwrite existing config', false)
    .action(async (opts) => {
      await runInit({ cwd: process.cwd(), force: opts.force });
    });
}
```

- [ ] **Step 4: Run tests + commit**

```bash
pnpm test init
git add -A
git commit -m "feat(cli): init command writes config template"
```

---

### Task 21: `compare` command

**Files:**
- Create: `packages/cli/src/commands/compare.ts`, `packages/cli/src/progress.ts`

- [ ] **Step 1: Implement progress helper**

```ts
// packages/cli/src/progress.ts
import { Listr } from 'listr2';

export function createProgress(total: number) {
  const state = { done: 0, total };
  const tasks = new Listr(
    [
      {
        title: `Comparing 0/${total}`,
        task: (_, task) => {
          return new Promise<void>((resolve) => {
            const timer = setInterval(() => {
              task.title = `Comparing ${state.done}/${state.total}`;
              if (state.done >= state.total) {
                clearInterval(timer);
                resolve();
              }
            }, 150);
          });
        },
      },
    ],
    { rendererOptions: { showSubtasks: true } },
  );
  return {
    start: () => tasks.run(),
    tick: (done: number) => {
      state.done = done;
    },
  };
}
```

- [ ] **Step 2: Implement compare command**

```ts
// packages/cli/src/commands/compare.ts
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { Command } from 'commander';
import pc from 'picocolors';
import { loadConfigFromFile, validateConfig, runPipeline, type VisidiffConfig } from '@visidiff/core';
import { createProgress } from '../progress.js';

export interface CompareCliOptions {
  config: string;
  original?: string;
  updated?: string;
  outputDir?: string;
  maxPages?: string;
  concurrency?: string;
  ignoreRobots?: boolean;
  noCache?: boolean;
  refreshOriginal?: boolean;
  runId?: string;
}

export async function runCompare(opts: CompareCliOptions) {
  const configPath = resolve(process.cwd(), opts.config);
  let config: VisidiffConfig;
  if (existsSync(configPath)) {
    config = await loadConfigFromFile(configPath);
  } else if (opts.original && opts.updated) {
    config = validateConfig({ original: opts.original, updated: opts.updated });
  } else {
    throw new Error(`No config at ${configPath} and --original/--updated not provided`);
  }

  if (opts.original) config.original = opts.original;
  if (opts.updated) config.updated = opts.updated;
  if (opts.outputDir) config.outputDir = opts.outputDir;
  if (opts.maxPages) config.maxPages = parseInt(opts.maxPages, 10);
  if (opts.concurrency) config.concurrency = parseInt(opts.concurrency, 10);
  if (opts.ignoreRobots) config.ignoreRobots = true;
  if (opts.runId) config.runId = opts.runId;

  console.log(pc.bold(`visidiff compare`));
  console.log(`  original: ${pc.cyan(config.original)}`);
  console.log(`  updated:  ${pc.cyan(config.updated)}`);
  console.log(`  output:   ${pc.cyan(config.outputDir)}\n`);

  let total = 0;
  const progress = createProgress(0);
  const runPromise = runPipeline(config, {
    onProgress: (done, t) => {
      total = t;
      progress.tick(done);
    },
  });
  void progress.start();
  const result = await runPromise;

  console.log(
    pc.green(`\n✓ ${result.succeeded} succeeded`) +
      `  ${pc.red(result.failed + ' failed')}` +
      `  ${pc.yellow(result.skipped + ' skipped')}`,
  );
  console.log(`Output written to ${pc.cyan(config.outputDir)}`);
}

export function registerCompare(program: Command) {
  program
    .command('compare')
    .description('Crawl + screenshot + diff two URLs')
    .option('-c, --config <path>', 'Path to config file', 'visidiff.config.ts')
    .option('--original <pattern>', 'Original URL pattern')
    .option('--updated <pattern>', 'Updated URL pattern')
    .option('--output-dir <dir>', 'Output directory')
    .option('--max-pages <n>', 'Maximum pages to compare')
    .option('--concurrency <n>', 'Parallel workers')
    .option('--ignore-robots', 'Ignore robots.txt')
    .option('--no-cache', 'Disable original screenshot cache')
    .option('--refresh-original', 'Invalidate original screenshot cache')
    .option('--run-id <id>', 'Named run for parallel output dirs')
    .action(async (opts: CompareCliOptions) => {
      await runCompare(opts);
    });
}
```

- [ ] **Step 3: Ctrl+C handler — delete partial output**

Append to `packages/cli/src/commands/compare.ts` at the top of `runCompare`:

```ts
const { rm } = await import('node:fs/promises');
const cleanup = async () => {
  try {
    await rm(config.outputDir, { recursive: true, force: true });
    console.log(pc.yellow('\nInterrupted — partial output deleted.'));
  } finally {
    process.exit(130);
  }
};
process.once('SIGINT', cleanup);
process.once('SIGTERM', cleanup);
```

Move this block AFTER `config` is resolved so `config.outputDir` is defined.

- [ ] **Step 4: Typecheck + commit**

```bash
pnpm --filter visidiff typecheck
git add -A
git commit -m "feat(cli): compare command with progress and Ctrl+C cleanup"
```

---

### Task 22: `rescreenshot` command

**Files:**
- Create: `packages/cli/src/commands/rescreenshot.ts`

- [ ] **Step 1: Implement**

```ts
// packages/cli/src/commands/rescreenshot.ts
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Command } from 'commander';
import picomatch from 'picomatch';
import pc from 'picocolors';
import {
  loadConfigFromFile,
  launchBrowser,
  createContext,
  capture,
  computeDiff,
  OutputWriter,
  type RunData,
} from '@visidiff/core';

export interface RescreenshotCliOptions {
  config: string;
  url: string;
  alsoOriginal?: boolean;
}

export async function runRescreenshot(opts: RescreenshotCliOptions) {
  const config = await loadConfigFromFile(opts.config);
  const data: RunData = JSON.parse(await readFile(join(config.outputDir, 'data.json'), 'utf8'));
  const matcher = picomatch(opts.url);
  const targets = data.comparisons.filter((c) => matcher(c.url.originalUrl));
  if (targets.length === 0) {
    console.log(pc.yellow(`No URLs match ${opts.url}`));
    return;
  }
  console.log(`Re-screenshotting ${targets.length} URL(s)...`);

  const browser = await launchBrowser();
  try {
    for (const rec of targets) {
      for (const vp of rec.viewports) {
        const ctx = await createContext(browser, {
          viewport: vp.viewport,
          auth: opts.alsoOriginal ? config.originalAuth : config.updatedAuth,
        });
        try {
          const target = opts.alsoOriginal ? rec.url.originalUrl : rec.url.updatedUrl;
          const r = await capture({
            url: target,
            context: ctx,
            mask: config.mask,
            fullPageMaxHeight: config.fullPageMaxHeight,
          });
          const paths = new OutputWriter(config.outputDir).paths();
          const outName = opts.alsoOriginal
            ? join(paths.screenshots, `${rec.url.id}-${vp.viewport}-original.png`)
            : join(paths.screenshots, `${rec.url.id}-${vp.viewport}-updated.png`);
          await writeFile(outName, r.buffer);

          const orig = await readFile(join(config.outputDir, vp.originalPath));
          const upd = await readFile(join(config.outputDir, vp.updatedPath));
          const diff = await computeDiff({
            a: orig,
            b: upd,
            diffPath: join(config.outputDir, vp.diffPath ?? `screenshots/${rec.url.id}-${vp.viewport}-diff.png`),
            threshold: config.threshold,
          });
          vp.pixelDiffPercent = diff.pixelDiffPercent;
          vp.heightDeltaPx = diff.heightDeltaPx;
          vp.status = 'computed';
        } finally {
          await ctx.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
  await writeFile(join(config.outputDir, 'data.json'), JSON.stringify(data, null, 2));
  console.log(pc.green(`✓ Done`));
}

export function registerRescreenshot(program: Command) {
  program
    .command('rescreenshot')
    .description('Re-run screenshot + diff for matching URLs')
    .option('-c, --config <path>', 'Path to config file', 'visidiff.config.ts')
    .requiredOption('--url <pattern>', 'URL glob pattern (e.g. "/blog/*")')
    .option('--also-original', 'Re-screenshot the original too', false)
    .action(async (opts) => {
      await runRescreenshot(opts);
    });
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm --filter visidiff typecheck
git add -A
git commit -m "feat(cli): rescreenshot command for ad-hoc reruns"
```

---

## Phase 9: End-to-End Validation

### Task 23: Smoke test

**Files:**
- Create: `packages/cli/test/fixtures/origin/index.html`, `packages/cli/test/fixtures/origin/about.html`, `packages/cli/test/fixtures/updated/index.html`, `packages/cli/test/fixtures/updated/about.html`, `packages/cli/test/compare.integration.test.ts`

- [ ] **Step 1: Create HTML fixtures**

`origin/index.html`:
```html
<!doctype html><html><head><title>Home</title></head><body style="margin:0;background:red"><h1>Home</h1><a href="/about.html">About</a></body></html>
```

`origin/about.html`:
```html
<!doctype html><html><head><title>About</title></head><body style="margin:0;background:red"><h1>About</h1></body></html>
```

`updated/index.html` (same as origin):
```html
<!doctype html><html><head><title>Home</title></head><body style="margin:0;background:red"><h1>Home</h1><a href="/about.html">About</a></body></html>
```

`updated/about.html` (different background — should trigger diff):
```html
<!doctype html><html><head><title>About</title></head><body style="margin:0;background:blue"><h1>About</h1></body></html>
```

- [ ] **Step 2: Write integration test**

```ts
// packages/cli/test/compare.integration.test.ts
import { mkdtemp, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReadStream, statSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runCompare } from '../src/commands/compare.js';

const here = dirname(fileURLToPath(import.meta.url));

function startStatic(root: string, port: number) {
  return new Promise<() => Promise<void>>((resolve) => {
    const server = createServer((req, res) => {
      let p = req.url === '/' ? '/index.html' : req.url ?? '/index.html';
      try {
        const full = join(root, p);
        statSync(full);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        createReadStream(full).pipe(res);
      } catch {
        res.writeHead(404).end();
      }
    });
    server.listen(port, () => {
      resolve(() => new Promise((r) => server.close(() => r())));
    });
  });
}

describe('compare integration', () => {
  let stopA: () => Promise<void>;
  let stopB: () => Promise<void>;

  beforeAll(async () => {
    stopA = await startStatic(join(here, 'fixtures', 'origin'), 18801);
    stopB = await startStatic(join(here, 'fixtures', 'updated'), 18802);
  });

  afterAll(async () => {
    await stopA();
    await stopB();
  });

  it('detects diff between two sites', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'visi-smoke-'));
    await runCompare({
      config: 'nonexistent.ts',
      original: 'http://localhost:18801/*',
      updated: 'http://localhost:18802/*',
      outputDir,
      maxPages: '5',
      concurrency: '2',
      ignoreRobots: true,
    });
    const data = JSON.parse(await readFile(join(outputDir, 'data.json'), 'utf8'));
    expect(data.comparisons.length).toBeGreaterThan(0);
    const aboutRec = data.comparisons.find((c: any) => c.url.originalUrl.includes('about'));
    expect(aboutRec).toBeDefined();
    expect(aboutRec.viewports[0].pixelDiffPercent).toBeGreaterThan(1);
  }, 120_000);
});
```

- [ ] **Step 3: Run smoke test**

```bash
pnpm test compare.integration
```

Expected: Pipeline runs, finds diff in `/about.html`, writes `data.json`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test(cli): end-to-end smoke test for compare"
```

---

### Task 24: Final polish

- [ ] **Step 1: Add `README.md`**

```markdown
# visidiff

Visual regression between two URLs — designed for verifying CSS changes on staging.

## Usage

\`\`\`bash
npx visidiff init
# edit visidiff.config.ts
npx visidiff compare
\`\`\`

Output is written to `./visidiff-output/data.json` + screenshots. Use the visidiff report UI (separate package) to browse results.
\`\`\`

- [ ] **Step 2: Full test suite**

```bash
pnpm test
pnpm --recursive typecheck
pnpm lint
```

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "docs: add README"
```

---

## Summary

After this plan:
- `npx visidiff init` generates a config
- `npx visidiff compare` crawls, samples, screenshots, diffs, writes output
- `npx visidiff rescreenshot --url "/blog/*"` re-runs a subset
- Full test coverage on pure-logic modules (URL patterns, sampling, robots, sitemap, crawler, config, padding, diff, storage)
- Integration smoke test proves the full pipeline works end-to-end

**Next:** plan 2 (`visidiff-report-ui`) reads `data.json` and builds the interactive UI.
