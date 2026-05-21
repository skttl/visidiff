# VisiDiff

Visual URL diff tool. Enter two direct URLs or switch to sitemap mode with two hosts, pick viewport widths and request-blocking globs, and VisiDiff will:

1. Open both URLs in headless Chromium (Playwright)
2. Or discover matching paths from host A using `robots.txt` sitemap discovery, `/sitemap.xml` fallback, and a fast HTML crawl fallback
3. Block matching requests (cookie popups etc.) using glob patterns
4. Auto-scroll to trigger lazy-loaded images
5. Take full-page screenshots
6. Pixel-diff them and report % difference per viewport
7. Stream progress live over Server-Sent Events
8. Group results by page and show side-by-side, overlay-slider and diff views

## Local development

```bash
npm install
npx playwright install chromium
npm run dev
```

Open `http://visidiff.localhost:3000/`

## Run from any terminal

To register a global `visidiff` command on your machine:

```bash
npm link
```

Then launch it from any folder:

```bash
visidiff
```

Behavior:

- If VisiDiff is already running on `http://visidiff.localhost:3000/`, it just opens the browser.
- If it is not running, it starts the Nuxt dev server from the repo root, waits for it to be ready, and then opens the browser.

You can also start it manually from the project root with:

```bash
npm run dev
```

## Docker

### Development (hot-reload)

```bash
docker compose up
```

Docker Compose automatically merges `docker-compose.override.yml`, which mounts your local source into the container and runs `npm run dev`. File changes are reflected immediately without rebuilding the image.

Rebuild the dev image only when `package.json` or `package-lock.json` changes:

```bash
docker compose build
docker compose up
```

### Production (built image)

```bash
docker compose -f docker-compose.yml up --build
```

This uses the `prod` stage, which copies sources into the image and runs `npm run build`. The built output is baked into the image; no volume mount is used for source files. Screenshots are persisted in a named `runs` volume.

### Build image for Docker Desktop

To build a standalone production image and run it manually (e.g. from Docker Desktop):

```bash
docker build --target prod -t visidiff:latest .
```

The image is then available in Docker Desktop under **Images → visidiff:latest**.

When running the container, expose port `3000` and set the `HOST` environment variable so the app binds to all interfaces:

- **Port**: `3000` (container) → any host port you choose, e.g. `3000`
- **Environment variable**: `HOST=0.0.0.0`

Or via CLI:

```bash
docker run -p 3000:3000 -e HOST=0.0.0.0 visidiff:latest
```

Then open `http://localhost:3000/` in your browser.

### How the Dockerfile is structured

The Dockerfile uses multi-stage builds:

- **`base`** — installs `node_modules` and Playwright/Chromium (shared by both stages)
- **`dev`** — starts `npm run dev`; expects source to be mounted at `/app` via a volume
- **`prod`** — copies source, builds the app, starts the production server

## Defaults

- Viewports: `375, 768, 1440`
- Blocked URL globs: `**/*cookie*`, `**/*consent*`, `**/*onetrust*`, `**/*cookiebot*`, `https://policy.app.cookieinformation.com/*`
- Sitemap crawl limits: `25 pages`, `depth 2`, `15000ms timeout`

## Sitemap mode

In sitemap mode, VisiDiff compares two hosts by:

1. Treating host A as the source of truth
2. Discovering URLs from `robots.txt` sitemap entries
3. Falling back to `/sitemap.xml` when robots does not declare sitemaps
4. Falling back again to a fast same-host HTML crawl if sitemap discovery yields no pages
5. Matching pages by pathname only and ignoring query strings
6. Rebuilding the same pathname on host B for comparison

You can configure crawl limits in the UI:

- Max pages per host
- Max crawl depth
- Crawl timeout in milliseconds

Each result row has a **Re-run** button that re-captures and re-diffs just that page using the same viewports and blocked globs as the original run, without restarting the whole job.

## Notes

- Generated screenshots live in `public/runs/<jobId>/` and are pruned after 24h.
- One job at a time per browser; pages and viewports are captured sequentially.
