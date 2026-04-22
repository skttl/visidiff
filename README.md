# visidiff

Visual regression testing tool for comparing screenshots between two environments.

## Features

- **URL Discovery**: Automatically discovers URLs from sitemaps, robots.txt, and web crawling
- **Smart Sampling**: Deterministic URL sampling with pattern grouping
- **Screenshot Capture**: Playwright-based screenshot capture with masking support
- **Diff Computation**: Pixel-level diff computation using odiff
- **Interactive Report UI**: Built-in web interface for reviewing screenshot differences
- **CLI**: Easy-to-use command-line interface

## Installation

```bash
pnpm install
```

## Usage

Run the CLI in the folder where you want to work:

```bash
npx visidiff
```

This opens an interactive TUI that lets you:

- create a new config
- pick an existing config
- review the config settings before running a comparison

When you run a comparison, visidiff always captures fresh screenshots.

See the [Configuration](#configuration) section below for all available options.

## Configuration

Config files must be named `*.visidiff.config.ts` or `*.visidiff.config.js`.

```bash
marketing-site.visidiff.config.ts
```

Plain `visidiff.config.ts` or `visidiff.config.js` is **not** picked up by the TUI.

### URL Patterns

`original` and `updated` are URL patterns with exactly one `*` wildcard. The wildcard is replaced with discovered page paths.

```js
export default {
  original: "https://example.com/*",
  updated: "https://staging.example.com/*",
};
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `original` | `string` | — | Original environment URL pattern with one `*` |
| `updated` | `string` | — | Updated environment URL pattern with one `*` |
| `viewports` | `number[]` | `[1440, 390]` | Viewport widths to capture in pixels |
| `maxDepth` | `number` | `3` | Maximum crawl depth when discovering URLs |
| `maxPages` | `number` | `200` | Maximum number of pages to discover |
| `exclude` | `string[]` | `[]` | URL path patterns to exclude (picomatch globs) |
| `blockedRequestUrls` | `string[]` | `[]` | Request URL patterns to block during capture |
| `samplesPerGroup` | `number` | `2` | Number of URLs sampled per URL pattern group |
| `samplingThreshold` | `number` | `5` | Minimum group size before sampling kicks in |
| `fullPageMaxHeight` | `number` | `10000` | Maximum scroll height for full-page screenshots |
| `concurrency` | `number` | `4` | Number of parallel screenshot captures |
| `requestDelayMs` | `number` | `0` | Delay between requests in milliseconds |
| `retries` | `number` | `2` | Number of retries on capture failure |
| `ignoreRobots` | `boolean` | `false` | Ignore robots.txt restrictions |
| `threshold` | `number` | `0.1` | Diff threshold (0–1); values below this are ignored |
| `mask` | `string[]` | `[]` | CSS selectors for elements to mask before diffing |
| `originalAuth` | `AuthConfig` | `{}` | Authentication for the original environment |
| `updatedAuth` | `AuthConfig` | `{}` | Authentication for the updated environment |
| `beforeScreenshot` | `string` | `undefined` | Path to a JS module exporting a `beforeScreenshot` hook |
| `runId` | `string` | `undefined` | Custom run identifier |

### URL Discovery

visidiff discovers URLs in three steps:

1. **Sitemap** — It first fetches the sitemap at the `original` origin (e.g. `https://example.com/sitemap.xml`).
2. **Crawl fallback** — If the sitemap is empty or missing, it crawls the site starting from the origin URL. The crawler performs a breadth-first search, following links (`<a href>`) on each page.
3. **Filtering** — All discovered URLs are filtered through:
   - `robots.txt` allow rules (unless `ignoreRobots: true`)
   - `exclude` globs matching the URL pathname
   - Same-origin restriction (cross-origin links are ignored)
   - HTML-only pages (non-HTML responses are skipped)
   - `maxPages` hard cap (the total URL list is sliced to this limit)

**`maxDepth`** controls how many link hops the crawler follows from the starting URL. A depth of `0` means only the origin page. A depth of `3` follows links up to three levels deep. This only applies when a crawl is performed; sitemaps are not affected by `maxDepth`.

**`maxPages`** is the upper bound on total URLs, whether from sitemap or crawl. If the sitemap returns 500 URLs and `maxPages` is `200`, only the first 200 are kept.

### Smart Sampling

Once URLs are collected, visidiff groups them by URL pattern and samples from each group. This avoids redundant screenshot comparisons on pages that share the same layout (e.g. hundreds of blog posts under `/blog/*`).

**How it works:**

1. URLs are tokenized by their path segments (`/blog/hello-world` → `['blog', 'hello-world']`).
2. The tool builds a prefix tree. At each path position, if there are `>= samplingThreshold` unique segment values, that position is treated as a wildcard (`[*]`).
3. This creates URL pattern groups like `/blog/[*]`, `/products/[*]`, `/about`.

**`samplingThreshold`** — Minimum number of unique values at a path position before it becomes a wildcard. With a threshold of `5`, `/blog/post-1` through `/blog/post-4` stay as individual URLs, but once you have 5+ posts the group becomes `/blog/[*]`.

**`samplesPerGroup`** — For pattern groups (those with `[*]`), this limits how many URLs are actually captured. The first URL in the group is always kept, then the rest are selected deterministically using a hash seeded by the `runId`. Groups smaller than `samplesPerGroup` keep all URLs.

For example, with `samplingThreshold: 5` and `samplesPerGroup: 2`, a blog with 100 posts under `/blog/*` will only capture the first post plus one deterministically selected other post.

### Diff Computation

After screenshots are captured for both environments, visidiff compares each pair pixel by pixel using [odiff](https://github.com/dmtrKovalenko/odiff), a fast pixel-level image diff tool.

**How it works:**

1. Screenshots are padded to the same height so page-length differences do not break alignment.
2. odiff compares the two images at a **0% color tolerance** (pixel-perfect).
3. The resulting diff percentage (e.g. `3.42%`) is compared against your `threshold` setting.
4. If the diff percentage is **below** `threshold * 100`, the comparison is skipped and marked as "no diff" in the report. No diff image is generated.
5. If the diff percentage is **at or above** the threshold, a diff image is generated and the exact percentage is shown in the report.

**`threshold`** is a value between `0` and `1` (default `0.1`, i.e. 10%). It acts as a noise filter. Small rendering differences from fonts, sub-pixel rounding, or anti-aliasing often produce tiny diff percentages. Raising the threshold hides these from the report so you only see meaningful changes.

- `threshold: 0` — every pixel difference is reported (no filtering)
- `threshold: 0.05` — hides differences under 5%
- `threshold: 0.1` — hides differences under 10% (default)

### Authentication

Both `originalAuth` and `updatedAuth` accept the same shape:

```js
export default {
  originalAuth: {
    basic: "user:pass",           // HTTP Basic auth
    headers: { "X-Token": "abc" }, // Custom headers
    cookiesFile: "./cookies.json", // Playwright cookies JSON
  },
};
```

### beforeScreenshot Hook

Provide a JS module path to run custom code before each screenshot is taken. The module must export a `beforeScreenshot` function:

```js
// hooks/wait-for-images.js
export async function beforeScreenshot(page) {
  await page.waitForSelector("img[loading='lazy']");
}
```

Then reference it in your config:

```js
export default {
  beforeScreenshot: "./hooks/wait-for-images.js",
};
```

The hook is executed three times during capture: after navigation, after page stability, and after injecting masks.

### Example Config

```js
export default {
  original: "https://www.example.com/*",
  updated: "https://staging.example.com/*",
  viewports: [1440, 390],
  maxDepth: 3,
  maxPages: 200,
  exclude: ["/admin/**", "/api/**"],
  blockedRequestUrls: ["https://analytics.example.com/*"],
  samplesPerGroup: 2,
  samplingThreshold: 5,
  fullPageMaxHeight: 10000,
  concurrency: 4,
  requestDelayMs: 0,
  retries: 2,
  ignoreRobots: false,
  threshold: 0.1,
  mask: [".cookie-banner", "#live-chat"],
  originalAuth: {},
  updatedAuth: {},
};
```

## Interactive Report UI

When you run a comparison from the TUI, the tool automatically starts a local web server and opens your browser to an interactive report UI. The UI provides:

- **Results Table**: Filterable and sortable list of compared URLs with diff percentages
- **Side-by-Side View**: Compare original and updated screenshots side by side with synced scrolling
- **Overlay Slider**: Blend between original and updated images with keyboard controls (←/→ for 10% steps, 0-9 for exact values)
- **Diff Image View**: View pixel-level differences highlighted
- **Viewport Tabs**: Switch between different viewport sizes (desktop, tablet, mobile)

## Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Build core package
pnpm --filter @visidiff/core build

# Typecheck
pnpm --filter @visidiff/core typecheck
pnpm --filter @visidiff/cli typecheck
```

## License

MIT
