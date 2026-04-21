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
