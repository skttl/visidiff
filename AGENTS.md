# AGENTS.md

## Project

VisiDiff is a Nuxt-based visual regression utility that compares two URLs across multiple viewport widths using Playwright screenshots and pixel diffs.

## Core stack

- Nuxt 4
- Nitro server routes
- Vue 3
- Playwright
- pixelmatch
- pngjs
- Tailwind CSS

## Common commands

```bash
npm install
npx playwright install chromium
npm run dev
npm run build
npm run preview
npm link
visidiff
```

## Local app URL

- App host: `visidiff.localhost`
- App port: `3000`
- Base URL: `http://visidiff.localhost:3000/`

## CLI behavior

The local CLI entrypoint is `bin/visidiff.mjs` and is exposed as `visidiff` via the package `bin` field.

Expected behavior:

- If the app is already reachable at `http://visidiff.localhost:3000/`, open the browser only.
- Otherwise, start the Nuxt dev server from the repo root, wait for readiness, then open the browser.

## Docker

The Dockerfile uses multi-stage builds with three named stages:

- `base` — installs `node_modules` and Playwright/Chromium
- `dev` — runs `npm run dev`; source is mounted via volume at `/app`
- `prod` — copies source, builds with `npm run build`, runs the production server

`docker-compose.yml` targets the `prod` stage (no volume mount for source).
`docker-compose.override.yml` overrides to the `dev` stage and mounts the local working directory, enabling hot-reload without rebuilding. Docker Compose merges the override automatically on `docker compose up`.

Rebuild the dev image only when `package.json` or `package-lock.json` changes:

```bash
docker compose build
```

Run production without the override:

```bash
docker compose -f docker-compose.yml up --build
```

## Important files

- `pages/index.vue` - main UI, SSE handling, title/favicons/notifications, per-page re-run
- `components/JobForm.vue` - run form and saved settings history
- `components/ProgressLog.vue` - streamed job event log
- `components/ViewportResult.vue` - diff result viewer
- `server/api/run.post.ts` - job creation endpoint (used for full runs and per-page re-runs)
- `server/api/events/[id].get.ts` - SSE event stream
- `server/utils/runner.ts` - orchestrates capture + diff pipeline
- `server/utils/capture.ts` - Playwright capture logic
- `server/utils/diff.ts` - image diffing logic
- `server/utils/jobs.ts` - in-memory job state/event registry
- `bin/visidiff.mjs` - CLI launcher
- `Dockerfile` - multi-stage build (base / dev / prod)
- `docker-compose.yml` - production compose (prod stage, no source mount)
- `docker-compose.override.yml` - dev compose override (dev stage, source volume mount)

## Per-page re-run (sitemap mode)

Each row in the sitemap results table has a Re-run button. It posts a `mode: 'direct'` job to `/api/run` with the same `viewports` and `blockedGlobs` as the original run, opens the SSE stream for that job, and replaces only that page's results in `results` when `viewport-done` events arrive. The `pagePath` from the original sitemap group is preserved on each incoming result so the UI stays consistent.

Key state refs involved:
- `rerunningPages` — `Set<string>` of `pagePath` values currently being re-run (drives spinner + disabled state)
- `submittedViewports` — viewports from the original run, reused for re-runs
- `submittedBlockedGlobs` — blocked globs from the original run, reused for re-runs

## Working conventions

- Keep changes minimal and task-focused.
- Prefer updating existing files over introducing new abstractions unless needed.
- Do not add comments unless explicitly requested.
- Preserve the current host/port and CLI contract unless the task asks to change them.
- Always update `README.md` whenever any user-facing behavior, defaults, or features change.
- If launcher behavior changes, update `README.md` too.
- If Docker workflow changes, update both `README.md` and `AGENTS.md`.
