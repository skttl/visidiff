import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { ScreenshotCache } from '../src/screenshot/cache.js';

describe('ScreenshotCache', () => {
  it('returns null on miss', async () => {
    const cache = new ScreenshotCache(join(tmpdir(), 'visidiff-test-miss'));
    expect(await cache.get('a', 1920)).toBeNull();
  });

  it('stores and retrieves', async () => {
    const dir = join(tmpdir(), 'visidiff-test-hit');
    await mkdir(dir, { recursive: true });
    try {
      const cache = new ScreenshotCache(dir);
      await cache.set('a', 1920, Buffer.from('png'));
      const got = await cache.get('a', 1920);
      expect(got).not.toBeNull();
      expect(got!.toString()).toBe('png');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('clears all', async () => {
    const dir = join(tmpdir(), 'visidiff-test-clear');
    await mkdir(dir, { recursive: true });
    try {
      const cache = new ScreenshotCache(dir);
      await cache.set('a', 1920, Buffer.from('a'));
      await cache.set('b', 1440, Buffer.from('b'));
      await cache.clear();
      expect(await cache.get('a', 1920)).toBeNull();
      expect(await cache.get('b', 1440)).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
