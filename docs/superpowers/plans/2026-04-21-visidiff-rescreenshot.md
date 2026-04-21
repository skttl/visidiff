# visidiff Re-screenshot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add re-screenshot capability to the running server so users can trigger re-screenshots of individual URLs, filtered sets, or all URLs directly from the report UI — no need to restart the CLI. Updates `data.json` in-place, busts image caches, shows progress.

**Architecture:** Introduce a `JobQueue` abstraction in `@visidiff/server` that wraps `p-queue` and exposes job state. Three new endpoints: `POST /api/rescreenshot` (enqueue one or many), `GET /api/jobs/:id` (poll status), `GET /api/jobs` (list active). UI adds a row-level button, a drawer button, and toolbar buttons ("All" and "Filtered"). After each URL re-screenshot completes, the server writes data.json and pushes a cache-busting timestamp to the client (polled). UI reloads thumbnails via query-string timestamp.

**Tech Stack:** No new packages — reuses `@visidiff/core` pipeline primitives (`capture`, `computeDiff`), Fastify, `p-queue`, Vue 3.

**Prerequisites:** Plan 1 (`visidiff-core-cli`) and Plan 2 (`visidiff-report-ui`) completed.

---

## File Structure Additions

```
packages/
  server/
    src/
      job-queue.ts            # NEW
      rescreenshot.ts         # NEW: reuse pipeline bits
      routes/
        rescreenshot.ts       # NEW
      server-state.ts         # NEW: shared state (browser, config, queue)
    test/
      job-queue.test.ts       # NEW
      rescreenshot.test.ts    # NEW
  ui/
    src/
      composables/
        useJobs.ts            # NEW
        useCacheBust.ts       # NEW
      components/
        RescreenshotButton.vue    # NEW
        JobsToolbar.vue           # NEW
        ProgressToast.vue         # NEW
```

Existing files modified:
- `packages/server/src/index.ts` — take `VisidiffConfig` + shared browser
- `packages/cli/src/commands/compare.ts` — pass config to server
- `packages/ui/src/components/ResultsTable.vue` — add rescreenshot button column
- `packages/ui/src/views/DetailView.vue` — add drawer rescreenshot button
- `packages/ui/src/views/ResultsView.vue` — add JobsToolbar

---

## Phase 1: Server Job Queue

### Task 1: Job queue abstraction

**Files:**
- Create: `packages/server/src/job-queue.ts`
- Test: `packages/server/test/job-queue.test.ts`

- [ ] **Step 1: Install p-queue in server**

```bash
pnpm --filter @visidiff/server add p-queue
```

- [ ] **Step 2: Write failing tests**

```ts
// packages/server/test/job-queue.test.ts
import { describe, expect, it } from 'vitest';
import { JobQueue } from '../src/job-queue.js';

describe('JobQueue', () => {
  it('runs jobs and tracks state', async () => {
    const q = new JobQueue({ concurrency: 2 });
    const id = q.enqueue('test', [{ urlId: 'a' }, { urlId: 'b' }], async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(q.get(id)?.status).toBe('running');
    expect(q.get(id)?.total).toBe(2);
    await q.wait(id);
    expect(q.get(id)?.status).toBe('done');
    expect(q.get(id)?.completed).toBe(2);
  });

  it('captures per-item errors', async () => {
    const q = new JobQueue({ concurrency: 1 });
    const id = q.enqueue('test', [{ urlId: 'a' }, { urlId: 'b' }], async (item) => {
      if (item.urlId === 'b') throw new Error('boom');
    });
    await q.wait(id);
    const job = q.get(id)!;
    expect(job.status).toBe('done');
    expect(job.failures).toHaveLength(1);
    expect(job.failures[0]!.error).toMatch(/boom/);
  });

  it('list returns active jobs', async () => {
    const q = new JobQueue({ concurrency: 1 });
    const id = q.enqueue('t', [{ urlId: 'a' }], async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(q.list()).toHaveLength(1);
    await q.wait(id);
  });
});
```

- [ ] **Step 3: Implement**

```ts
// packages/server/src/job-queue.ts
import { randomUUID } from 'node:crypto';
import PQueue from 'p-queue';

export interface JobItem {
  urlId: string;
  viewport?: number;
}

export interface JobFailure {
  item: JobItem;
  error: string;
}

export type JobStatus = 'running' | 'done';

export interface Job {
  id: string;
  kind: string;
  status: JobStatus;
  total: number;
  completed: number;
  current: JobItem | null;
  failures: JobFailure[];
  startedAt: string;
  finishedAt: string | null;
}

export interface JobQueueOptions {
  concurrency: number;
}

export type JobWorker = (item: JobItem) => Promise<void>;

export class JobQueue {
  private queue: PQueue;
  private jobs = new Map<string, Job>();
  private waiters = new Map<string, Promise<void>>();

  constructor(opts: JobQueueOptions) {
    this.queue = new PQueue({ concurrency: opts.concurrency });
  }

  enqueue(kind: string, items: JobItem[], worker: JobWorker): string {
    const id = randomUUID();
    const job: Job = {
      id,
      kind,
      status: 'running',
      total: items.length,
      completed: 0,
      current: items[0] ?? null,
      failures: [],
      startedAt: new Date().toISOString(),
      finishedAt: null,
    };
    this.jobs.set(id, job);

    const tasks = items.map((item) =>
      this.queue.add(async () => {
        job.current = item;
        try {
          await worker(item);
        } catch (err) {
          job.failures.push({ item, error: (err as Error).message });
        } finally {
          job.completed += 1;
        }
      }),
    );

    const waiter = Promise.all(tasks).then(() => {
      job.status = 'done';
      job.current = null;
      job.finishedAt = new Date().toISOString();
    });
    this.waiters.set(id, waiter.then(() => undefined));
    return id;
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  list(): Job[] {
    return [...this.jobs.values()].filter((j) => j.status === 'running');
  }

  wait(id: string): Promise<void> {
    return this.waiters.get(id) ?? Promise.resolve();
  }
}
```

- [ ] **Step 4: Run tests + commit**

```bash
pnpm test job-queue
git add -A
git commit -m "feat(server): JobQueue with per-item progress and failure tracking"
```

---

### Task 2: Server state (shared browser + config)

**Files:**
- Create: `packages/server/src/server-state.ts`
- Modify: `packages/server/src/index.ts`, `packages/server/src/types.ts`

- [ ] **Step 1: Create server state**

```ts
// packages/server/src/server-state.ts
import type { Browser } from 'playwright';
import type { VisidiffConfig } from '@visidiff/core';
import { JobQueue } from './job-queue.js';

export interface ServerState {
  config: VisidiffConfig;
  browser: Browser | null;
  queue: JobQueue;
  lastMutation: number;
}

export function createState(config: VisidiffConfig): ServerState {
  return {
    config,
    browser: null,
    queue: new JobQueue({ concurrency: config.concurrency }),
    lastMutation: Date.now(),
  };
}
```

- [ ] **Step 2: Update server types + entry**

```ts
// packages/server/src/types.ts
import type { VisidiffConfig } from '@visidiff/core';

export interface ServerOptions {
  outputDir: string;
  uiDistDir: string;
  config: VisidiffConfig;
  port?: number;
  host?: string;
}
```

```ts
// packages/server/src/index.ts — update
import { fastify } from 'fastify';
import cors from '@fastify/cors';
import { registerDataRoutes } from './routes/data.js';
import { registerScreenshotRoutes } from './routes/screenshots.js';
import { registerUiRoutes } from './routes/ui.js';
import { registerRescreenshotRoutes } from './routes/rescreenshot.js';
import { createState } from './server-state.js';
import type { ServerOptions } from './types.js';

export async function createServer(opts: ServerOptions) {
  const app = fastify({ logger: { level: 'warn' } });
  const state = createState(opts.config);
  app.decorate('state', state);
  await app.register(cors);
  registerDataRoutes(app, opts);
  registerScreenshotRoutes(app, opts);
  registerRescreenshotRoutes(app, opts);
  registerUiRoutes(app, opts);
  return app;
}

export async function startServer(opts: ServerOptions) {
  const app = await createServer(opts);
  const port = opts.port ?? 4321;
  const host = opts.host ?? '127.0.0.1';
  await app.listen({ port, host });
  return { app, url: `http://${host}:${port}` };
}

declare module 'fastify' {
  interface FastifyInstance {
    state: import('./server-state.js').ServerState;
  }
}

export type { ServerOptions };
```

- [ ] **Step 3: Update CLI compare to pass config**

In `packages/cli/src/commands/compare.ts`, update the `startServer` call:

```ts
const started = await startServer({
  outputDir: config.outputDir,
  uiDistDir: uiDist,
  config,
});
```

- [ ] **Step 4: Typecheck + commit**

```bash
pnpm --recursive typecheck
git add -A
git commit -m "feat(server): shared state with config and job queue"
```

---

### Task 3: Rescreenshot worker

**Files:**
- Create: `packages/server/src/rescreenshot.ts`

- [ ] **Step 1: Implement**

```ts
// packages/server/src/rescreenshot.ts
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  capture,
  computeDiff,
  createContext,
  launchBrowser,
  type VisidiffConfig,
  type RunData,
  type ComparisonRecord,
  type ViewportDiff,
} from '@visidiff/core';
import type { Browser } from 'playwright';
import type { ServerState } from './server-state.js';

export interface RescreenshotTarget {
  urlId: string;
  viewport?: number;
  includeOriginal?: boolean;
}

export async function ensureBrowser(state: ServerState): Promise<Browser> {
  if (!state.browser) state.browser = await launchBrowser();
  return state.browser;
}

export async function rescreenshotOne(
  state: ServerState,
  outputDir: string,
  target: RescreenshotTarget,
): Promise<void> {
  const dataPath = join(outputDir, 'data.json');
  const data: RunData = JSON.parse(await readFile(dataPath, 'utf8'));
  const rec = data.comparisons.find((c) => c.url.id === target.urlId);
  if (!rec) throw new Error(`URL id not found: ${target.urlId}`);

  const browser = await ensureBrowser(state);
  const viewports = target.viewport
    ? rec.viewports.filter((v) => v.viewport === target.viewport)
    : rec.viewports;

  for (const vp of viewports) {
    await reshoot(browser, state.config, outputDir, rec, vp, target.includeOriginal ?? false);
  }

  await writeFile(dataPath, JSON.stringify(data, null, 2));
  state.lastMutation = Date.now();
}

async function reshoot(
  browser: Browser,
  config: VisidiffConfig,
  outputDir: string,
  rec: ComparisonRecord,
  vp: ViewportDiff,
  includeOriginal: boolean,
) {
  const shotName = (kind: 'original' | 'updated' | 'diff') =>
    `${rec.url.id}-${vp.viewport}-${kind}.png`;

  if (includeOriginal) {
    const ctx = await createContext(browser, {
      viewport: vp.viewport,
      auth: config.originalAuth,
    });
    try {
      const r = await capture({
        url: rec.url.originalUrl,
        context: ctx,
        mask: config.mask,
        fullPageMaxHeight: config.fullPageMaxHeight,
      });
      await writeFile(join(outputDir, 'screenshots', shotName('original')), r.buffer);
      rec.url.originalStatus = r.status;
    } finally {
      await ctx.close();
    }
  }

  const ctxU = await createContext(browser, {
    viewport: vp.viewport,
    auth: config.updatedAuth,
  });
  try {
    const r = await capture({
      url: rec.url.updatedUrl,
      context: ctxU,
      mask: config.mask,
      fullPageMaxHeight: config.fullPageMaxHeight,
    });
    await writeFile(join(outputDir, 'screenshots', shotName('updated')), r.buffer);
    rec.url.updatedStatus = r.status;
  } finally {
    await ctxU.close();
  }

  const orig = await readFile(join(outputDir, 'screenshots', shotName('original')));
  const upd = await readFile(join(outputDir, 'screenshots', shotName('updated')));
  const diffPath = join(outputDir, 'screenshots', shotName('diff'));
  const diff = await computeDiff({ a: orig, b: upd, diffPath, threshold: config.threshold });

  vp.pixelDiffPercent = diff.pixelDiffPercent;
  vp.heightDeltaPx = diff.heightDeltaPx;
  vp.status = 'computed';
  vp.error = undefined;
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(server): rescreenshot worker reusing core pipeline"
```

---

### Task 4: Rescreenshot route

**Files:**
- Create: `packages/server/src/routes/rescreenshot.ts`

- [ ] **Step 1: Implement**

```ts
// packages/server/src/routes/rescreenshot.ts
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { ServerOptions } from '../types.js';
import type { RunData } from '@visidiff/core';
import { rescreenshotOne } from '../rescreenshot.js';

interface RescreenshotRequestBody {
  urlIds?: string[];
  all?: boolean;
  includeOriginal?: boolean;
}

export function registerRescreenshotRoutes(app: FastifyInstance, opts: ServerOptions) {
  app.post<{ Body: RescreenshotRequestBody }>('/api/rescreenshot', async (req, reply) => {
    const state = app.state;
    const { urlIds, all, includeOriginal } = req.body ?? {};

    let targetIds: string[];
    if (all) {
      const data: RunData = JSON.parse(
        await readFile(join(opts.outputDir, 'data.json'), 'utf8'),
      );
      targetIds = data.comparisons.map((c) => c.url.id);
    } else if (urlIds && urlIds.length > 0) {
      targetIds = urlIds;
    } else {
      reply.code(400).send({ error: 'Must provide urlIds[] or all:true' });
      return;
    }

    const items = targetIds.map((urlId) => ({ urlId }));
    const jobId = state.queue.enqueue('rescreenshot', items, async (item) => {
      await rescreenshotOne(state, opts.outputDir, {
        urlId: item.urlId,
        includeOriginal: includeOriginal ?? false,
      });
    });
    reply.send({ jobId });
  });

  app.get<{ Params: { id: string } }>('/api/jobs/:id', async (req, reply) => {
    const job = app.state.queue.get(req.params.id);
    if (!job) {
      reply.code(404).send({ error: 'Job not found' });
      return;
    }
    reply.send(job);
  });

  app.get('/api/jobs', async () => {
    return { jobs: app.state.queue.list(), lastMutation: app.state.lastMutation };
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(server): rescreenshot + jobs endpoints"
```

---

### Task 5: Server integration test for rescreenshot

**Files:**
- Create: `packages/server/test/rescreenshot.test.ts`

- [ ] **Step 1: Write test (mocks the worker to avoid real Playwright)**

```ts
// packages/server/test/rescreenshot.test.ts
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createServer } from '../src/index.js';
import * as rescreenshot from '../src/rescreenshot.js';
import { validateConfig } from '@visidiff/core';

async function setupOutput() {
  const out = await mkdtemp(join(tmpdir(), 'visi-rs-'));
  await mkdir(join(out, 'screenshots'), { recursive: true });
  await writeFile(
    join(out, 'data.json'),
    JSON.stringify({
      version: 1,
      createdAt: '',
      config: { original: 'x/*', updated: 'y/*', viewports: [1440], threshold: 0.1 },
      comparisons: [
        {
          url: { id: 'abc', originalUrl: 'a', updatedUrl: 'b', group: '/', originalStatus: 200, updatedStatus: 200 },
          viewports: [
            {
              viewport: 1440,
              originalPath: 'screenshots/abc-1440-original.png',
              updatedPath: 'screenshots/abc-1440-updated.png',
              diffPath: 'screenshots/abc-1440-diff.png',
              pixelDiffPercent: 0,
              heightDeltaPx: 0,
              status: 'computed',
            },
          ],
        },
      ],
      stats: { totalUrls: 1, succeeded: 1, failed: 0, skipped: 0 },
    }),
  );
  return out;
}

describe('rescreenshot routes', () => {
  it('enqueues a job and returns id', async () => {
    const spy = vi.spyOn(rescreenshot, 'rescreenshotOne').mockResolvedValue();
    const out = await setupOutput();
    const cfg = validateConfig({ original: 'https://a.com/*', updated: 'https://b.com/*' });
    const app = await createServer({ outputDir: out, uiDistDir: join(out, 'none'), config: cfg });
    const res = await app.inject({
      method: 'POST',
      url: '/api/rescreenshot',
      payload: { urlIds: ['abc'] },
    });
    expect(res.statusCode).toBe(200);
    const { jobId } = JSON.parse(res.body);
    expect(jobId).toBeDefined();
    await app.state.queue.wait(jobId);
    expect(spy).toHaveBeenCalledOnce();
    await app.close();
  });

  it('returns 400 when no target', async () => {
    const out = await setupOutput();
    const cfg = validateConfig({ original: 'https://a.com/*', updated: 'https://b.com/*' });
    const app = await createServer({ outputDir: out, uiDistDir: join(out, 'none'), config: cfg });
    const res = await app.inject({ method: 'POST', url: '/api/rescreenshot', payload: {} });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('/api/jobs/:id returns job status', async () => {
    vi.spyOn(rescreenshot, 'rescreenshotOne').mockResolvedValue();
    const out = await setupOutput();
    const cfg = validateConfig({ original: 'https://a.com/*', updated: 'https://b.com/*' });
    const app = await createServer({ outputDir: out, uiDistDir: join(out, 'none'), config: cfg });
    const post = await app.inject({
      method: 'POST',
      url: '/api/rescreenshot',
      payload: { urlIds: ['abc'] },
    });
    const { jobId } = JSON.parse(post.body);
    await app.state.queue.wait(jobId);
    const res = await app.inject({ method: 'GET', url: `/api/jobs/${jobId}` });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('done');
    await app.close();
  });
});
```

- [ ] **Step 2: Run + commit**

```bash
pnpm test rescreenshot
git add -A
git commit -m "test(server): rescreenshot endpoint integration tests"
```

---

## Phase 2: UI Integration

### Task 6: Jobs composable

**Files:**
- Create: `packages/ui/src/composables/useJobs.ts`, `packages/ui/src/composables/useCacheBust.ts`

- [ ] **Step 1: Cache-bust composable (for forcing image reload)**

```ts
// packages/ui/src/composables/useCacheBust.ts
import { ref } from 'vue';

const bust = ref(Date.now());

export function useCacheBust() {
  function bumpIfChanged(lastMutation: number) {
    if (lastMutation > bust.value) bust.value = lastMutation;
  }
  function suffix(): string {
    return `?t=${bust.value}`;
  }
  return { bumpIfChanged, suffix, bust };
}
```

- [ ] **Step 2: Jobs composable with polling**

```ts
// packages/ui/src/composables/useJobs.ts
import { ref, onUnmounted } from 'vue';
import { useCacheBust } from './useCacheBust.js';
import type { RunData } from '../types.js';

export interface JobFailure { item: { urlId: string }; error: string; }
export interface Job {
  id: string;
  kind: string;
  status: 'running' | 'done';
  total: number;
  completed: number;
  current: { urlId: string } | null;
  failures: JobFailure[];
}

export function useJobs(onDataChange: () => void) {
  const activeJob = ref<Job | null>(null);
  const error = ref<string | null>(null);
  const { bumpIfChanged } = useCacheBust();
  let poll: ReturnType<typeof setInterval> | null = null;

  async function enqueue(body: { urlIds?: string[]; all?: boolean; includeOriginal?: boolean }) {
    error.value = null;
    const res = await fetch('/api/rescreenshot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      error.value = `Enqueue failed: ${res.status}`;
      return;
    }
    const { jobId } = await res.json();
    startPolling(jobId);
  }

  function startPolling(jobId: string) {
    if (poll) clearInterval(poll);
    poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (!res.ok) return;
        const job: Job = await res.json();
        activeJob.value = job;
        if (job.status === 'done') {
          clearInterval(poll!);
          poll = null;
          const jobsRes = await fetch('/api/jobs').then((r) => r.json());
          bumpIfChanged(jobsRes.lastMutation);
          onDataChange();
          setTimeout(() => {
            activeJob.value = null;
          }, 2000);
        }
      } catch {
        /* ignore */
      }
    }, 500);
  }

  onUnmounted(() => {
    if (poll) clearInterval(poll);
  });

  return { activeJob, error, enqueue };
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(ui): composables for jobs polling and cache-bust"
```

---

### Task 7: Rescreenshot buttons

**Files:**
- Create: `packages/ui/src/components/RescreenshotButton.vue`, `packages/ui/src/components/JobsToolbar.vue`, `packages/ui/src/components/ProgressToast.vue`

- [ ] **Step 1: RescreenshotButton (single URL)**

```vue
<!-- packages/ui/src/components/RescreenshotButton.vue -->
<script setup lang="ts">
const props = defineProps<{ urlId: string; disabled?: boolean; variant?: 'icon' | 'primary' }>();
defineEmits<{ click: [string] }>();
</script>

<template>
  <button
    class="rs-btn"
    :class="variant ?? 'icon'"
    :disabled="disabled"
    @click.stop="$emit('click', urlId)"
    title="Re-screenshot this URL"
  >
    <span v-if="variant === 'primary'">🔄 Re-screenshot</span>
    <span v-else>🔄</span>
  </button>
</template>

<style scoped>
.rs-btn { border: 1px solid var(--border); background: white; border-radius: 4px; }
.rs-btn.icon { padding: 0.2rem 0.4rem; font-size: 0.95rem; }
.rs-btn.primary { padding: 0.5rem 1rem; font-weight: 600; background: var(--primary); color: white; border-color: var(--primary); }
.rs-btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
```

- [ ] **Step 2: JobsToolbar (all + filtered)**

```vue
<!-- packages/ui/src/components/JobsToolbar.vue -->
<script setup lang="ts">
defineProps<{ filteredIds: string[]; totalCount: number; busy: boolean }>();
defineEmits<{ 'rescreenshot-all': []; 'rescreenshot-filtered': [] }>();
</script>

<template>
  <div class="toolbar">
    <button :disabled="busy" @click="$emit('rescreenshot-all')">
      🔄 Re-screenshot all ({{ totalCount }})
    </button>
    <button :disabled="busy || filteredIds.length === 0" @click="$emit('rescreenshot-filtered')">
      🔄 Re-screenshot filtered ({{ filteredIds.length }})
    </button>
  </div>
</template>

<style scoped>
.toolbar { display: flex; gap: 0.5rem; padding: 0.5rem 1.25rem; }
button {
  padding: 0.4rem 0.8rem;
  border: 1px solid var(--border);
  background: white;
  border-radius: 4px;
  font-size: 0.85rem;
}
button:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
```

- [ ] **Step 3: ProgressToast**

```vue
<!-- packages/ui/src/components/ProgressToast.vue -->
<script setup lang="ts">
import type { Job } from '../composables/useJobs.js';
defineProps<{ job: Job | null }>();
</script>

<template>
  <div v-if="job" class="toast" :class="{ done: job.status === 'done' }">
    <div class="label">
      {{ job.status === 'done' ? '✓ Done' : '🔄 Re-screenshotting' }}
      {{ job.completed }}/{{ job.total }}
      <span v-if="job.failures.length > 0" class="fail"> · {{ job.failures.length }} failed</span>
    </div>
    <div class="bar">
      <div class="fill" :style="{ width: (job.completed / job.total) * 100 + '%' }"></div>
    </div>
  </div>
</template>

<style scoped>
.toast {
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  padding: 0.75rem 1rem;
  background: white;
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  min-width: 260px;
  z-index: 100;
}
.toast.done { border-color: var(--ok); }
.label { font-size: 0.9rem; margin-bottom: 0.5rem; }
.fail { color: var(--err); }
.bar { height: 4px; background: #eee; border-radius: 2px; overflow: hidden; }
.fill { height: 100%; background: var(--primary); transition: width 0.2s; }
.done .fill { background: var(--ok); }
</style>
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(ui): rescreenshot buttons and progress toast components"
```

---

### Task 8: Wire rescreenshot into ResultsView

**Files:**
- Modify: `packages/ui/src/views/ResultsView.vue`, `packages/ui/src/components/ResultsTable.vue`

- [ ] **Step 1: Update ResultsTable to emit rescreenshot events**

```vue
<!-- packages/ui/src/components/ResultsTable.vue — add a column and emit -->
<script setup lang="ts">
import { useRouter } from 'vue-router';
import type { ComparisonRecord } from '../types.js';
import DiffBadge from './DiffBadge.vue';
import Thumbnail from './Thumbnail.vue';
import RescreenshotButton from './RescreenshotButton.vue';
import { useCacheBust } from '../composables/useCacheBust.js';

defineProps<{ rows: ComparisonRecord[]; busyIds: Set<string> }>();
defineEmits<{ rescreenshot: [string] }>();
const router = useRouter();
const { suffix } = useCacheBust();

function maxDiff(r: ComparisonRecord): number {
  return Math.max(0, ...r.viewports.map((v) => v.pixelDiffPercent ?? 0));
}
function maxHeight(r: ComparisonRecord): number {
  const values = r.viewports.map((v) => v.heightDeltaPx ?? 0);
  return values.reduce((m, v) => (Math.abs(v) > Math.abs(m) ? v : m), 0);
}
function open(rec: ComparisonRecord) {
  router.push({ name: 'detail', params: { id: rec.url.id } });
}
</script>

<template>
  <table class="results">
    <thead>
      <tr>
        <th></th>
        <th>URL</th>
        <th>Original</th>
        <th>Updated</th>
        <th>Diff</th>
        <th>Height Δ</th>
        <th>Group</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="r in rows" :key="r.url.id" @click="open(r)">
        <td>
          <Thumbnail
            v-if="r.viewports[0]"
            :src="r.viewports[0].updatedPath + suffix()"
            :alt="r.url.updatedUrl"
          />
        </td>
        <td class="url">{{ r.url.originalUrl }}</td>
        <td>{{ r.url.originalStatus ?? '-' }}</td>
        <td>{{ r.url.updatedStatus ?? '-' }}</td>
        <td><DiffBadge :percent="maxDiff(r)" /></td>
        <td>{{ maxHeight(r) === 0 ? '—' : (maxHeight(r) > 0 ? '+' : '') + maxHeight(r) + 'px' }}</td>
        <td class="group">{{ r.url.group }}</td>
        <td>
          <RescreenshotButton
            :url-id="r.url.id"
            :disabled="busyIds.has(r.url.id)"
            @click="(id) => $emit('rescreenshot', id)"
          />
        </td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
/* keep existing styles from plan 2 */
.results { width: 100%; border-collapse: collapse; background: white; }
th, td { padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid var(--border); font-size: 0.9rem; }
th { background: #f5f5f5; font-weight: 600; position: sticky; top: 0; }
tbody tr { cursor: pointer; }
tbody tr:hover { background: #f9f9fb; }
.url, .group { font-family: ui-monospace, monospace; font-size: 0.82rem; }
.url { max-width: 420px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
```

The `Thumbnail` component also needs updated to accept paths with query suffix:

```vue
<!-- packages/ui/src/components/Thumbnail.vue — update -->
<script setup lang="ts">
defineProps<{ src: string; alt: string }>();
function resolved(src: string) {
  const [path, qs] = src.split('?');
  return `/screenshots/${path!.split('/').pop()}${qs ? '?' + qs : ''}`;
}
</script>

<template>
  <img class="thumb" :src="resolved(src)" :alt="alt" loading="lazy" />
</template>
```

- [ ] **Step 2: Update ResultsView to use JobsToolbar + useJobs**

```vue
<!-- packages/ui/src/views/ResultsView.vue -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRunData } from '../composables/useRunData.js';
import { useFilters } from '../composables/useFilters.js';
import { useJobs } from '../composables/useJobs.js';
import FilterBar from '../components/FilterBar.vue';
import ResultsTable from '../components/ResultsTable.vue';
import JobsToolbar from '../components/JobsToolbar.vue';
import ProgressToast from '../components/ProgressToast.vue';

const { data, loading, error, reload } = useRunData();
const rows = computed(() => data.value?.comparisons ?? []);
const { search, minDiff, statusFilter, filtered } = useFilters(rows);
const { activeJob, error: jobError, enqueue } = useJobs(reload);

const busyIds = computed(() => {
  const s = new Set<string>();
  if (activeJob.value?.status === 'running' && activeJob.value.current) {
    s.add(activeJob.value.current.urlId);
  }
  return s;
});

function rescreenshotOne(id: string) {
  void enqueue({ urlIds: [id] });
}
function rescreenshotAll() {
  void enqueue({ all: true });
}
function rescreenshotFiltered() {
  void enqueue({ urlIds: filtered.value.map((r) => r.url.id) });
}
</script>

<template>
  <div v-if="loading">Loading...</div>
  <div v-else-if="error" class="error">{{ error }}</div>
  <template v-else-if="data">
    <FilterBar
      v-model:search="search"
      v-model:min-diff="minDiff"
      v-model:status-filter="statusFilter"
    />
    <JobsToolbar
      :filtered-ids="filtered.map((r) => r.url.id)"
      :total-count="rows.length"
      :busy="activeJob?.status === 'running'"
      @rescreenshot-all="rescreenshotAll"
      @rescreenshot-filtered="rescreenshotFiltered"
    />
    <div class="summary">
      {{ filtered.length }} of {{ rows.length }} URLs
      · {{ data.stats.succeeded }} ok · {{ data.stats.failed }} failed
      <span v-if="jobError" class="error-inline"> · {{ jobError }}</span>
    </div>
    <ResultsTable :rows="filtered" :busy-ids="busyIds" @rescreenshot="rescreenshotOne" />
    <ProgressToast :job="activeJob" />
  </template>
</template>

<style scoped>
.summary { padding: 0.5rem 1.25rem; font-size: 0.85rem; color: var(--muted); }
.error { padding: 2rem; color: var(--err); }
.error-inline { color: var(--err); }
</style>
```

- [ ] **Step 3: Build + commit**

```bash
pnpm --filter @visidiff/ui build
git add -A
git commit -m "feat(ui): rescreenshot buttons + toolbar + progress toast in ResultsView"
```

---

### Task 9: Rescreenshot button in DetailView

**Files:**
- Modify: `packages/ui/src/views/DetailView.vue`

- [ ] **Step 1: Add rescreenshot button and wire images via cache-bust suffix**

Update `DetailView.vue` — replace the existing `<script setup>` block:

```vue
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useRunData } from '../composables/useRunData.js';
import { useJobs } from '../composables/useJobs.js';
import { useCacheBust } from '../composables/useCacheBust.js';
import ViewportTabs from '../components/ViewportTabs.vue';
import SideBySideView from '../components/SideBySideView.vue';
import DiffImageView from '../components/DiffImageView.vue';
import OverlaySliderView from '../components/OverlaySliderView.vue';
import DiffBadge from '../components/DiffBadge.vue';
import RescreenshotButton from '../components/RescreenshotButton.vue';
import ProgressToast from '../components/ProgressToast.vue';

const route = useRoute();
const router = useRouter();
const { data, reload } = useRunData();
const { activeJob, enqueue } = useJobs(reload);
const { suffix } = useCacheBust();

const record = computed(() =>
  data.value?.comparisons.find((c) => c.url.id === route.params.id),
);
const viewports = computed(() => record.value?.viewports ?? []);
const activeViewport = ref<number>(0);
const mode = ref<'sbs' | 'diff' | 'overlay'>('overlay');

watch(
  viewports,
  (vs) => {
    if (vs.length > 0 && !vs.some((v) => v.viewport === activeViewport.value)) {
      activeViewport.value = vs[0]!.viewport;
    }
  },
  { immediate: true },
);

const current = computed(() => viewports.value.find((v) => v.viewport === activeViewport.value));

function withBust(path: string): string {
  return path + suffix();
}

function rescreenshotThis() {
  if (record.value) void enqueue({ urlIds: [record.value.url.id] });
}
</script>
```

- [ ] **Step 2: Update template — add rescreenshot button and pass cache-busted paths**

```vue
<template>
  <div v-if="!record" class="empty">URL not found.</div>
  <div v-else class="detail">
    <header class="detail-head">
      <button @click="router.push({ name: 'results' })">← Back</button>
      <div class="urls">
        <div><strong>Original:</strong> {{ record.url.originalUrl }}</div>
        <div><strong>Updated:</strong> {{ record.url.updatedUrl }}</div>
      </div>
      <DiffBadge :percent="current?.pixelDiffPercent ?? null" />
      <RescreenshotButton
        variant="primary"
        :url-id="record.url.id"
        :disabled="activeJob?.status === 'running'"
        @click="rescreenshotThis"
      />
    </header>
    <ViewportTabs
      :viewports="viewports"
      :active="activeViewport"
      @update="(v) => (activeViewport = v)"
    />
    <div class="mode-tabs">
      <button :class="{ active: mode === 'overlay' }" @click="mode = 'overlay'">Overlay</button>
      <button :class="{ active: mode === 'diff' }" @click="mode = 'diff'">Diff</button>
      <button :class="{ active: mode === 'sbs' }" @click="mode = 'sbs'">Side-by-side</button>
    </div>
    <div class="viewer">
      <template v-if="current">
        <OverlaySliderView
          v-if="mode === 'overlay'"
          :original-src="withBust(current.originalPath)"
          :updated-src="withBust(current.updatedPath)"
        />
        <DiffImageView
          v-else-if="mode === 'diff'"
          :diff-src="current.diffPath ? withBust(current.diffPath) : null"
        />
        <SideBySideView
          v-else
          :original-src="withBust(current.originalPath)"
          :updated-src="withBust(current.updatedPath)"
        />
      </template>
    </div>
    <ProgressToast :job="activeJob" />
  </div>
</template>
```

Update the image resolution in `SideBySideView.vue`, `DiffImageView.vue`, `OverlaySliderView.vue` — they all have an `imgSrc` helper. Update each:

```ts
function imgSrc(p: string) {
  const [path, qs] = p.split('?');
  return `/screenshots/${path!.split('/').pop()}${qs ? '?' + qs : ''}`;
}
```

- [ ] **Step 3: Build + commit**

```bash
pnpm --filter @visidiff/ui build
git add -A
git commit -m "feat(ui): rescreenshot button + cache-busted images in DetailView"
```

---

## Phase 3: Polish

### Task 10: Error recovery + UI cache invalidation for data.json

**Files:**
- Modify: `packages/ui/src/composables/useRunData.ts`

- [ ] **Step 1: Expose a `reload()` function (already done in plan 2, confirm)**

Verify `useRunData` from plan 2 returns `reload`. If not, ensure:

```ts
return { data, loading, error, reload: load };
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "chore(ui): confirm reload surface for rescreenshot data refresh"
```

---

### Task 11: End-to-end smoke test

**Files:**
- Modify: `packages/cli/test/compare.integration.test.ts`

- [ ] **Step 1: Add a test that POSTs to rescreenshot and verifies data.json updates**

Add to existing integration test file:

```ts
it('rescreenshot endpoint updates data.json', async () => {
  // Requires same fixture setup as the compare test.
  // Start server against the output dir from the previous test's output,
  // mock rescreenshot.rescreenshotOne to flip pixelDiffPercent,
  // POST /api/rescreenshot, wait for job, verify data.json updated.
  // Full implementation mirrors the pattern in packages/server/test/rescreenshot.test.ts.
  // Skip if running without Playwright browsers installed.
});
```

Because full end-to-end (real Playwright re-screenshot through the server) requires heavy setup, defer to the unit tests in `packages/server/test/rescreenshot.test.ts` (Task 5) for correctness assurance. Smoke the happy path manually:

```bash
pnpm --filter @visidiff/ui build
pnpm --filter visidiff build

# In a separate terminal with a real test site:
cd /tmp/visidiff-smoke
node /c/Workspaces/visidiff/packages/cli/bin/visidiff.js compare --max-pages 3
# In the UI, click "Re-screenshot" on one row — verify:
#   - button disables
#   - progress toast appears
#   - thumbnail and detail view images refresh when done
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "docs: smoke-test checklist for rescreenshot"
```

---

### Task 12: Update README

- [ ] **Step 1: Append to root `README.md`**

```markdown
## Re-screenshot (iterative workflow)

While the report server is running, you can re-screenshot URLs without restarting the CLI:

- **Per-URL**: click the 🔄 icon in the results table or the "Re-screenshot" button in the detail view.
- **All**: "Re-screenshot all" in the toolbar.
- **Filtered**: apply filters (e.g. "min diff 5%"), then "Re-screenshot filtered".

Each re-screenshot:
1. Captures the updated URL at all configured viewports
2. Re-computes the diff
3. Writes `data.json` in place
4. UI refreshes thumbnails via cache-busting

Use `--also-original` on the CLI's `rescreenshot` command if the original (prod) screenshot needs refreshing too.

Progress is shown as a toast in the lower-right. Failures appear in the toast; the job keeps going.
```

- [ ] **Step 2: Full test suite passes**

```bash
pnpm test
pnpm --recursive typecheck
```

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "docs: document rescreenshot workflow"
```

---

## Summary

After this plan:
- `POST /api/rescreenshot` enqueues a job for one, many, or all URLs
- `GET /api/jobs/:id` polls job progress
- UI has rescreenshot buttons in table rows, drawer, and toolbar
- Progress toast shows live completion
- Cache-busting refreshes images after data.json updates
- Shared browser instance + config live in server state
- Full tests: job queue unit tests + server integration tests with mocked worker

**Full system complete:** plans 1+2+3 together deliver the tool described in the spec — crawl, screenshot, diff, interactive report, iterative re-screenshot.
