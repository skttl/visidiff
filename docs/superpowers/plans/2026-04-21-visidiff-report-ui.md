# visidiff Report UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the interactive read-only report for visidiff — a Fastify server that serves a Vue-based UI reading `data.json` from plan 1. The UI shows a filterable/sortable table of all URL comparisons, a drawer per URL with side-by-side view, a diff-image view, and an overlay slider with keyboard controls and `mix-blend-mode: difference`. Integrates with the `compare` command: after the pipeline finishes, the server auto-starts and a browser opens.

**Architecture:** Two new packages: `server` (Fastify, serves API + static UI) and `ui` (Vite + Vue 3 + TypeScript). `ui` builds to static assets that `server` serves. `compare` command (plan 1) is extended to spawn the server on completion. Drawer uses synchronized scroll between two iframes/images. Overlay uses CSS opacity + `mix-blend-mode`.

**Tech Stack:** Fastify 5, Vue 3, Vite 5, TypeScript 5, vue-router, `@fastify/static`, `@fastify/cors`, `open` (browser launcher).

**Prerequisite:** Plan 1 (`visidiff-core-cli`) completed. All work builds on existing monorepo.

---

## File Structure

```
packages/
  server/
    package.json
    tsconfig.json
    src/
      index.ts                # createServer()
      routes/
        data.ts               # GET /api/data
        screenshots.ts        # GET /screenshots/*
        ui.ts                 # serve built UI
      types.ts
    test/
      server.test.ts
  ui/
    package.json
    vite.config.ts
    tsconfig.json
    index.html
    src/
      main.ts
      App.vue
      router.ts
      api.ts
      types.ts                # re-export from core's RunData, etc.
      composables/
        useRunData.ts
        useFilters.ts
      components/
        ResultsTable.vue
        DrawerLayout.vue
        DiffBadge.vue
        FilterBar.vue
        Thumbnail.vue
        ViewportTabs.vue
        SideBySideView.vue
        DiffImageView.vue
        OverlaySliderView.vue
      views/
        ResultsView.vue
        DetailView.vue
      styles/
        main.css
```

The existing `packages/cli/src/commands/compare.ts` is modified to spawn the server.

---

## Phase 1: Server

### Task 1: Server package scaffold

**Files:**
- Create: `packages/server/package.json`, `packages/server/tsconfig.json`, `packages/server/src/index.ts`, `packages/server/src/types.ts`

- [ ] **Step 1: Create `packages/server/package.json`**

```json
{
  "name": "@visidiff/server",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": "./dist/index.js" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@fastify/cors": "^9.0.0",
    "@fastify/static": "^7.0.0",
    "@visidiff/core": "workspace:*",
    "fastify": "^5.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.12.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create `packages/server/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist", "rootDir": "./src" },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Create types**

```ts
// packages/server/src/types.ts
export interface ServerOptions {
  outputDir: string;
  uiDistDir: string;
  port?: number;
  host?: string;
}
```

- [ ] **Step 4: Create server skeleton**

```ts
// packages/server/src/index.ts
import { fastify } from 'fastify';
import cors from '@fastify/cors';
import staticPlugin from '@fastify/static';
import { join } from 'node:path';
import { registerDataRoutes } from './routes/data.js';
import { registerScreenshotRoutes } from './routes/screenshots.js';
import { registerUiRoutes } from './routes/ui.js';
import type { ServerOptions } from './types.js';

export async function createServer(opts: ServerOptions) {
  const app = fastify({ logger: { level: 'warn' } });
  await app.register(cors);
  registerDataRoutes(app, opts);
  registerScreenshotRoutes(app, opts);
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

export type { ServerOptions };
```

- [ ] **Step 5: Install + commit**

```bash
pnpm install
git add -A
git commit -m "feat(server): scaffold Fastify server package"
```

---

### Task 2: Data route

**Files:**
- Create: `packages/server/src/routes/data.ts`

- [ ] **Step 1: Implement**

```ts
// packages/server/src/routes/data.ts
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { ServerOptions } from '../types.js';

export function registerDataRoutes(app: FastifyInstance, opts: ServerOptions) {
  app.get('/api/data', async (_req, reply) => {
    try {
      const raw = await readFile(join(opts.outputDir, 'data.json'), 'utf8');
      reply.header('Cache-Control', 'no-store');
      reply.type('application/json').send(raw);
    } catch (err) {
      reply.code(404).send({ error: 'data.json not found', detail: (err as Error).message });
    }
  });

  app.get('/api/health', async () => ({ ok: true, mode: 'readonly' }));
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(server): /api/data route reads data.json fresh each request"
```

---

### Task 3: Screenshot route

**Files:**
- Create: `packages/server/src/routes/screenshots.ts`

- [ ] **Step 1: Implement**

```ts
// packages/server/src/routes/screenshots.ts
import staticPlugin from '@fastify/static';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { ServerOptions } from '../types.js';

export function registerScreenshotRoutes(app: FastifyInstance, opts: ServerOptions) {
  void app.register(staticPlugin, {
    root: join(opts.outputDir, 'screenshots'),
    prefix: '/screenshots/',
    decorateReply: false,
    cacheControl: false,
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-cache');
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(server): serve /screenshots/* from output dir"
```

---

### Task 4: UI route

**Files:**
- Create: `packages/server/src/routes/ui.ts`

- [ ] **Step 1: Implement**

```ts
// packages/server/src/routes/ui.ts
import staticPlugin from '@fastify/static';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { ServerOptions } from '../types.js';

export function registerUiRoutes(app: FastifyInstance, opts: ServerOptions) {
  if (!existsSync(opts.uiDistDir)) {
    app.log.warn(`UI dist not found at ${opts.uiDistDir} — did you build @visidiff/ui?`);
    return;
  }
  void app.register(staticPlugin, {
    root: opts.uiDistDir,
    prefix: '/',
    decorateReply: true,
    wildcard: false,
  });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/') || req.url.startsWith('/screenshots/')) {
      reply.code(404).send({ error: 'not found' });
      return;
    }
    reply.sendFile('index.html');
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(server): serve UI SPA with fallback to index.html"
```

---

### Task 5: Server integration test

**Files:**
- Create: `packages/server/test/server.test.ts`

- [ ] **Step 1: Write test**

```ts
// packages/server/test/server.test.ts
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createServer } from '../src/index.js';

describe('server', () => {
  it('serves /api/data when data.json exists', async () => {
    const out = await mkdtemp(join(tmpdir(), 'visi-srv-'));
    await mkdir(join(out, 'screenshots'), { recursive: true });
    const payload = { version: 1, comparisons: [], stats: {} };
    await writeFile(join(out, 'data.json'), JSON.stringify(payload));
    const app = await createServer({ outputDir: out, uiDistDir: join(out, 'noexist') });
    const res = await app.inject({ method: 'GET', url: '/api/data' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).version).toBe(1);
    await app.close();
  });

  it('returns 404 when data.json missing', async () => {
    const out = await mkdtemp(join(tmpdir(), 'visi-srv-'));
    const app = await createServer({ outputDir: out, uiDistDir: join(out, 'noexist') });
    const res = await app.inject({ method: 'GET', url: '/api/data' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('/api/health returns ok', async () => {
    const out = await mkdtemp(join(tmpdir(), 'visi-srv-'));
    const app = await createServer({ outputDir: out, uiDistDir: join(out, 'noexist') });
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
    await app.close();
  });
});
```

- [ ] **Step 2: Run tests + commit**

```bash
pnpm test server
git add -A
git commit -m "test(server): integration tests for data and health endpoints"
```

---

## Phase 2: UI Scaffold

### Task 6: Vite + Vue scaffold

**Files:**
- Create: `packages/ui/package.json`, `packages/ui/vite.config.ts`, `packages/ui/tsconfig.json`, `packages/ui/index.html`, `packages/ui/src/main.ts`, `packages/ui/src/App.vue`, `packages/ui/src/router.ts`, `packages/ui/src/styles/main.css`

- [ ] **Step 1: Create `packages/ui/package.json`**

```json
{
  "name": "@visidiff/ui",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc --noEmit && vite build",
    "typecheck": "vue-tsc --noEmit"
  },
  "dependencies": {
    "@visidiff/core": "workspace:*",
    "vue": "^3.4.0",
    "vue-router": "^4.3.0"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.0.0",
    "@vue/tsconfig": "^0.5.1",
    "typescript": "^5.4.0",
    "vite": "^5.2.0",
    "vue-tsc": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `packages/ui/vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4321',
      '/screenshots': 'http://localhost:4321',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
```

- [ ] **Step 3: Create `packages/ui/tsconfig.json`**

```json
{
  "extends": "@vue/tsconfig/tsconfig.dom.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] },
    "types": ["vite/client"]
  },
  "include": ["src/**/*.ts", "src/**/*.vue", "src/**/*.tsx"]
}
```

- [ ] **Step 4: Create `packages/ui/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>visidiff report</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `packages/ui/src/main.ts`**

```ts
import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router.js';
import './styles/main.css';

createApp(App).use(router).mount('#app');
```

- [ ] **Step 6: Create `packages/ui/src/App.vue`**

```vue
<script setup lang="ts"></script>

<template>
  <div class="app">
    <header class="app-header">
      <h1>visidiff</h1>
    </header>
    <main>
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.app-header {
  padding: 0.75rem 1.25rem;
  border-bottom: 1px solid #e5e5e5;
}
.app-header h1 {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0;
}
</style>
```

- [ ] **Step 7: Create `packages/ui/src/router.ts`**

```ts
import { createRouter, createWebHistory } from 'vue-router';
import ResultsView from './views/ResultsView.vue';
import DetailView from './views/DetailView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'results', component: ResultsView },
    { path: '/url/:id', name: 'detail', component: DetailView, props: true },
  ],
});
```

- [ ] **Step 8: Create `packages/ui/src/styles/main.css`**

```css
:root {
  --bg: #fafafa;
  --fg: #1a1a1a;
  --muted: #666;
  --border: #e5e5e5;
  --primary: #2563eb;
  --ok: #16a34a;
  --warn: #ca8a04;
  --err: #dc2626;
  font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
}

* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); }
button { cursor: pointer; }
```

- [ ] **Step 9: Create empty view placeholders (will be filled later)**

```vue
<!-- packages/ui/src/views/ResultsView.vue -->
<template><div>Loading...</div></template>
```

```vue
<!-- packages/ui/src/views/DetailView.vue -->
<template><div>Detail placeholder</div></template>
```

- [ ] **Step 10: Install + dev smoke**

```bash
pnpm install
pnpm --filter @visidiff/ui dev &
sleep 3
curl -s http://localhost:5173/ | grep -q 'id="app"' && echo OK
kill %1 || true
```

Expected: dev server serves the shell.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat(ui): scaffold Vue 3 app with router and styles"
```

---

### Task 7: API client + types

**Files:**
- Create: `packages/ui/src/types.ts`, `packages/ui/src/api.ts`, `packages/ui/src/composables/useRunData.ts`

- [ ] **Step 1: Re-export core types**

```ts
// packages/ui/src/types.ts
export type { RunData, ComparisonRecord, ViewportDiff, UrlRecord } from '@visidiff/core';
```

- [ ] **Step 2: Create API client**

```ts
// packages/ui/src/api.ts
import type { RunData } from './types.js';

export async function fetchRunData(): Promise<RunData> {
  const res = await fetch('/api/data', { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load /api/data: ${res.status}`);
  return (await res.json()) as RunData;
}
```

- [ ] **Step 3: Create composable**

```ts
// packages/ui/src/composables/useRunData.ts
import { ref, onMounted } from 'vue';
import { fetchRunData } from '../api.js';
import type { RunData } from '../types.js';

export function useRunData() {
  const data = ref<RunData | null>(null);
  const loading = ref(true);
  const error = ref<string | null>(null);

  async function load() {
    loading.value = true;
    error.value = null;
    try {
      data.value = await fetchRunData();
    } catch (err) {
      error.value = (err as Error).message;
    } finally {
      loading.value = false;
    }
  }

  onMounted(load);

  return { data, loading, error, reload: load };
}
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(ui): API client and useRunData composable"
```

---

## Phase 3: Results Table

### Task 8: Results table component

**Files:**
- Create: `packages/ui/src/composables/useFilters.ts`, `packages/ui/src/components/DiffBadge.vue`, `packages/ui/src/components/Thumbnail.vue`, `packages/ui/src/components/ResultsTable.vue`, `packages/ui/src/components/FilterBar.vue`

- [ ] **Step 1: Filters composable**

```ts
// packages/ui/src/composables/useFilters.ts
import { computed, ref, type Ref } from 'vue';
import type { ComparisonRecord } from '../types.js';

export type SortKey = 'diff' | 'url' | 'heightDelta' | 'status';
export type SortDir = 'asc' | 'desc';

export function useFilters(rows: Ref<ComparisonRecord[]>) {
  const search = ref('');
  const minDiff = ref(0);
  const statusFilter = ref<'all' | 'ok' | 'error' | 'mismatch'>('all');
  const sortKey = ref<SortKey>('diff');
  const sortDir = ref<SortDir>('desc');

  const filtered = computed(() => {
    let list = rows.value.slice();
    if (search.value) {
      const q = search.value.toLowerCase();
      list = list.filter((r) => r.url.originalUrl.toLowerCase().includes(q));
    }
    if (minDiff.value > 0) {
      list = list.filter((r) =>
        r.viewports.some((v) => (v.pixelDiffPercent ?? 0) >= minDiff.value),
      );
    }
    if (statusFilter.value !== 'all') {
      list = list.filter((r) => statusOf(r) === statusFilter.value);
    }
    list.sort((a, b) => {
      const dir = sortDir.value === 'asc' ? 1 : -1;
      switch (sortKey.value) {
        case 'diff':
          return (maxDiff(a) - maxDiff(b)) * dir;
        case 'heightDelta':
          return (Math.abs(maxHeight(a)) - Math.abs(maxHeight(b))) * dir;
        case 'url':
          return a.url.originalUrl.localeCompare(b.url.originalUrl) * dir;
        case 'status':
          return statusOf(a).localeCompare(statusOf(b)) * dir;
      }
    });
    return list;
  });

  return { search, minDiff, statusFilter, sortKey, sortDir, filtered };
}

function maxDiff(r: ComparisonRecord): number {
  return Math.max(0, ...r.viewports.map((v) => v.pixelDiffPercent ?? 0));
}
function maxHeight(r: ComparisonRecord): number {
  return Math.max(0, ...r.viewports.map((v) => Math.abs(v.heightDeltaPx ?? 0)));
}
function statusOf(r: ComparisonRecord): 'ok' | 'error' | 'mismatch' {
  if (r.viewports.some((v) => v.status === 'failed')) return 'error';
  if (r.url.originalStatus !== r.url.updatedStatus) return 'mismatch';
  return 'ok';
}
```

- [ ] **Step 2: DiffBadge component**

```vue
<!-- packages/ui/src/components/DiffBadge.vue -->
<script setup lang="ts">
const props = defineProps<{ percent: number | null }>();

const tier = computedTier(props.percent);

function computedTier(p: number | null) {
  if (p === null) return { label: 'N/A', color: '#888' };
  if (p < 1) return { label: `${p.toFixed(2)}%`, color: '#16a34a' };
  if (p < 5) return { label: `${p.toFixed(2)}%`, color: '#ca8a04' };
  return { label: `${p.toFixed(2)}%`, color: '#dc2626' };
}
</script>

<template>
  <span class="badge" :style="{ background: tier.color }">{{ tier.label }}</span>
</template>

<style scoped>
.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  color: white;
  font-variant-numeric: tabular-nums;
  font-size: 0.8rem;
}
</style>
```

- [ ] **Step 3: Thumbnail component**

```vue
<!-- packages/ui/src/components/Thumbnail.vue -->
<script setup lang="ts">
defineProps<{ src: string; alt: string }>();
</script>

<template>
  <img class="thumb" :src="`/screenshots/${src.split('/').pop()}`" :alt="alt" loading="lazy" />
</template>

<style scoped>
.thumb {
  width: 60px;
  height: 40px;
  object-fit: cover;
  object-position: top;
  border: 1px solid var(--border);
  border-radius: 3px;
}
</style>
```

- [ ] **Step 4: FilterBar component**

```vue
<!-- packages/ui/src/components/FilterBar.vue -->
<script setup lang="ts">
defineProps<{
  search: string;
  minDiff: number;
  statusFilter: 'all' | 'ok' | 'error' | 'mismatch';
}>();
defineEmits<{
  'update:search': [string];
  'update:minDiff': [number];
  'update:statusFilter': ['all' | 'ok' | 'error' | 'mismatch'];
}>();
</script>

<template>
  <div class="filter-bar">
    <input
      placeholder="Search URL..."
      :value="search"
      @input="$emit('update:search', ($event.target as HTMLInputElement).value)"
    />
    <label>
      Min diff %
      <input
        type="number"
        min="0"
        step="0.1"
        :value="minDiff"
        @input="$emit('update:minDiff', Number(($event.target as HTMLInputElement).value))"
      />
    </label>
    <label>
      Status
      <select
        :value="statusFilter"
        @change="$emit('update:statusFilter', ($event.target as HTMLSelectElement).value as any)"
      >
        <option value="all">All</option>
        <option value="ok">OK</option>
        <option value="mismatch">Status mismatch</option>
        <option value="error">Errors</option>
      </select>
    </label>
  </div>
</template>

<style scoped>
.filter-bar {
  display: flex;
  gap: 1rem;
  align-items: center;
  padding: 0.75rem 1.25rem;
  background: white;
  border-bottom: 1px solid var(--border);
}
input, select { padding: 0.25rem 0.5rem; border: 1px solid var(--border); border-radius: 4px; }
label { display: flex; align-items: center; gap: 0.4rem; font-size: 0.9rem; color: var(--muted); }
</style>
```

- [ ] **Step 5: ResultsTable component**

```vue
<!-- packages/ui/src/components/ResultsTable.vue -->
<script setup lang="ts">
import { useRouter } from 'vue-router';
import type { ComparisonRecord } from '../types.js';
import DiffBadge from './DiffBadge.vue';
import Thumbnail from './Thumbnail.vue';

defineProps<{ rows: ComparisonRecord[] }>();
const router = useRouter();

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
      </tr>
    </thead>
    <tbody>
      <tr v-for="r in rows" :key="r.url.id" @click="open(r)">
        <td>
          <Thumbnail v-if="r.viewports[0]" :src="r.viewports[0].updatedPath" :alt="r.url.updatedUrl" />
        </td>
        <td class="url">{{ r.url.originalUrl }}</td>
        <td>{{ r.url.originalStatus ?? '-' }}</td>
        <td>{{ r.url.updatedStatus ?? '-' }}</td>
        <td><DiffBadge :percent="maxDiff(r)" /></td>
        <td>{{ maxHeight(r) === 0 ? '—' : (maxHeight(r) > 0 ? '+' : '') + maxHeight(r) + 'px' }}</td>
        <td class="group">{{ r.url.group }}</td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.results { width: 100%; border-collapse: collapse; background: white; }
th, td { padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid var(--border); font-size: 0.9rem; }
th { background: #f5f5f5; font-weight: 600; position: sticky; top: 0; }
tbody tr { cursor: pointer; }
tbody tr:hover { background: #f9f9fb; }
.url, .group { font-family: ui-monospace, monospace; font-size: 0.82rem; }
.url { max-width: 420px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
```

- [ ] **Step 6: Update ResultsView to use them**

```vue
<!-- packages/ui/src/views/ResultsView.vue -->
<script setup lang="ts">
import { computed } from 'vue';
import { useRunData } from '../composables/useRunData.js';
import { useFilters } from '../composables/useFilters.js';
import FilterBar from '../components/FilterBar.vue';
import ResultsTable from '../components/ResultsTable.vue';

const { data, loading, error } = useRunData();
const rows = computed(() => data.value?.comparisons ?? []);
const { search, minDiff, statusFilter, filtered } = useFilters(rows);
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
    <div class="summary">
      {{ filtered.length }} of {{ rows.length }} URLs
      · {{ data.stats.succeeded }} ok · {{ data.stats.failed }} failed
    </div>
    <ResultsTable :rows="filtered" />
  </template>
</template>

<style scoped>
.summary { padding: 0.5rem 1.25rem; font-size: 0.85rem; color: var(--muted); }
.error { padding: 2rem; color: var(--err); }
</style>
```

- [ ] **Step 7: Typecheck + build + commit**

```bash
pnpm --filter @visidiff/ui typecheck
pnpm --filter @visidiff/ui build
git add -A
git commit -m "feat(ui): results table with filters and diff badges"
```

---

## Phase 4: Detail View

### Task 9: Viewport tabs + side-by-side view

**Files:**
- Create: `packages/ui/src/components/ViewportTabs.vue`, `packages/ui/src/components/SideBySideView.vue`

- [ ] **Step 1: ViewportTabs**

```vue
<!-- packages/ui/src/components/ViewportTabs.vue -->
<script setup lang="ts">
import type { ViewportDiff } from '../types.js';

defineProps<{ viewports: ViewportDiff[]; active: number }>();
defineEmits<{ update: [number] }>();
</script>

<template>
  <div class="tabs">
    <button
      v-for="v in viewports"
      :key="v.viewport"
      :class="{ active: v.viewport === active }"
      @click="$emit('update', v.viewport)"
    >
      {{ v.viewport }}px
    </button>
  </div>
</template>

<style scoped>
.tabs { display: flex; gap: 0.25rem; padding: 0.5rem; }
button {
  padding: 0.3rem 0.8rem;
  border: 1px solid var(--border);
  background: white;
  border-radius: 4px;
  font-size: 0.85rem;
}
button.active { background: var(--primary); color: white; border-color: var(--primary); }
</style>
```

- [ ] **Step 2: SideBySideView with synced scroll**

```vue
<!-- packages/ui/src/components/SideBySideView.vue -->
<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{ originalSrc: string; updatedSrc: string }>();

const leftRef = ref<HTMLDivElement | null>(null);
const rightRef = ref<HTMLDivElement | null>(null);
let syncing = false;

function onScroll(source: 'left' | 'right') {
  if (syncing) return;
  const src = source === 'left' ? leftRef.value : rightRef.value;
  const dst = source === 'left' ? rightRef.value : leftRef.value;
  if (!src || !dst) return;
  syncing = true;
  dst.scrollTop = src.scrollTop;
  requestAnimationFrame(() => (syncing = false));
}

function imgSrc(p: string) {
  return `/screenshots/${p.split('/').pop()}`;
}
</script>

<template>
  <div class="sbs">
    <div class="pane" ref="leftRef" @scroll="onScroll('left')">
      <img :src="imgSrc(originalSrc)" alt="Original" />
    </div>
    <div class="pane" ref="rightRef" @scroll="onScroll('right')">
      <img :src="imgSrc(updatedSrc)" alt="Updated" />
    </div>
  </div>
</template>

<style scoped>
.sbs { display: grid; grid-template-columns: 1fr 1fr; gap: 2px; height: 100%; background: var(--border); }
.pane { overflow: auto; background: white; }
img { display: block; width: 100%; }
</style>
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(ui): viewport tabs and synced side-by-side view"
```

---

### Task 10: Diff image view

**Files:**
- Create: `packages/ui/src/components/DiffImageView.vue`

- [ ] **Step 1: Implement**

```vue
<!-- packages/ui/src/components/DiffImageView.vue -->
<script setup lang="ts">
defineProps<{ diffSrc: string | null }>();
function imgSrc(p: string) {
  return `/screenshots/${p.split('/').pop()}`;
}
</script>

<template>
  <div class="diff">
    <p v-if="!diffSrc" class="empty">No diff image available.</p>
    <img v-else :src="imgSrc(diffSrc)" alt="Pixel diff" />
  </div>
</template>

<style scoped>
.diff { overflow: auto; height: 100%; background: white; }
.diff img { display: block; width: 100%; }
.empty { padding: 2rem; color: var(--muted); }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(ui): pixel diff image view"
```

---

### Task 11: Overlay slider view

**Files:**
- Create: `packages/ui/src/components/OverlaySliderView.vue`

- [ ] **Step 1: Implement with keyboard + blend-mode**

```vue
<!-- packages/ui/src/components/OverlaySliderView.vue -->
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';

const props = defineProps<{ originalSrc: string; updatedSrc: string }>();
const opacity = ref(0.5);
const blendDiff = ref(false);

function imgSrc(p: string) {
  return `/screenshots/${p.split('/').pop()}`;
}

function clamp(v: number) {
  return Math.max(0, Math.min(1, v));
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowLeft') {
    opacity.value = clamp(opacity.value - 0.1);
    e.preventDefault();
  } else if (e.key === 'ArrowRight') {
    opacity.value = clamp(opacity.value + 0.1);
    e.preventDefault();
  } else if (/^[0-9]$/.test(e.key)) {
    opacity.value = Number(e.key) / 10;
    e.preventDefault();
  } else if (e.key.toLowerCase() === 'd') {
    blendDiff.value = !blendDiff.value;
    e.preventDefault();
  }
}

onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="overlay-wrap">
    <div class="controls">
      <label>
        Opacity: {{ (opacity * 100).toFixed(0) }}%
        <input type="range" min="0" max="1" step="0.01" v-model.number="opacity" />
      </label>
      <label>
        <input type="checkbox" v-model="blendDiff" />
        Difference blend (D)
      </label>
      <span class="hint">←/→ 10% · 0-9 snap · D toggle blend</span>
    </div>
    <div class="stage">
      <img class="base" :src="imgSrc(originalSrc)" alt="Original" />
      <img
        class="over"
        :src="imgSrc(updatedSrc)"
        alt="Updated"
        :style="{ opacity, mixBlendMode: blendDiff ? 'difference' : 'normal' }"
      />
    </div>
  </div>
</template>

<style scoped>
.overlay-wrap { display: flex; flex-direction: column; height: 100%; }
.controls {
  display: flex;
  gap: 1.25rem;
  padding: 0.5rem 1rem;
  align-items: center;
  background: #f5f5f5;
  border-bottom: 1px solid var(--border);
  font-size: 0.85rem;
}
.controls label { display: flex; gap: 0.4rem; align-items: center; }
.controls input[type='range'] { width: 200px; }
.hint { color: var(--muted); margin-left: auto; font-size: 0.78rem; }
.stage { position: relative; flex: 1; overflow: auto; background: white; }
.base, .over {
  display: block;
  width: 100%;
  top: 0;
  left: 0;
}
.over { position: absolute; }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(ui): overlay slider with keyboard shortcuts and blend mode"
```

---

### Task 12: Detail view with tabs

**Files:**
- Modify: `packages/ui/src/views/DetailView.vue`

- [ ] **Step 1: Implement**

```vue
<!-- packages/ui/src/views/DetailView.vue -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useRunData } from '../composables/useRunData.js';
import ViewportTabs from '../components/ViewportTabs.vue';
import SideBySideView from '../components/SideBySideView.vue';
import DiffImageView from '../components/DiffImageView.vue';
import OverlaySliderView from '../components/OverlaySliderView.vue';
import DiffBadge from '../components/DiffBadge.vue';

const route = useRoute();
const router = useRouter();
const { data } = useRunData();

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
</script>

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
          :original-src="current.originalPath"
          :updated-src="current.updatedPath"
        />
        <DiffImageView v-else-if="mode === 'diff'" :diff-src="current.diffPath" />
        <SideBySideView
          v-else
          :original-src="current.originalPath"
          :updated-src="current.updatedPath"
        />
      </template>
    </div>
  </div>
</template>

<style scoped>
.detail { display: flex; flex-direction: column; height: calc(100vh - 52px); }
.detail-head {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border);
  background: white;
}
.detail-head button { padding: 0.25rem 0.6rem; }
.urls { flex: 1; font-family: ui-monospace, monospace; font-size: 0.82rem; }
.mode-tabs { display: flex; gap: 0.25rem; padding: 0.25rem 0.75rem; background: white; border-bottom: 1px solid var(--border); }
.mode-tabs button { padding: 0.3rem 0.8rem; border: 1px solid var(--border); background: white; border-radius: 4px; font-size: 0.85rem; }
.mode-tabs button.active { background: var(--primary); color: white; border-color: var(--primary); }
.viewer { flex: 1; overflow: hidden; }
.empty { padding: 2rem; }
</style>
```

- [ ] **Step 2: Build + commit**

```bash
pnpm --filter @visidiff/ui build
git add -A
git commit -m "feat(ui): detail view with viewport tabs and overlay/diff/sbs modes"
```

---

## Phase 5: Integration

### Task 13: Wire `compare` command to start server

**Files:**
- Modify: `packages/cli/src/commands/compare.ts`
- Modify: `packages/cli/package.json` (add `@visidiff/server` and `open`)

- [ ] **Step 1: Add deps**

```bash
pnpm --filter visidiff add @visidiff/server@workspace:* open
```

- [ ] **Step 2: Update compare command**

At end of `runCompare` in `packages/cli/src/commands/compare.ts`, after pipeline finishes and stats are logged, add:

```ts
import { startServer } from '@visidiff/server';
import open from 'open';
import { resolve as resolvePath } from 'node:path';

// ... existing code above ...

// After console.log of stats:
const uiDist = resolvePath(
  // When installed from npm, UI is co-located in node_modules/@visidiff/ui/dist
  // During dev: packages/ui/dist
  require.resolve('@visidiff/ui/package.json'),
  '..',
  'dist',
);
const { url } = await startServer({ outputDir: config.outputDir, uiDistDir: uiDist });
console.log(pc.bold(`\n🌐 Report available at ${pc.cyan(url)}`));
await open(url);
console.log(pc.dim('Press Ctrl+C to stop the server.'));

await new Promise<void>((resolve) => {
  process.once('SIGINT', () => resolve());
  process.once('SIGTERM', () => resolve());
});
```

Note: replace `require.resolve` with dynamic import resolution for ESM:

```ts
import { fileURLToPath } from 'node:url';
const uiPkg = await import.meta.resolve('@visidiff/ui/package.json');
const uiDist = resolvePath(fileURLToPath(uiPkg), '..', 'dist');
```

- [ ] **Step 3: Build UI before running compare (add prebuild hook in dev)**

In root `package.json` scripts:

```json
"prebuild:cli": "pnpm --filter @visidiff/ui build",
"build:cli": "pnpm --filter visidiff build"
```

- [ ] **Step 4: Smoke test end-to-end**

```bash
pnpm --filter @visidiff/ui build
pnpm --filter visidiff build
cd /tmp && mkdir visidiff-smoke && cd visidiff-smoke
node /c/Workspaces/visidiff/packages/cli/bin/visidiff.js init
# edit config to point to real URLs, e.g.
# original: 'https://example.com/*'
# updated: 'https://example.com/*'
node /c/Workspaces/visidiff/packages/cli/bin/visidiff.js compare --max-pages 3
```

Expected: compare runs, server starts, browser opens to `http://127.0.0.1:4321`, table shows results.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(cli): auto-start server + open browser after compare"
```

---

### Task 14: Graceful server shutdown

**Files:**
- Modify: `packages/cli/src/commands/compare.ts`

- [ ] **Step 1: Ensure Ctrl+C closes server cleanly**

Update the SIGINT handler in compare:

```ts
let serverApp: Awaited<ReturnType<typeof startServer>>['app'] | null = null;
const cleanup = async () => {
  if (serverApp) await serverApp.close();
  process.exit(0);
};
process.once('SIGINT', cleanup);
process.once('SIGTERM', cleanup);

// After startServer:
const started = await startServer({ outputDir: config.outputDir, uiDistDir: uiDist });
serverApp = started.app;
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "fix(cli): graceful server shutdown on Ctrl+C"
```

---

### Task 15: Final integration test

**Files:**
- Modify: `packages/cli/test/compare.integration.test.ts`

- [ ] **Step 1: Add assertion that server responds**

Extend the existing integration test — after compare completes, hit `/api/data` on the spawned server, then shut it down. Requires exposing a test-only path to stop the post-compare server.

Simpler alternative: add a `--no-server` flag to `compare` for non-interactive runs (CI). Update `runCompare`:

```ts
export interface CompareCliOptions {
  // ... existing ...
  noServer?: boolean;
}
// ...
if (!opts.noServer) {
  // start server + open browser + wait
}
```

And in registration:

```ts
.option('--no-server', 'Do not start the report server after compare')
```

Existing integration test passes `noServer: true`.

- [ ] **Step 2: Run all tests + commit**

```bash
pnpm test
git add -A
git commit -m "feat(cli): --no-server flag for CI/testing"
```

---

### Task 16: Update README

- [ ] **Step 1: Append to root `README.md`**

```markdown
## Report UI

After `visidiff compare` finishes, a Fastify server starts on `http://127.0.0.1:4321` and your browser opens the report:

- Filter by URL, minimum diff %, status
- Click a row to open the detail view with viewport tabs
- Three visualization modes per viewport:
  - **Overlay** (default) — opacity slider with keyboard shortcuts (`←/→`, `0-9`, `D` for difference blend)
  - **Diff** — pixel-diff PNG with red markers
  - **Side-by-side** — synchronized scroll between original and updated

Use `--no-server` to skip the server (useful in CI).
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "docs: document report UI"
```

---

## Summary

After this plan:
- `compare` command runs pipeline, then starts server, then opens browser
- Interactive report at `http://127.0.0.1:4321`
- Table with filters, sorting, status indicators
- Detail view per URL with three visualization modes
- Overlay slider with keyboard shortcuts (including `mix-blend-mode: difference`)
- Graceful shutdown on Ctrl+C

**Next:** plan 3 (`visidiff-rescreenshot`) adds re-screenshot endpoints to the server and UI buttons to trigger them.
